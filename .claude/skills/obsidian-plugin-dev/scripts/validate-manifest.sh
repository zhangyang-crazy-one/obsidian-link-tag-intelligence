#!/bin/bash
# validate-manifest.sh - 验证 manifest.json 和 versions.json 的版本一致性

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST_FILE="$PROJECT_DIR/manifest.json"
VERSIONS_FILE="$PROJECT_DIR/versions.json"

# 检查 manifest.json 是否存在
if [[ ! -f "$MANIFEST_FILE" ]]; then
  echo "❌ manifest.json not found at $MANIFEST_FILE"
  exit 1
fi

# 检查 versions.json 是否存在
if [[ ! -f "$VERSIONS_FILE" ]]; then
  echo "❌ versions.json not found at $VERSIONS_FILE"
  exit 1
fi

# 提取版本号
MANIFEST_VERSION=$(jq -r '.version' "$MANIFEST_FILE")
LATEST_VERSION=$(jq -r '.[0]' "$VERSIONS_FILE")

# 比较版本
if [[ "$MANIFEST_VERSION" != "$LATEST_VERSION" ]]; then
  echo "❌ Version mismatch!"
  echo "   manifest.json version: $MANIFEST_VERSION"
  echo "   versions.json latest:  $LATEST_VERSION"
  exit 1
fi

# 验证 manifest.json 必要字段
REQUIRED_FIELDS=("id" "name" "version" "minAppVersion" "author" "description")
for field in "${REQUIRED_FIELDS[@]}"; do
  if ! jq -e ".$field" "$MANIFEST_FILE" > /dev/null 2>&1; then
    echo "❌ manifest.json missing required field: $field"
    exit 1
  fi
done

# 验证格式
if ! jq empty "$MANIFEST_FILE" 2>/dev/null; then
  echo "❌ manifest.json is not valid JSON"
  exit 1
fi

if ! jq empty "$VERSIONS_FILE" 2>/dev/null; then
  echo "❌ versions.json is not valid JSON"
  exit 1
fi

echo "✅ manifest.json and versions.json are valid and consistent"
echo "   Version: $MANIFEST_VERSION"
exit 0
