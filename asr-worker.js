"use strict";

// src/asr-worker.ts
var sherpaOnnx = require("sherpa-onnx");
function mapVadSensitivityToRule1(s) {
  const m = { 0: 1.6, 1: 1.2, 2: 0.8, 3: 0.5 };
  return m[s] ?? 0.8;
}
function mapVadSensitivityToRule2(s) {
  const m = { 0: 0.8, 1: 0.6, 2: 0.4, 3: 0.25 };
  return m[s] ?? 0.4;
}
var recognizer = null;
var stream = null;
function init(cfg) {
  if (cfg.modelDir.split("/").some((p) => p === "..")) return false;
  try {
    recognizer = sherpaOnnx.createOnlineRecognizer(sherpaOnnx.wasmModule, {
      modelConfig: {
        transducer: {
          encoder: cfg.modelDir + "encoder-epoch-99-avg-1.int8.onnx",
          decoder: cfg.modelDir + "decoder-epoch-99-avg-1.onnx",
          joiner: cfg.modelDir + "joiner-epoch-99-avg-1.int8.onnx"
        },
        tokens: cfg.modelDir + "tokens.txt",
        modelingUnit: cfg.language === "zh" ? "cjkchar" : "bpe",
        numThreads: 1,
        provider: "cpu",
        debug: 0
      },
      featConfig: { sampleRate: 16e3, featureDim: 80 },
      decodingMethod: "greedy_search",
      maxActivePaths: 4,
      enableEndpoint: 1,
      rule1MinTrailingSilence: mapVadSensitivityToRule1(cfg.vadSensitivity),
      rule2MinTrailingSilence: mapVadSensitivityToRule2(cfg.vadSensitivity),
      rule3MinUtteranceLength: 2
    });
    if (!recognizer) return false;
    stream = recognizer.createStream();
    return true;
  } catch {
    return false;
  }
}
function processAudio(buf) {
  if (!recognizer || !stream) return { text: "", isEndpoint: false };
  const samples = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  stream.acceptWaveform(16e3, samples);
  while (recognizer.isReady(stream)) recognizer.decode(stream);
  const r = recognizer.getResult(stream);
  const isEndpoint = recognizer.isEndpoint(stream);
  if (isEndpoint) recognizer.reset(stream);
  return { text: r.text || "", isEndpoint };
}
function destroy() {
  if (stream) {
    stream.free();
    stream = null;
  }
  if (recognizer) {
    recognizer.free();
    recognizer = null;
  }
}
process.on("message", (msg) => {
  try {
    switch (msg.type) {
      case "init": {
        const ok = init({
          modelDir: msg.modelDir,
          language: msg.language,
          vadSensitivity: msg.vadSensitivity ?? 2
        });
        process.send({ type: "ready", ok });
        break;
      }
      case "audio": {
        if (msg.buffer) {
          const r = processAudio(Buffer.from(msg.buffer));
          process.send({ type: "result", text: r.text, isEndpoint: r.isEndpoint });
        }
        break;
      }
      case "reset": {
        if (recognizer && stream) recognizer.reset(stream);
        break;
      }
      case "destroy": {
        destroy();
        process.send({ type: "destroyed" });
        break;
      }
    }
  } catch (e) {
    process.send({ type: "error", message: String(e) });
  }
});
process.send({ type: "started" });
