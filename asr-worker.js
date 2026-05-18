"use strict";

// src/asr-worker.ts
var sherpaOnnx = require("sherpa-onnx");
function mapVadToRule1(s) {
  const m = { 0: 2, 1: 1.2, 2: 0.8, 3: 0.5 };
  return m[s] ?? 0.8;
}
function mapVadToRule2(s) {
  const m = { 0: 0.8, 1: 0.5, 2: 0.3, 3: 0.2 };
  return m[s] ?? 0.3;
}
var recognizer = null;
var stream = null;
var prevWasEndpoint = false;
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
        if (hotwordsFile) process.stderr.write("[asr-worker] hotwords enabled: " + hotwordsFile + "\n");
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
              modelingUnit: "bpe",
              bpeVocab: msg.modelDir + "bpe.vocab",
              numThreads: 1,
              provider: "cpu",
              debug: 0
            },
            featConfig: { sampleRate: 16e3, featureDim: 80 },
            decodingMethod: "modified_beam_search",
            maxActivePaths: 4,
            enableEndpoint: 1,
            rule1MinTrailingSilence: mapVadToRule1(msg.vadSensitivity ?? 2),
            rule2MinTrailingSilence: mapVadToRule2(msg.vadSensitivity ?? 2),
            rule3MinUtteranceLength: 20,
            hotwordsScore: 5,
            blankPenalty: 1.5,
            ...hotwordsFile ? { hotwordsFile } : {}
          });
          stream = recognizer ? recognizer.createStream() : null;
          prevWasEndpoint = false;
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
          const endpointNow = isEndpoint && !prevWasEndpoint;
          prevWasEndpoint = isEndpoint;
          if (isEndpoint) {
            recognizer.reset(stream);
            prevWasEndpoint = false;
          }
          const text = r.text || "";
          if (text) {
            const emitEndpoint = endpointNow;
            process.stdout.write(JSON.stringify({ type: "result", text, isEndpoint: endpointNow }) + "\n");
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
