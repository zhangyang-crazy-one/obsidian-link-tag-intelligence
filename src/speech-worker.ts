// Main-thread sherpa-onnx ASR — loads WASM directly without child process.
// Electron sandbox blocks child_process.spawn, so we run inference in-thread.

type Recognizer = {
  createStream(): Stream;
  isReady(s: Stream): boolean; decode(s: Stream): void;
  getResult(s: Stream): { text: string }; isEndpoint(s: Stream): boolean;
  reset(s: Stream): void; free(): void;
};
type Stream = { acceptWaveform(sr: number, s: Float32Array): void; free(): void };

export interface AsrEngine {
  init(modelDir: string, language: string, vadSensitivity: number): boolean;
  processAudio(buffer: ArrayBuffer): { text: string; isEndpoint: boolean };
  reset(): void; destroy(): void;
}

function mapRule1(s: number): number {
  const m: Record<number, number> = { 0: 2.4, 1: 1.8, 2: 1.5, 3: 0.8 };
  return m[s] ?? 1.5;
}
function mapRule2(s: number): number {
  const m: Record<number, number> = { 0: 1.2, 1: 0.8, 2: 0.6, 3: 0.4 };
  return m[s] ?? 0.6;
}

export function createAsrEngine(pluginDir: string): AsrEngine {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const { join } = require("path") as { join: (...p: string[]) => string };
  const pkgPath = join(pluginDir, "node_modules", "sherpa-onnx");

  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const sherpaOnnx = require(pkgPath) as {
    createOnlineRecognizer(m: unknown, c: Record<string, unknown>): Recognizer | null;
    wasmModule: unknown;
  };

  if (!sherpaOnnx?.createOnlineRecognizer) {
    console.error("[lti-speech] sherpa-onnx not available at", pkgPath);
    return { init: () => false, processAudio: () => ({ text: "", isEndpoint: false }), reset() {}, destroy() {} };
  }

  let recognizer: Recognizer | null = null;
  let stream: Stream | null = null;
  let prevText = "";

  return {
    init(modelDir: string, language: string, vadSensitivity: number): boolean {
      if (modelDir.split("/").some((p) => p === "..")) return false;
      try {
        recognizer = sherpaOnnx.createOnlineRecognizer(sherpaOnnx.wasmModule, {
          modelConfig: {
            transducer: {
              encoder: modelDir + "encoder.int8.onnx",
              decoder: modelDir + "decoder.onnx",
              joiner: modelDir + "joiner.int8.onnx",
            },
            tokens: modelDir + "tokens.txt",
            modelingUnit: "cjkchar",
            bpeVocab: modelDir + "bpe.vocab",
            numThreads: 1, provider: "cpu", debug: 0,
          },
          featConfig: { sampleRate: 16000, featureDim: 80 },
          decodingMethod: "modified_beam_search", maxActivePaths: 8,
          enableEndpoint: 1,
          rule1MinTrailingSilence: mapRule1(vadSensitivity),
          rule2MinTrailingSilence: mapRule2(vadSensitivity),
          rule3MinUtteranceLength: 4.0,
          hotwordsScore: 3.0,
        } as Record<string, unknown>);
        if (!recognizer) return false;
        stream = recognizer.createStream();
        prevText = "";
        return true;
      } catch (e) {
        console.error("[lti-speech] init failed:", String(e));
        return false;
      }
    },

    processAudio(buffer: ArrayBuffer): { text: string; isEndpoint: boolean } {
      if (!recognizer || !stream) return { text: "", isEndpoint: false };
      const samples = new Float32Array(buffer);
      stream.acceptWaveform(16000, samples);
      let decoded = false;
      while (recognizer.isReady(stream)) { recognizer.decode(stream); decoded = true; }
      if (!decoded) return { text: "", isEndpoint: false };
      const r = recognizer.getResult(stream);
      const isEndpoint = recognizer.isEndpoint(stream);
      if (isEndpoint) { recognizer.reset(stream); prevText = ""; }
      const full = r.text || "";
      const delta = full.startsWith(prevText) ? full.slice(prevText.length) : full;
      prevText = full;
      return { text: delta, isEndpoint };
    },

    reset(): void { if (recognizer && stream) recognizer.reset(stream); prevText = ""; },
    destroy(): void {
      if (stream) { stream.free(); stream = null; }
      if (recognizer) { recognizer.free(); recognizer = null; }
    },
  };
}
