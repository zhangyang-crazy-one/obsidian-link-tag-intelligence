"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/speech-worker.ts
var speech_worker_exports = {};
__export(speech_worker_exports, {
  createAsrEngine: () => createAsrEngine
});
module.exports = __toCommonJS(speech_worker_exports);
var sherpaOnnx = null;
try {
  sherpaOnnx = require("sherpa-onnx");
} catch {
  sherpaOnnx = null;
}
function mapVadSensitivityToRule1(sensitivity) {
  const map = { 0: 1.6, 1: 1.2, 2: 0.8, 3: 0.5 };
  return map[sensitivity] ?? 0.8;
}
function mapVadSensitivityToRule2(sensitivity) {
  const map = { 0: 0.8, 1: 0.6, 2: 0.4, 3: 0.25 };
  return map[sensitivity] ?? 0.4;
}
function createAsrEngine() {
  let recognizer = null;
  let stream = null;
  return {
    init(modelDir, language, vadSensitivity) {
      if (modelDir.split("/").some((p) => p === "..")) return false;
      const cfg = {
        modelConfig: {
          transducer: {
            encoder: modelDir + "encoder-epoch-99-avg-1.int8.onnx",
            decoder: modelDir + "decoder-epoch-99-avg-1.onnx",
            joiner: modelDir + "joiner-epoch-99-avg-1.int8.onnx"
          },
          tokens: modelDir + "tokens.txt",
          modelingUnit: language === "zh" ? "cjkchar" : "bpe",
          numThreads: 1,
          provider: "cpu",
          debug: 0
        },
        featConfig: { sampleRate: 16e3, featureDim: 80 },
        decodingMethod: "greedy_search",
        maxActivePaths: 4,
        enableEndpoint: 1,
        rule1MinTrailingSilence: mapVadSensitivityToRule1(vadSensitivity),
        rule2MinTrailingSilence: mapVadSensitivityToRule2(vadSensitivity),
        rule3MinUtteranceLength: 2
      };
      if (!sherpaOnnx) return false;
      try {
        recognizer = sherpaOnnx.createOnlineRecognizer(
          sherpaOnnx.wasmModule,
          cfg
        );
        if (!recognizer) return false;
        stream = recognizer.createStream();
        return true;
      } catch {
        return false;
      }
    },
    processAudio(buffer) {
      if (!recognizer || !stream) {
        return { text: "", isEndpoint: false };
      }
      const samples = new Float32Array(buffer);
      stream.acceptWaveform(16e3, samples);
      while (recognizer.isReady(stream)) {
        recognizer.decode(stream);
      }
      const result = recognizer.getResult(stream);
      const text = result.text || "";
      const isEndpoint = recognizer.isEndpoint(stream);
      if (isEndpoint) {
        recognizer.reset(stream);
      }
      return { text, isEndpoint };
    },
    reset() {
      if (recognizer && stream) {
        recognizer.reset(stream);
      }
    },
    destroy() {
      if (stream) {
        stream.free();
        stream = null;
      }
      if (recognizer) {
        recognizer.free();
        recognizer = null;
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createAsrEngine
});
