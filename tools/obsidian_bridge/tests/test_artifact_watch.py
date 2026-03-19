from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tools.obsidian_bridge.watch_notebooklm_artifacts import (
    WatchJob,
    default_sidecar_path,
    load_watch_config,
    select_artifact,
    state_key,
)


class ArtifactWatchTests(unittest.TestCase):
    def test_load_watch_config(self) -> None:
        payload = {
            "profile": "default",
            "poll_interval_seconds": 15,
            "timeout_seconds": 120,
            "jobs": [
                {
                    "notebook_id": "nb-1",
                    "artifact_id": "art-1",
                    "artifact_type": "slide_deck",
                    "output_path": "/tmp/slides.pdf",
                }
            ],
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "watch.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            config = load_watch_config(path)
        self.assertEqual(config.profile, "default")
        self.assertEqual(config.poll_interval_seconds, 15)
        self.assertEqual(config.timeout_seconds, 120)
        self.assertEqual(config.jobs[0].artifact_type, "slide_deck")

    def test_select_artifact_prefers_explicit_id(self) -> None:
        job = WatchJob(
            notebook_id="nb-1",
            artifact_type="slide_deck",
            artifact_id="wanted",
            output_path="/tmp/file.pdf",
        )
        artifacts = [
            {"artifact_id": "other", "type": "slide_deck", "created_at": "2026-03-13T00:00:00Z"},
            {"artifact_id": "wanted", "type": "slide_deck", "created_at": "2026-03-13T01:00:00Z"},
        ]
        selected = select_artifact(job, artifacts)
        assert selected is not None
        self.assertEqual(selected["artifact_id"], "wanted")

    def test_select_artifact_picks_latest_by_type(self) -> None:
        job = WatchJob(
            notebook_id="nb-1",
            artifact_type="infographic",
            output_path="/tmp/file.png",
        )
        artifacts = [
            {"artifact_id": "older", "type": "infographic", "created_at": "2026-03-12T23:00:00Z"},
            {"artifact_id": "newer", "type": "infographic", "created_at": "2026-03-13T01:00:00Z"},
            {"artifact_id": "video-1", "type": "video", "created_at": "2026-03-13T02:00:00Z"},
        ]
        selected = select_artifact(job, artifacts)
        assert selected is not None
        self.assertEqual(selected["artifact_id"], "newer")

    def test_state_key_uses_artifact_id_when_present(self) -> None:
        job = WatchJob(
            notebook_id="nb-1",
            artifact_type="report",
            artifact_id="art-1",
            output_path="/tmp/report.md",
        )
        self.assertEqual(state_key(job), "art-1")

    def test_default_sidecar_path(self) -> None:
        config_path = Path("/tmp/notebook-watch.json")
        self.assertEqual(
            default_sidecar_path(config_path, ".state.json"),
            Path("/tmp/notebook-watch.state.json"),
        )


if __name__ == "__main__":
    unittest.main()
