// Main-thread sherpa-onnx WASM ASR engine.
// Accepts pluginDir from main.ts because require("sherpa-onnx") may not
// resolve correctly from Electron's bundled renderer process.
// We construct the absolute path: {pluginDir}/node_modules/sherpa-onnx

type Recognizer = {
  createStream(): Stream;
  isReady(stream: Stream): boolean;
  decode(stream: Stream): void;
  getResult(stream: Stream): { text: string };
  isEndpoint(stream: Stream): boolean;
  reset(stream: Stream): void;
  free(): void;
};

type Stream = {
  acceptWaveform(sampleRate: number, samples: Float32Array): void;
  free(): void;
};

export interface AsrEngine {
  init(modelDir: string, language: string, vadSensitivity: number): boolean;
  processAudio(buffer: ArrayBuffer): { text: string; isEndpoint: boolean };
  reset(): void;
  destroy(): void;
}

function mapVadSensitivityToRule1(s: number): number {
  const map: Record<number, number> = { 0: 1.6, 1: 1.2, 2: 0.8, 3: 0.5 };
  return map[s] ?? 0.8;
}

function mapVadSensitivityToRule2(s: number): number {
  const map: Record<number, number> = { 0: 0.8, 1: 0.6, 2: 0.4, 3: 0.25 };
  return map[s] ?? 0.4;
}

export function createAsrEngine(pluginDir: string): AsrEngine {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, @typescript-eslint/no-require-imports
  const { join } = require("path") as { join: (...p: string[]) => string };
  const pkgPath = join(pluginDir, "node_modules", "sherpa-onnx");

  let sherpaOnnx: Record<string, unknown> | null = null;
  try {
    sherpaOnnx = require(pkgPath);
    console.log("[lti-speech] Loaded sherpa-onnx from:", pkgPath);
  } catch (e) {
    console.error("[lti-speech] require('" + pkgPath + "') failed:", String(e));
    sherpaOnnx = null;
  }

  let recognizer: Recognizer | null = null;
  let stream: Stream | null = null;

  return {
    init(modelDir: string, language: string, vadSensitivity: number): boolean {
      if (modelDir.split("/").some((p) => p === "..")) return false;
      if (!sherpaOnnx) {
        console.error("[lti-speech] sherpaOnnx is null");
        return false;
      }

      const cfg = {
        modelConfig: {
          transducer: {
            encoder: modelDir + "encoder-epoch-99-avg-1.int8.onnx",
            decoder: modelDir + "decoder-epoch-99-avg-1.onnx",
            joiner: modelDir + "joiner-epoch-99-avg-1.int8.onnx",
          },
          tokens: modelDir + "tokens.txt",
          modelingUnit: language === "zh" ? "cjkchar" : "bpe",
          numThreads: 1,
          provider: "cpu" as const,
          debug: 0,
        },
        featConfig: { sampleRate: 16000, featureDim: 80 },
        decodingMethod: "greedy_search" as const,
        maxActivePaths: 4,
        enableEndpoint: 1,
        rule1MinTrailingSilence: mapVadSensitivityToRule1(vadSensitivity),
        rule2MinTrailingSilence: mapVadSensitivityToRule2(vadSensitivity),
        rule3MinUtteranceLength: 2.0,
      };

      try {
        console.log("[lti-speech] Creating recognizer, modelDir:", modelDir);
        recognizer = (sherpaOnnx.createOnlineRecognizer(
          sherpaOnnx.wasmModule,
          cfg
        ) as Recognizer) ?? null;
        if (!recognizer) {
          console.error("[lti-speech] createOnlineRecognizer returned null");
          return false;
        }
        stream = recognizer.createStream();
        console.log("[lti-speech] Recognizer ready");
        return true;
      } catch (e) {
        console.error("[lti-speech] createOnlineRecognizer threw:", String(e));
        return false;
      }
    },

    processAudio(buffer: ArrayBuffer): { text: string; isEndpoint: boolean } {
      if (!recognizer || !stream) return { text: "", isEndpoint: false };
      const samples = new Float32Array(buffer);
      stream.acceptWaveform(16000, samples);
      while (recognizer.isReady(stream)) {
        recognizer.decode(stream);
      }
      const result = recognizer.getResult(stream);
      const text = result.text || "";
      const isEndpoint = recognizer.isEndpoint(stream);
      if (isEndpoint) recognizer.reset(stream);
      return { text, isEndpoint };
    },

    reset(): void {
      if (recognizer && stream) recognizer.reset(stream);
    },

    destroy(): void {
      if (stream) { stream.free(); stream = null; }
      if (recognizer) { recognizer.free(); recognizer = null; }
    },
  };
}
