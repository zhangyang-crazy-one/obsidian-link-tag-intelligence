// Transcription accuracy test for sherpa-onnx CTC ASR model.
// Tests 5 professional terms at 4 audio levels (-10 to -40dB).
// Usage: node scripts/test-transcription.mjs

import { createOnlineRecognizer } from "sherpa-onnx";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, rmSync } from "fs";

const MODEL_DIR = "dist/models/zh-2025";
const TEST_WAV = "/tmp/asr-hotword-test/combined.wav";
const HOTWORDS = ["风险管理", "傅里叶变换", "梯度下降", "贝叶斯推断", "蒙特卡洛"];
const DB_LEVELS = [-10, -20, -30, -40];

if (!existsSync(TEST_WAV)) {
  console.error("ERROR: Test WAV not found:", TEST_WAV);
  process.exit(1);
}

console.log("=== ASR Transcription Accuracy Test ===");
console.log("Model:", MODEL_DIR);
console.log("Target terms:", HOTWORDS.join(", "));
console.log("");

// ---- Helper: read WAV as Float32Array ----
function readWavFloat32(path) {
  const buf = readFileSync(path);
  // Skip WAV header (44 bytes), read PCM data
  const dataOffset = 44;
  const int16 = new Int16Array(buf.buffer, buf.byteOffset + dataOffset,
    (buf.length - dataOffset) / 2);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

// ---- Helper: adjust gain ----
function adjustGain(samples, db) {
  const factor = Math.pow(10, db / 20);
  const result = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    result[i] = Math.max(-1, Math.min(1, samples[i] * factor));
  }
  return result;
}

// ---- Helper: calculate RMS ----
function calcRms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// ---- Test each dB level ----
const original = readWavFloat32(TEST_WAV);
console.log("Source audio:", TEST_WAV);
console.log("  Duration:", (original.length / 16000).toFixed(1) + "s");
console.log("  RMS:", (calcRms(original) * 100).toFixed(1) + "%", "(", (20 * Math.log10(calcRms(original))).toFixed(1), "dBFS)");
console.log("");

const results = [];

for (const db of DB_LEVELS) {
  console.log(`--- Level: ${db}dB ---`);

  // Create recognizer
  const recognizer = createOnlineRecognizer({
    modelConfig: {
      transducer: {
        encoder: join(MODEL_DIR, "encoder.int8.onnx"),
        decoder: join(MODEL_DIR, "decoder.onnx"),
        joiner: join(MODEL_DIR, "joiner.int8.onnx"),
      },
      tokens: join(MODEL_DIR, "tokens.txt"),
      numThreads: 1,
      provider: "cpu",
      debug: 0,
    },
    featConfig: { sampleRate: 16000, featureDim: 80, dither: 0.00003 },
    decodingMethod: "greedy_search",
    enableEndpoint: 1,
    rule1MinTrailingSilence: 0.8,
    rule2MinTrailingSilence: 0.3,
    rule3MinUtteranceLength: 20.0,
  });

  if (!recognizer) {
    console.log("  ERROR: recognizer creation failed");
    results.push({ db, rmsDb: 0, text: "ERROR", found: 0, total: HOTWORDS.length });
    continue;
  }
  const stream = recognizer.createStream();
  if (!stream) {
    console.log("  ERROR: stream creation failed");
    recognizer.free();
    results.push({ db, rmsDb: 0, text: "ERROR", found: 0, total: HOTWORDS.length });
    continue;
  }
  const adjusted = adjustGain(original, db);
  const rmsDb = 20 * Math.log10(Math.max(calcRms(adjusted), 1e-10));
  console.log(`  Actual RMS: ${rmsDb.toFixed(1)} dBFS`);

  // Feed audio in chunks (100ms = 1600 samples)
  const CHUNK = 1600;
  let fullText = "";
  let prevText = "";
  let isEndpoint = false;

  for (let i = 0; i < adjusted.length; i += CHUNK) {
    const chunk = adjusted.slice(i, Math.min(i + CHUNK, adjusted.length));
    stream.acceptWaveform(16000, chunk);
    while (recognizer.isReady(stream)) {
      recognizer.decode(stream);
    }
    const isReady = recognizer.isReady(stream);
    if (!isReady) {
      try {
        const result = recognizer.getResult(stream);
        if (result && result.text) {
          // getResult is cumulative — compute delta
          let delta = result.text;
          if (prevText && delta.startsWith(prevText)) {
            delta = delta.slice(prevText.length);
          }
          prevText = result.text;
          fullText += delta;
        }
      } catch (e) { /* skip */ }
    }
    try {
      if (recognizer.isEndpoint(stream) && !isEndpoint) {
        isEndpoint = true;
        prevText = "";
        recognizer.reset(stream);
      }
    } catch (e) { /* skip */ }
  }

  console.log(`  Recognized: ${fullText.slice(0, 120)}`);

  // Check hotwords
  let found = 0;
  for (const hw of HOTWORDS) {
    if (fullText.includes(hw)) {
      console.log(`    ✓ ${hw}`);
      found++;
    } else {
      console.log(`    ✗ ${hw}`);
    }
  }
  results.push({ db, rmsDb, text: fullText, found, total: HOTWORDS.length });

  stream.free();
  recognizer.free();
}

// ---- Summary ----
console.log("");
console.log("=== Summary ===");
console.log("dB Level | RMS (dBFS) | Hotwords Found | Text (first 80 chars)");
console.log("-".repeat(80));
for (const r of results) {
  const status = `${r.found}/${r.total}`;
  console.log(`${r.db}dB`.padEnd(9) + "| " +
    r.rmsDb.toFixed(1).padEnd(12) + "| " +
    status.padEnd(15) + "| " +
    r.text.slice(0, 80));
}
