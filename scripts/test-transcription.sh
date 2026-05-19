#!/usr/bin/env bash
# Transcription accuracy test for sherpa-onnx CTC ASR worker.
# Tests recognition of professional terms at different audio levels.
# Usage: bash scripts/test-transcription.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WORKER="${PROJECT_DIR}/dist/asr-worker.js"
MODEL_DIR="${PROJECT_DIR}/dist/models/zh-ctc-small/sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01"
TEST_WAV="${MODEL_DIR}/test_wavs/0.wav"
TMPDIR="/tmp/asr-test-$$"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== ASR Transcription Accuracy Test ==="
echo "Model: sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01"
echo "Target terms: 风险管理, 傅里叶变换, 梯度下降, 贝叶斯推断, 蒙特卡洛"
echo ""

# Pick hotwords to test (3-5 professional terms)
HOTWORDS=("风险管理" "傅里叶变换" "梯度下降" "贝叶斯推断" "蒙特卡洛")

# Test at different dB levels: -10 (loud), -20 (normal), -30 (quiet), -40 (very quiet)
DB_LEVELS=(-10 -20 -30 -40)

# Check prerequisites
if [[ ! -f "$WORKER" ]]; then
  echo -e "${RED}ERROR: Worker not found at $WORKER${NC}"
  exit 1
fi
if [[ ! -f "$TEST_WAV" ]]; then
  echo -e "${RED}ERROR: Test WAV not found at $TEST_WAV${NC}"
  exit 1
fi

mkdir -p "$TMPDIR"

# Generate test audio at different dB levels
echo "--- Generating test audio at different dB levels ---"
for db in "${DB_LEVELS[@]}"; do
  ffmpeg -y -i "$TEST_WAV" -af "volume=${db}dB" -ac 1 -ar 16000 -sample_fmt s16 \
    "${TMPDIR}/test_${db}dB.wav" 2>/dev/null
  echo "  Generated: test_${db}dB.wav"
done

# Run ASR test for each dB level
echo ""
echo "--- Running ASR recognition tests ---"

for db in "${DB_LEVELS[@]}"; do
  echo ""
  echo -e "${YELLOW}Level: ${db}dB${NC}"

  # Convert WAV to raw float32 samples and send to ASR worker
  # The worker expects base64-encoded Float32Array chunks via stdin JSON lines

  # Initialize worker
  INIT_MSG=$(cat <<EOF
{"type":"init","modelDir":"${MODEL_DIR}/","language":"zh","vadSensitivity":2}
EOF
)

  # Run worker and feed audio
  OUTPUT=$(mktemp)
  timeout 30 node "$WORKER" > "$OUTPUT" 2>/dev/null &
  WORKER_PID=$!
  sleep 2

  # Send init
  echo "$INIT_MSG" > /proc/$WORKER_PID/fd/0 2>/dev/null || true

  # Wait for ready signal
  sleep 2

  # Read test WAV, convert to float32 chunks, send as base64
  ffmpeg -i "${TMPDIR}/test_${db}dB.wav" -ac 1 -ar 16000 -f f32le pipe:1 2>/dev/null | \
    while read -r -n 16384 chunk 2>/dev/null; do
      if [[ -n "$chunk" ]]; then
        B64=$(echo -n "$chunk" | base64 -w0 2>/dev/null || true)
        echo "{\"type\":\"audio\",\"bufferB64\":\"$B64\"}" > /proc/$WORKER_PID/fd/0 2>/dev/null || true
      fi
    done || true

  sleep 3

  # Send destroy
  echo '{"type":"destroy"}' > /proc/$WORKER_PID/fd/0 2>/dev/null || true

  wait $WORKER_PID 2>/dev/null || true

  # Parse results
  RESULT_TEXT=$(grep '"type":"result"' "$OUTPUT" 2>/dev/null | python3 -c "
import sys, json
texts = []
for line in sys.stdin:
    try:
        msg = json.loads(line.strip())
        if msg.get('type') == 'result':
            texts.append(msg.get('text', ''))
    except: pass
print(''.join(texts))
" 2>/dev/null || echo "NO_RESULT")

  echo "  Recognized: ${RESULT_TEXT:0:200}"

  # Check hotwords
  for hw in "${HOTWORDS[@]}"; do
    if echo "$RESULT_TEXT" | grep -q "$hw" 2>/dev/null; then
      echo -e "    ${GREEN}✓${NC} $hw"
    else
      echo -e "    ${RED}✗${NC} $hw (not found)"
    fi
  done

  rm -f "$OUTPUT"
done

# Cleanup
rm -rf "$TMPDIR"
echo ""
echo "=== Test Complete ==="
