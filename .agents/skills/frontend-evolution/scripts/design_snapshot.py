#!/usr/bin/env python3
"""Save, inspect, restore, and diff Pencil design snapshots."""

import hashlib
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

DEFAULT_OUTPUT_DIR = os.environ.get("PENCIL_SNAPSHOT_DIR", "~/.pencil/snapshots")


def get_timestamp():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def load_metadata(snapshot_dir: Path) -> dict | None:
    metadata_path = snapshot_dir / "metadata.json"
    if not metadata_path.exists():
        return None

    with open(metadata_path, encoding="utf-8") as handle:
        return json.load(handle)


def save_snapshot(pen_file_path: str, output_dir: str = DEFAULT_OUTPUT_DIR):
    """
    保存设计稿快照

    Args:
        pen_file_path: .pen 文件路径
        output_dir: 快照输出目录
    """
    pen_path = Path(pen_file_path).expanduser()
    output_path = Path(output_dir).expanduser()

    if not pen_path.exists():
        print(f"Error: {pen_file_path} not found")
        return None

    # 创建快照目录
    project_name = pen_path.stem
    timestamp = get_timestamp()
    snapshot_dir = output_path / project_name / timestamp
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    # 复制文件
    dest_path = snapshot_dir / pen_path.name
    shutil.copy2(pen_path, dest_path)

    # 保存元数据
    metadata = {
        "original_path": str(pen_path.resolve()),
        "snapshot_path": str(dest_path),
        "timestamp": timestamp,
        "file_size": dest_path.stat().st_size,
    }

    metadata_path = snapshot_dir / "metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2, ensure_ascii=False)

    print(f"Snapshot saved: {snapshot_dir}")
    return str(snapshot_dir)


def list_snapshots(pen_file_path: str, output_dir: str = DEFAULT_OUTPUT_DIR):
    """
    列出项目的所有快照
    """
    pen_path = Path(pen_file_path).expanduser()
    project_name = pen_path.stem
    snapshots_dir = Path(output_dir).expanduser() / project_name

    if not snapshots_dir.exists():
        print(f"No snapshots found for {project_name}")
        return []

    snapshots = []
    for snap_dir in sorted(snapshots_dir.iterdir(), reverse=True):
        if snap_dir.is_dir():
            metadata = load_metadata(snap_dir)
            if metadata:
                snapshots.append(metadata)

    print(f"\nSnapshots for {project_name}:")
    for i, snap in enumerate(snapshots, 1):
        print(f"  {i}. {snap['timestamp']} - {snap['file_size']} bytes")

    return snapshots


def restore_snapshot(snapshot_path: str, target_path: str = None):
    """
    恢复快照到指定位置

    Args:
        snapshot_path: 快照路径
        target_path: 目标路径（默认覆盖原文件）
    """
    snap_dir = Path(snapshot_path)
    pen_file = None

    for f in snap_dir.iterdir():
        if f.suffix == ".pen":
            pen_file = f
            break

    if not pen_file:
        print(f"No .pen file found in {snapshot_path}")
        return

    destination = None
    if target_path:
        destination = Path(target_path).expanduser()
    else:
        metadata = load_metadata(snap_dir)
        if metadata and metadata.get("original_path"):
            destination = Path(metadata["original_path"]).expanduser()

    if destination is None:
        print("Error: no target_path provided and metadata.json has no original_path")
        return

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(pen_file, destination)
    print(f"Restored to: {destination}")


def diff_snapshots(snapshot1_path: str, snapshot2_path: str):
    """
    对比两个快照的差异
    """
    def get_file_hashes(directory):
        hashes = {}
        for f in Path(directory).iterdir():
            if f.suffix == ".pen":
                with open(f, "rb") as file:
                    hashes[f.name] = hashlib.sha256(file.read()).hexdigest()
        return hashes

    hash1 = get_file_hashes(snapshot1_path)
    hash2 = get_file_hashes(snapshot2_path)

    print("\nSnapshot comparison:")
    print(f"  Snapshot 1: {snapshot1_path}")
    print(f"  Snapshot 2: {snapshot2_path}")

    if hash1 == hash2:
        print("  Status: Identical")
    else:
        print("  Status: Different")
        for name in set(hash1.keys()) | set(hash2.keys()):
            if name in hash1 and name in hash2:
                if hash1[name] != hash2[name]:
                    print(f"    - {name}: Modified")
            elif name in hash1:
                print(f"    - {name}: Removed in snapshot2")
            else:
                print(f"    + {name}: Added in snapshot2")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 design_snapshot.py save <pen_file>")
        print("  python3 design_snapshot.py list <pen_file>")
        print("  python3 design_snapshot.py restore <snapshot_path> [target_path]")
        print("  python3 design_snapshot.py diff <snapshot1> <snapshot2>")
        sys.exit(1)

    command = sys.argv[1]

    if command == "save" and len(sys.argv) >= 3:
        save_snapshot(sys.argv[2])
    elif command == "list" and len(sys.argv) >= 3:
        list_snapshots(sys.argv[2])
    elif command == "restore" and len(sys.argv) >= 3:
        target = sys.argv[3] if len(sys.argv) >= 4 else None
        restore_snapshot(sys.argv[2], target)
    elif command == "diff" and len(sys.argv) >= 4:
        diff_snapshots(sys.argv[2], sys.argv[3])
    else:
        print("Invalid command or arguments")
        sys.exit(1)
