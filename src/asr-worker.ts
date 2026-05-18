// Standalone ASR worker process — pure Node.js, spawned by Electron renderer.
// Communicates via stdin/stdout JSON lines (child_process ipc not available
// in Electron renderer, so we use pipe-based protocol).

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const sherpaOnnx = require("sherpa-onnx");

type Recognizer = {
  createStream(): Stream;
  isReady(s: Stream): boolean;
  decode(s: Stream): void;
  getResult(s: Stream): { text: string };
  isEndpoint(s: Stream): boolean;
  reset(s: Stream): void;
  free(): void;
};
type Stream = {
  acceptWaveform(sr: number, samples: Float32Array): void;
  free(): void;
};

function mapVadToRule1(s: number): number {
  // Rule 1: long silence — triggers endpoint even without prior speech
  const m: Record<number, number> = { 0: 2.0, 1: 1.2, 2: 0.8, 3: 0.5 };
  return m[s] ?? 0.8;
}
function mapVadToRule2(s: number): number {
  // Rule 2: short silence — triggers endpoint if utterance was detected
  const m: Record<number, number> = { 0: 0.8, 1: 0.5, 2: 0.3, 3: 0.2 };
  return m[s] ?? 0.3;
}

let recognizer: Recognizer | null = null;
let stream: Stream | null = null;
let prevWasEndpoint = false;

const rl = require("readline").createInterface({ input: process.stdin });
rl.on("line", (raw: string) => {
  let msg: { type: string; modelDir?: string; language?: string; vadSensitivity?: number; bufferB64?: string };
  try { msg = JSON.parse(raw); } catch { return; }

  try {
    switch (msg.type) {
      case "init": {
        if (!msg.modelDir || !msg.language) { process.stdout.write(JSON.stringify({ type: "ready", ok: false }) + "\n"); break; }
        const hotwordsFile = msg.hotwordsFile as string | undefined;
        if (msg.modelDir.split("/").some((p) => p === "..")) { process.stdout.write(JSON.stringify({ type: "ready", ok: false }) + "\n"); break; }
        try {
          recognizer = sherpaOnnx.createOnlineRecognizer({
            modelConfig: {
              transducer: {
                encoder: msg.modelDir + "encoder.int8.onnx",
                decoder: msg.modelDir + "decoder.onnx",
                joiner: msg.modelDir + "joiner.int8.onnx",
              },
              tokens: msg.modelDir + "tokens.txt",
              modelingUnit: "bpe",
              bpeVocab: msg.modelDir + "bpe.vocab",
              numThreads: 1, provider: "cpu", debug: 0,
            },
            featConfig: { sampleRate: 16000, featureDim: 80 },
            decodingMethod: "modified_beam_search" as const, maxActivePaths: 4,
            enableEndpoint: 1,
            rule1MinTrailingSilence: mapVadToRule1(msg.vadSensitivity ?? 2),
            rule2MinTrailingSilence: mapVadToRule2(msg.vadSensitivity ?? 2),
            rule3MinUtteranceLength: 20.0,
            hotwordsScore: 5.0,
            blankPenalty: 1.5,
            ...(hotwordsFile ? { hotwordsFile } : {}),
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
        stream.acceptWaveform(16000, samples);
        let decoded = false;
        while (recognizer.isReady(stream)) { recognizer.decode(stream); decoded = true; }
        if (decoded) {
          const r = recognizer.getResult(stream);
          const isEndpoint = recognizer.isEndpoint(stream);
          // Emit endpoint only on first occurrence. Don't reset decoder
          // state — speaker may resume after pause and needs full context.
          // Endpoint stays true until reset, so debounce to avoid fragments.
          const endpointNow = isEndpoint && !prevWasEndpoint;
          prevWasEndpoint = isEndpoint;
          if (isEndpoint) { recognizer.reset(stream); prevWasEndpoint = false; }
          const text = r.text || "";
          // getResult() returns incremental text (since last call), not cumulative.
          // No need for delta computation — just emit directly.
          if (text) {
            // Only emit endpoint=true on first occurrence to avoid fragment spam
            const emitEndpoint = endpointNow;
            process.stdout.write(JSON.stringify({ type: "result", text, isEndpoint: endpointNow }) + "\n");
          }
        }
        break;
      }
      case "reset": if (recognizer && stream) recognizer.reset(stream); break;
      case "destroy": {
        if (stream) { stream.free(); stream = null; }
        if (recognizer) { recognizer.free(); recognizer = null; }
        process.stdout.write(JSON.stringify({ type: "destroyed" }) + "\n");
        process.exit(0);
      }
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ type: "error", error: String(e) }) + "\n");
  }
});
