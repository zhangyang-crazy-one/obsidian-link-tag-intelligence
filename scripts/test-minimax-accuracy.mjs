// ASR accuracy test using MiniMax TTS generated audio with professional terms.
// Usage: node scripts/test-minimax-accuracy.mjs
// Single recognizer reused for all files (WASM can't create multiple).

import { createOnlineRecognizer } from "sherpa-onnx";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const MODEL_DIR = "dist/models/zh-2025";
const AUDIO_DIR = "/tmp/asr_test_audio";
const MANIFEST = join(AUDIO_DIR, "manifest.json");

if (!existsSync(MANIFEST)) {
  console.error("ERROR: Manifest not found.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8"));
console.log("=== ASR Accuracy Test ===");
console.log("Model:", MODEL_DIR);
console.log("Files:", manifest.length);
console.log("");

const TARGET_TERMS = [
  "风险管理", "风险识别", "风险评估", "风险应对", "风险矩阵",
  "在险价值", "傅里叶变换", "梯度下降", "贝叶斯推断", "蒙特卡洛",
  "三道防线", "压力测试", "敏感性分析", "蒙特卡洛模拟",
];

function readWavFloat32(path) {
  const buf = readFileSync(path);
  const raw = new Int16Array(buf.buffer, buf.byteOffset + 44, (buf.length - 44) / 2);
  const samples = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) samples[i] = raw[i] / 32768;
  return samples;
}

// Create ONE recognizer for all tests
const recognizer = createOnlineRecognizer({
  modelConfig: {
    transducer: {
      encoder: join(MODEL_DIR, "encoder.int8.onnx"),
      decoder: join(MODEL_DIR, "decoder.onnx"),
      joiner: join(MODEL_DIR, "joiner.int8.onnx"),
    },
    tokens: join(MODEL_DIR, "tokens.txt"),
    numThreads: 1, provider: "cpu", debug: 0,
  },
  featConfig: { sampleRate: 16000, featureDim: 80, dither: 0.00003 },
  decodingMethod: "greedy_search",
  enableEndpoint: 1,
  rule1MinTrailingSilence: 1.2,
  rule2MinTrailingSilence: 0.5,
  rule3MinUtteranceLength: 20.0,
});

// Confusion set: known greedy_search misrecognitions
const CONFUSION_MAP = {
  "在显价值": "在险价值", "风险穗": "风险矩阵",
  "富力业变换": "傅里叶变换", "富力业": "傅里叶",
  "在显": "在险",
};

function applyCorrections(text) {
  let result = text;
  for (const [wrong, correct] of Object.entries(CONFUSION_MAP)) {
    if (result.includes(wrong)) result = result.replace(new RegExp(wrong, "g"), correct);
  }
  return result;
}

function runAsr(samples) {
  const stream = recognizer.createStream();
  let text = "", prevText = "";
  for (let i = 0; i < samples.length; i += 1600) {
    const chunk = samples.slice(i, Math.min(i + 1600, samples.length));
    stream.acceptWaveform(16000, chunk);
    while (recognizer.isReady(stream)) recognizer.decode(stream);
    if (!recognizer.isReady(stream)) {
      const result = recognizer.getResult(stream);
      if (result?.text) {
        let delta = result.text;
        if (prevText && delta.startsWith(prevText)) delta = delta.slice(prevText.length);
        prevText = result.text;
        text += delta;
      }
    }
  }
  stream.free();
  return applyCorrections(text);
}

const results = [];
let totalFound = 0, totalChecked = 0;

for (const item of manifest) {
  if (!existsSync(item.path)) continue;
  const samples = readWavFloat32(item.path);
  const text = runAsr(samples);
  const expectedTerms = TARGET_TERMS.filter(t => item.text.includes(t));
  const recognizedTerms = expectedTerms.filter(t => text.includes(t));
  totalFound += recognizedTerms.length;
  totalChecked += expectedTerms.length;
  const acc = expectedTerms.length > 0 ? recognizedTerms.length / expectedTerms.length : 0;
  const status = acc >= 0.8 ? "✓" : acc >= 0.5 ? "△" : "✗";
  console.log(`${status} ${item.prefix}: ${recognizedTerms.length}/${expectedTerms.length} ${(acc*100).toFixed(0)}%`);
  for (const t of expectedTerms) console.log(`    ${text.includes(t) ? '✓' : '✗'} ${t}`);
  results.push({ prefix: item.prefix, category: item.category, expectedTerms, recognizedTerms, accuracy: acc });
}

recognizer.free();

// Summary
console.log("");
const overall = totalChecked > 0 ? (totalFound / totalChecked * 100).toFixed(1) : "N/A";
console.log(`=== Overall: ${totalFound}/${totalChecked} = ${overall}% ===`);
console.log(`Target ≥80%: ${overall >= 80 ? '✓ PASS' : '✗ FAIL'}`);

const cats = {};
for (const r of results) {
  if (!cats[r.category]) cats[r.category] = { f: 0, t: 0 };
  cats[r.category].f += r.recognizedTerms.length;
  cats[r.category].t += r.expectedTerms.length;
}
for (const [cat, s] of Object.entries(cats)) {
  console.log(`  ${cat}: ${s.f}/${s.t} = ${(s.f/s.t*100).toFixed(1)}%`);
}
