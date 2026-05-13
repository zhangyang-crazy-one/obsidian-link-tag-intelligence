"use strict";

// src/speech-worker.ts
var sherpaOnnx = require("sherpa-onnx");
var recognizer = null;
var stream = null;
function mapVadSensitivityToRule1(sensitivity) {
  const map = { 0: 1.6, 1: 1.2, 2: 0.8, 3: 0.5 };
  return map[sensitivity] ?? 0.8;
}
function mapVadSensitivityToRule2(sensitivity) {
  const map = { 0: 0.8, 1: 0.6, 2: 0.4, 3: 0.25 };
  return map[sensitivity] ?? 0.4;
}
self.onmessage = function(e) {
  const msg = e.data;
  switch (msg.type) {
    case "init": {
      if (!msg.modelDir || !msg.language) {
        return;
      }
      const pathParts = msg.modelDir.split("/");
      for (const part of pathParts) {
        if (part === "..") {
          return;
        }
      }
      const cfg = {
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
        rule1MinTrailingSilence: mapVadSensitivityToRule1(msg.vadSensitivity ?? 2),
        rule2MinTrailingSilence: mapVadSensitivityToRule2(msg.vadSensitivity ?? 2),
        rule3MinUtteranceLength: 2
      };
      recognizer = sherpaOnnx.createOnlineRecognizer(
        sherpaOnnx.wasmModule,
        cfg
      );
      if (!recognizer) {
        return;
      }
      stream = recognizer.createStream();
      self.postMessage({ type: "ready" });
      return;
    }
    case "audio": {
      if (!recognizer || !stream || !msg.buffer) {
        return;
      }
      const samples = new Float32Array(msg.buffer);
      stream.acceptWaveform(16e3, samples);
      while (recognizer.isReady(stream)) {
        recognizer.decode(stream);
      }
      const result = recognizer.getResult(stream);
      const text = result.text || "";
      const isEndpoint = recognizer.isEndpoint(stream);
      self.postMessage({ type: "result", text, isEndpoint });
      if (isEndpoint) {
        recognizer.reset(stream);
      }
      return;
    }
    case "reset": {
      if (recognizer && stream) {
        recognizer.reset(stream);
      }
      return;
    }
    case "destroy": {
      if (stream) {
        stream.free();
        stream = null;
      }
      if (recognizer) {
        recognizer.free();
        recognizer = null;
      }
      self.postMessage({ type: "destroyed" });
      return;
    }
  }
};
