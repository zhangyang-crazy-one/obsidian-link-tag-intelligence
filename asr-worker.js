"use strict";

// src/asr-worker.ts
var sherpaOnnx = require("sherpa-onnx");
function mapVadToRule1(s) {
  const m = { 0: 2.4, 1: 1.8, 2: 1.5, 3: 0.8 };
  return m[s] ?? 1.5;
}
function mapVadToRule2(s) {
  const m = { 0: 1.2, 1: 0.8, 2: 0.6, 3: 0.4 };
  return m[s] ?? 0.6;
}
var recognizer = null;
var stream = null;
var rl = require("readline").createInterface({ input: process.stdin });
rl.on("line", (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  try {
    switch (msg.type) {
      case "init": {
        if (!msg.modelDir || !msg.language) {
          process.stdout.write(JSON.stringify({ type: "ready", ok: false }) + "\n");
          break;
        }
        const hotwordsFile = msg.hotwordsFile;
        if (msg.modelDir.split("/").some((p) => p === "..")) {
          process.stdout.write(JSON.stringify({ type: "ready", ok: false }) + "\n");
          break;
        }
        try {
          recognizer = sherpaOnnx.createOnlineRecognizer({
            modelConfig: {
              transducer: {
                encoder: msg.modelDir + "encoder.int8.onnx",
                decoder: msg.modelDir + "decoder.onnx",
                joiner: msg.modelDir + "joiner.int8.onnx"
              },
              tokens: msg.modelDir + "tokens.txt",
              // Model: icefall multi-zh-hans zipformer-large, char-based CJK.
              // Hotwords need cjkchar tokenization; tokens.txt has 1740 chars + 256 byte fallbacks.
              modelingUnit: "cjkchar",
              numThreads: 1,
              provider: "cpu",
              debug: 0
            },
            featConfig: { sampleRate: 16e3, featureDim: 80 },
            decodingMethod: "modified_beam_search",
            maxActivePaths: 8,
            enableEndpoint: 1,
            rule1MinTrailingSilence: mapVadToRule1(msg.vadSensitivity ?? 2),
            rule2MinTrailingSilence: mapVadToRule2(msg.vadSensitivity ?? 2),
            rule3MinUtteranceLength: 4,
            hotwordsScore: 1.5,
            ...hotwordsFile ? { hotwordsFile } : {}
          });
          stream = recognizer ? recognizer.createStream() : null;
          process.stdout.write(JSON.stringify({ type: "ready", ok: !!recognizer }) + "\n");
        } catch (e) {
          process.stdout.write(JSON.stringify({ type: "ready", ok: false, error: String(e) }) + "\n");
        }
        break;
      }
      case "audio": {
        if (!recognizer || !stream || !msg.bufferB64) break;
        const buf = Buffer.from(msg.bufferB64, "base64");
        const samples = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
        stream.acceptWaveform(16e3, samples);
        let decoded = false;
        while (recognizer.isReady(stream)) {
          recognizer.decode(stream);
          decoded = true;
        }
        if (decoded) {
          const r = recognizer.getResult(stream);
          const isEndpoint = recognizer.isEndpoint(stream);
          if (isEndpoint) recognizer.reset(stream);
          if (r.text) {
            process.stdout.write(JSON.stringify({ type: "result", text: r.text, isEndpoint }) + "\n");
          }
        }
        break;
      }
      case "reset":
        if (recognizer && stream) recognizer.reset(stream);
        break;
      case "destroy": {
        if (stream) {
          stream.free();
          stream = null;
        }
        if (recognizer) {
          recognizer.free();
          recognizer = null;
        }
        process.stdout.write(JSON.stringify({ type: "destroyed" }) + "\n");
        process.exit(0);
      }
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ type: "error", error: String(e) }) + "\n");
  }
});
