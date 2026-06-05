"use strict";

// src/asr-worker.ts
var sherpaOnnx = require("sherpa-onnx");
var fs = require("fs");
function mapVadToRule1(s) {
  const m = { 0: 2, 1: 1.2, 2: 0.8, 3: 0.5 };
  return m[s] ?? 0.8;
}
function mapVadToRule2(s) {
  const m = { 0: 0.8, 1: 0.5, 2: 0.3, 3: 0.2 };
  return m[s] ?? 0.3;
}
var CONFUSION_MAP = {
  "\u5728\u663E\u4EF7\u503C": "\u5728\u9669\u4EF7\u503C",
  "\u98CE\u9669\u7A57": "\u98CE\u9669\u77E9\u9635",
  "\u5BCC\u529B\u4E1A\u53D8\u6362": "\u5085\u91CC\u53F6\u53D8\u6362",
  "\u5BCC\u529B\u4E1A": "\u5085\u91CC\u53F6",
  "\u5728\u663E": "\u5728\u9669"
};
var activeConfusionMap = { ...CONFUSION_MAP };
function applyEndpointCorrections(text) {
  let result = text;
  for (const [wrong, correct] of Object.entries(activeConfusionMap)) {
    if (result.includes(wrong)) {
      result = result.replace(new RegExp(wrong, "g"), correct);
    }
  }
  return result;
}
function restorePunctuation(rawText) {
  if (punctuation && rawText.trim()) {
    try {
      return punctuation.addPunct(rawText);
    } catch (e) {
      console.error("[lti-asr-worker] Punctuation error:", e);
    }
  }
  return rawText;
}
var recognizer = null;
var offlineRecognizer = null;
var stream = null;
var prevWasEndpoint = false;
var punctuation = null;
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
        activeConfusionMap = { ...CONFUSION_MAP };
        if (msg.confusionMap) {
          activeConfusionMap = { ...activeConfusionMap, ...msg.confusionMap };
        }
        try {
          punctuation = null;
          if (msg.speechAutoPunctuate && msg.language === "zh" && msg.modelType !== "sensevoice") {
            const path = require("path");
            const puncModelPath = path.join(msg.modelDir, "..", "punc-zh-2024", "model.onnx");
            if (fs.existsSync(puncModelPath)) {
              punctuation = sherpaOnnx.createOfflinePunctuation({
                model: {
                  ctTransformer: puncModelPath,
                  numThreads: 1
                }
              });
            } else {
              console.warn("[lti-asr-worker] Punctuation model not found at path:", puncModelPath);
            }
          }
          if (msg.modelType === "sensevoice") {
            offlineRecognizer = sherpaOnnx.createOfflineRecognizer({
              modelConfig: {
                senseVoice: {
                  model: msg.modelDir + "model.int8.onnx",
                  language: "",
                  // auto-detect
                  useInverseTextNormalization: 1
                },
                tokens: msg.modelDir + "tokens.txt",
                numThreads: Math.min(4, Math.max(1, Math.floor(require("os").cpus().length / 2))),
                provider: "cpu",
                debug: 0
              },
              decodingMethod: "greedy_search"
            });
            recognizer = null;
            stream = null;
            process.stdout.write(JSON.stringify({ type: "ready", ok: !!offlineRecognizer }) + "\n");
          } else {
            const hrConfig = msg.lexicon && msg.ruleFsts ? {
              hr: { lexicon: msg.lexicon, ruleFsts: msg.ruleFsts, dictDir: "" }
            } : {};
            const method = msg.decodingMethod ?? "greedy_search";
            const hotwordsConfig = method === "modified_beam_search" && msg.hotwordsFile ? {
              hotwordsFile: msg.hotwordsFile,
              hotwordsScore: 3,
              decodingMethod: "modified_beam_search",
              maxActivePaths: 4
            } : {
              decodingMethod: method,
              ...method === "modified_beam_search" ? { maxActivePaths: 4 } : {}
            };
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
                numThreads: Math.min(4, Math.max(1, Math.floor(require("os").cpus().length / 2))),
                provider: "cpu",
                debug: 0
              },
              featConfig: { sampleRate: 16e3, featureDim: 80, dither: 3e-5 },
              blankPenalty: 1.5,
              enableEndpoint: 1,
              rule1MinTrailingSilence: mapVadToRule1(msg.vadSensitivity ?? 2),
              rule2MinTrailingSilence: mapVadToRule2(msg.vadSensitivity ?? 2),
              rule3MinUtteranceLength: msg.speechMaxUtteranceSec ?? 20,
              ...hrConfig,
              ...hotwordsConfig
            });
            offlineRecognizer = null;
            stream = recognizer ? recognizer.createStream() : null;
            prevWasEndpoint = false;
            process.stdout.write(JSON.stringify({ type: "ready", ok: !!recognizer }) + "\n");
          }
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
          let text = r.text || "";
          if (text) {
            if (endpointNow) {
              text = applyEndpointCorrections(text);
              text = restorePunctuation(text);
            }
            process.stdout.write(JSON.stringify({ type: "result", text, isEndpoint: endpointNow }) + "\n");
          }
        }
        break;
      }
      case "segment": {
        if (!offlineRecognizer || !msg.bufferB64) break;
        const buf = Buffer.from(msg.bufferB64, "base64");
        const samples = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
        const s = offlineRecognizer.createStream();
        s.acceptWaveform(16e3, samples);
        offlineRecognizer.decode(s);
        const r = offlineRecognizer.getResult(s);
        let text = r.text || "";
        s.free();
        if (text) {
          text = applyEndpointCorrections(text);
          text = restorePunctuation(text);
          process.stdout.write(JSON.stringify({ type: "result", text, isEndpoint: true }) + "\n");
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
        if (offlineRecognizer) {
          offlineRecognizer.free();
          offlineRecognizer = null;
        }
        if (punctuation) {
          punctuation.free();
          punctuation = null;
        }
        process.stdout.write(JSON.stringify({ type: "destroyed" }) + "\n");
        process.exit(0);
      }
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ type: "error", error: String(e) }) + "\n");
  }
});
