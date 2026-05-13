"use strict";

// src/asr-worker.ts
var sherpaOnnx = require("sherpa-onnx");
function mapVadToRule1(s) {
  const m = { 0: 1.6, 1: 1.2, 2: 0.8, 3: 0.5 };
  return m[s] ?? 0.8;
}
function mapVadToRule2(s) {
  const m = { 0: 0.8, 1: 0.6, 2: 0.4, 3: 0.25 };
  return m[s] ?? 0.4;
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
        if (msg.modelDir.split("/").some((p) => p === "..")) {
          process.stdout.write(JSON.stringify({ type: "ready", ok: false }) + "\n");
          break;
        }
        try {
          recognizer = sherpaOnnx.createOnlineRecognizer({
            modelConfig: {
              transducer: {
                encoder: msg.modelDir + "encoder-epoch-99-avg-1.int8.onnx",
                decoder: msg.modelDir + "decoder-epoch-99-avg-1.onnx",
                joiner: msg.modelDir + "joiner-epoch-99-avg-1.int8.onnx"
              },
              tokens: msg.modelDir + "tokens.txt",
              modelingUnit: msg.language === "zh" ? "cjkchar" : "bpe",
              numThreads: 1,
              provider: "cpu",
              debug: 0
            },
            featConfig: { sampleRate: 16e3, featureDim: 80 },
            decodingMethod: "greedy_search",
            maxActivePaths: 4,
            enableEndpoint: 1,
            rule1MinTrailingSilence: mapVadToRule1(msg.vadSensitivity ?? 2),
            rule2MinTrailingSilence: mapVadToRule2(msg.vadSensitivity ?? 2),
            rule3MinUtteranceLength: 2
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
        while (recognizer.isReady(stream)) recognizer.decode(stream);
        const r = recognizer.getResult(stream);
        const isEndpoint = recognizer.isEndpoint(stream);
        if (isEndpoint) recognizer.reset(stream);
        process.stdout.write(JSON.stringify({ type: "result", text: r.text || "", isEndpoint }) + "\n");
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
