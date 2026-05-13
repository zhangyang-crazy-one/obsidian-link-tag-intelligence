// Web Worker entry point for sherpa-onnx WASM speech recognition.
// Runs in a dedicated Worker thread (Electron nodeIntegrationInWorker).
// Self-contained CJS module — must NOT import from other src/ files.
// All logic uses require() for runtime sherpa-onnx loading.

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const sherpaOnnx = require("sherpa-onnx");

type Recognizer = {
  createStream(): Stream;
  isReady(stream: Stream): boolean;
  decode(stream: Stream): void;
  getResult(stream: Stream): { text: string; tokens: string[]; timestamps: number[] };
  isEndpoint(stream: Stream): boolean;
  reset(stream: Stream): void;
  free(): void;
};

type Stream = {
  acceptWaveform(sampleRate: number, samples: Float32Array): void;
  free(): void;
};

let recognizer: Recognizer | null = null;
let stream: Stream | null = null;

function mapVadSensitivityToRule1(sensitivity: number): number {
  // VAD sensitivity mapping from RESEARCH.md Pitfall 6
  const map: Record<number, number> = { 0: 1.6, 1: 1.2, 2: 0.8, 3: 0.5 };
  return map[sensitivity] ?? 0.8;
}

function mapVadSensitivityToRule2(sensitivity: number): number {
  const map: Record<number, number> = { 0: 0.8, 1: 0.6, 2: 0.4, 3: 0.25 };
  return map[sensitivity] ?? 0.4;
}

// D-03: sherpa-onnx via WASM npm package (require('sherpa-onnx'))
// D-11: Use sherpa-onnx built-in VAD (enableEndpoint: 1)
// D-06: 800ms silence endpoint via rule1MinTrailingSilence: 0.8 (sensitivity=2 default)

self.onmessage = function (e: MessageEvent): void {
  const msg = e.data as {
    type: string;
    modelDir?: string;
    language?: string;
    vadSensitivity?: number;
    buffer?: ArrayBuffer;
  };

  switch (msg.type) {
    case "init": {
      if (!msg.modelDir || !msg.language) {
        return;
      }

      // T-02-01 threat mitigation: reject path traversal in modelDir
      const pathParts = msg.modelDir.split("/");
      for (const part of pathParts) {
        if (part === "..") {
          return; // security rejection — no ready message sent
        }
      }

      const cfg = {
        modelConfig: {
          transducer: {
            encoder: msg.modelDir + "encoder-epoch-99-avg-1.int8.onnx",
            decoder: msg.modelDir + "decoder-epoch-99-avg-1.onnx",
            joiner: msg.modelDir + "joiner-epoch-99-avg-1.int8.onnx",
          },
          tokens: msg.modelDir + "tokens.txt",
          modelingUnit: msg.language === "zh" ? "cjkchar" : "bpe",
          numThreads: 1,
          provider: "cpu",
          debug: 0,
        },
        featConfig: { sampleRate: 16000, featureDim: 80 },
        decodingMethod: "greedy_search",
        maxActivePaths: 4,
        enableEndpoint: 1,
        rule1MinTrailingSilence: mapVadSensitivityToRule1(msg.vadSensitivity ?? 2),
        rule2MinTrailingSilence: mapVadSensitivityToRule2(msg.vadSensitivity ?? 2),
        rule3MinUtteranceLength: 2.0,
      };

      recognizer = sherpaOnnx.createOnlineRecognizer(
        sherpaOnnx.wasmModule,
        cfg
      );
      if (!recognizer) {
        return; // init failed — no ready message sent
      }
      stream = recognizer.createStream();
      self.postMessage({ type: "ready" });
      return;
    }

    case "audio": {
      if (!recognizer || !stream || !msg.buffer) {
        return; // no crash if audio arrives before init
      }

      const samples = new Float32Array(msg.buffer);
      stream.acceptWaveform(16000, samples);
      while (recognizer.isReady(stream)) {
        recognizer.decode(stream);
      }
      const result = recognizer.getResult(stream);
      const text = result.text || "";
      const isEndpoint = recognizer.isEndpoint(stream);
      self.postMessage({ type: "result", text, isEndpoint });

      if (isEndpoint) {
        // RESEARCH Pitfall 5: reset after each endpoint to prevent memory accumulation
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
