#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
NLM_ROOT = REPO_ROOT / "tools" / "notebooklm-mcp-cli"
NLM_SRC = NLM_ROOT / "src"
NLM_VENV_LIB = NLM_ROOT / ".venv" / "lib"
NLM_STATE = NLM_ROOT / ".state"


def bootstrap_notebooklm_paths() -> None:
    os.environ["NOTEBOOKLM_MCP_CLI_PATH"] = str(NLM_STATE)
    proxy = os.environ.get("ALL_PROXY") or os.environ.get("all_proxy") or "socks5://127.0.0.1:7897"
    if proxy.startswith("socks://"):
        proxy = f"socks5://{proxy[len('socks://'):]}"
    os.environ["ALL_PROXY"] = proxy
    os.environ["all_proxy"] = proxy
    if str(NLM_SRC) not in sys.path:
        sys.path.insert(0, str(NLM_SRC))
    if NLM_VENV_LIB.exists():
        for site_packages in sorted(NLM_VENV_LIB.glob("python*/site-packages")):
            if str(site_packages) not in sys.path:
                sys.path.insert(0, str(site_packages))


bootstrap_notebooklm_paths()

from notebooklm_tools.cli.utils import get_client  # noqa: E402
from notebooklm_tools.services import downloads as downloads_service  # noqa: E402
from notebooklm_tools.services import studio as studio_service  # noqa: E402


VALID_TYPES = set(downloads_service.VALID_ARTIFACT_TYPES)
SYNC_TYPES = {"report", "mind_map", "data_table"}


@dataclass
class WatchJob:
    notebook_id: str
    artifact_type: str
    output_path: str
    artifact_id: str | None = None
    output_format: str = "json"
    slide_deck_format: str = "pdf"


@dataclass
class WatchConfig:
    jobs: list[WatchJob]
    poll_interval_seconds: int = 30
    timeout_seconds: int = 3600
    profile: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Watch NotebookLM artifacts and download them automatically when ready."
    )
    parser.add_argument("--config", required=True, help="Path to watcher JSON config")
    parser.add_argument("--detach", action="store_true", help="Run the watcher in the background")
    parser.add_argument("--state-file", help="Optional state JSON path")
    parser.add_argument("--log-file", help="Optional detached log path")
    parser.add_argument("--once", action="store_true", help="Poll one time and exit")
    return parser.parse_args()


def default_sidecar_path(config_path: Path, suffix: str) -> Path:
    return config_path.with_name(f"{config_path.stem}{suffix}")


def load_watch_config(path: Path) -> WatchConfig:
    raw = json.loads(path.read_text(encoding="utf-8"))
    jobs_raw = raw.get("jobs")
    if not isinstance(jobs_raw, list) or not jobs_raw:
        raise ValueError("Config must include a non-empty 'jobs' list.")

    jobs: list[WatchJob] = []
    for index, item in enumerate(jobs_raw, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Job #{index} must be an object.")
        notebook_id = str(item.get("notebook_id") or "").strip()
        artifact_type = str(item.get("artifact_type") or "").strip()
        output_path = str(item.get("output_path") or "").strip()
        artifact_id = str(item.get("artifact_id") or "").strip() or None
        output_format = str(item.get("output_format") or "json").strip() or "json"
        slide_deck_format = str(item.get("slide_deck_format") or "pdf").strip() or "pdf"

        if not notebook_id:
            raise ValueError(f"Job #{index} is missing notebook_id.")
        if artifact_type not in VALID_TYPES:
            raise ValueError(
                f"Job #{index} has invalid artifact_type '{artifact_type}'. Valid: {', '.join(sorted(VALID_TYPES))}"
            )
        if not output_path:
            raise ValueError(f"Job #{index} is missing output_path.")

        jobs.append(
            WatchJob(
                notebook_id=notebook_id,
                artifact_type=artifact_type,
                output_path=output_path,
                artifact_id=artifact_id,
                output_format=output_format,
                slide_deck_format=slide_deck_format,
            )
        )

    poll_interval = int(raw.get("poll_interval_seconds", 30))
    timeout = int(raw.get("timeout_seconds", 3600))
    profile = str(raw.get("profile")).strip() if raw.get("profile") is not None else None
    return WatchConfig(
        jobs=jobs,
        poll_interval_seconds=max(1, poll_interval),
        timeout_seconds=max(0, timeout),
        profile=profile,
    )


def state_key(job: WatchJob) -> str:
    return job.artifact_id or f"{job.notebook_id}:{job.artifact_type}:{job.output_path}"


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"jobs": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def update_job_state(
    state: dict[str, Any],
    job: WatchJob,
    *,
    status: str,
    message: str,
    artifact_id: str | None = None,
    downloaded_path: str | None = None,
) -> None:
    jobs = state.setdefault("jobs", {})
    key = state_key(job)
    jobs[key] = {
        "notebook_id": job.notebook_id,
        "artifact_type": job.artifact_type,
        "artifact_id": artifact_id or job.artifact_id,
        "output_path": job.output_path,
        "status": status,
        "message": message,
        "downloaded_path": downloaded_path,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def artifact_sort_key(artifact: dict[str, Any]) -> tuple[str, str]:
    created_at = str(artifact.get("created_at") or "")
    artifact_id = str(artifact.get("artifact_id") or "")
    return (created_at, artifact_id)


def select_artifact(job: WatchJob, artifacts: list[dict[str, Any]]) -> dict[str, Any] | None:
    if job.artifact_id:
        for artifact in artifacts:
            if str(artifact.get("artifact_id")) == job.artifact_id:
                return artifact
        return None

    candidates = [artifact for artifact in artifacts if artifact.get("type") == job.artifact_type]
    if not candidates:
        return None
    candidates.sort(key=artifact_sort_key, reverse=True)
    return candidates[0]


def detach_process(script_path: Path, config_path: Path, state_path: Path, log_path: Path, once: bool) -> int:
    command = [
        sys.executable,
        str(script_path),
        "--config",
        str(config_path),
        "--state-file",
        str(state_path),
    ]
    if once:
        command.append("--once")
    with log_path.open("a", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            cwd=REPO_ROOT,
            start_new_session=True,
            close_fds=True,
        )
    return process.pid


def ensure_parent_directory(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def download_job(job: WatchJob, client: Any, artifact_id: str | None = None) -> str:
    output_path = Path(job.output_path).expanduser().resolve()
    ensure_parent_directory(output_path)
    target_artifact_id = artifact_id or job.artifact_id
    if job.artifact_type in SYNC_TYPES:
        result = downloads_service.download_sync(
            client=client,
            notebook_id=job.notebook_id,
            artifact_type=job.artifact_type,
            output_path=str(output_path),
            artifact_id=target_artifact_id,
            output_format=job.output_format,
        )
    else:
        result = asyncio.run(
            downloads_service.download_async(
                client=client,
                notebook_id=job.notebook_id,
                artifact_type=job.artifact_type,
                output_path=str(output_path),
                artifact_id=target_artifact_id,
                output_format=job.output_format,
                slide_deck_format=job.slide_deck_format,
            )
        )
    return str(result["path"])


def print_event(message: str) -> None:
    timestamp = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    print(f"[{timestamp}] {message}", flush=True)


def run_watch(config: WatchConfig, state_path: Path, once: bool) -> int:
    client = get_client(config.profile)
    state = load_state(state_path)
    started_at = time.time()
    completed_keys: set[str] = set()

    for job in config.jobs:
        output = Path(job.output_path).expanduser().resolve()
        if output.exists() and output.stat().st_size > 0:
            completed_keys.add(state_key(job))
            update_job_state(
                state,
                job,
                status="completed",
                message="File already exists; watcher treated job as done.",
                downloaded_path=str(output),
                artifact_id=job.artifact_id,
            )
    save_state(state_path, state)

    while True:
        grouped: dict[str, list[dict[str, Any]]] = {}
        notebook_ids = sorted({job.notebook_id for job in config.jobs})
        for notebook_id in notebook_ids:
            status = studio_service.get_studio_status(client, notebook_id)
            grouped[notebook_id] = status["artifacts"]

        made_progress = False
        for job in config.jobs:
            key = state_key(job)
            if key in completed_keys:
                continue

            artifact = select_artifact(job, grouped.get(job.notebook_id, []))
            if artifact is None:
                update_job_state(
                    state,
                    job,
                    status="waiting",
                    message="Artifact not visible in studio status yet.",
                    artifact_id=job.artifact_id,
                )
                continue

            found_artifact_id = str(artifact.get("artifact_id") or "")
            artifact_status = str(artifact.get("status") or "unknown")
            title = str(artifact.get("title") or job.artifact_type)
            if artifact_status != "completed":
                update_job_state(
                    state,
                    job,
                    status=artifact_status,
                    message=f"{title} is {artifact_status}.",
                    artifact_id=job.artifact_id,
                )
                continue

            try:
                saved_path = download_job(job, client, found_artifact_id or job.artifact_id)
            except Exception as error:
                update_job_state(
                    state,
                    job,
                    status="download_failed",
                    message=str(error),
                    artifact_id=job.artifact_id,
                )
                print_event(f"download failed for {job.artifact_type} {job.artifact_id or ''}: {error}")
                continue

            completed_keys.add(key)
            made_progress = True
            update_job_state(
                state,
                job,
                status="completed",
                message=f"Downloaded {title}.",
                artifact_id=job.artifact_id,
                downloaded_path=saved_path,
            )
            print_event(f"downloaded {job.artifact_type} {job.artifact_id} -> {saved_path}")

        save_state(state_path, state)

        if len(completed_keys) == len(config.jobs):
            print_event("all watcher jobs completed")
            return 0
        if once:
            print_event("single poll requested; exiting")
            return 0
        if config.timeout_seconds and (time.time() - started_at) >= config.timeout_seconds:
            print_event("watcher timed out before all jobs completed")
            return 2
        if not made_progress:
            time.sleep(config.poll_interval_seconds)


def main() -> int:
    args = parse_args()
    config_path = Path(args.config).expanduser().resolve()
    state_path = Path(args.state_file).expanduser().resolve() if args.state_file else default_sidecar_path(
        config_path, ".state.json"
    )
    log_path = Path(args.log_file).expanduser().resolve() if args.log_file else default_sidecar_path(
        config_path, ".log"
    )

    if args.detach:
        pid = detach_process(Path(__file__).resolve(), config_path, state_path, log_path, args.once)
        payload = {
            "status": "detached",
            "pid": pid,
            "config": str(config_path),
            "state_file": str(state_path),
            "log_file": str(log_path),
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    config = load_watch_config(config_path)
    print_event(f"watching {len(config.jobs)} artifact job(s)")
    return run_watch(config, state_path, args.once)


if __name__ == "__main__":
    raise SystemExit(main())
