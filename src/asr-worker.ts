// Standalone ASR worker process — pure Node.js, spawned by Electron renderer.
// Communicates via stdin/stdout JSON lines.
//
// Uses greedy_search (stable, no hallucination) + dither=0.00003 + BPE tokens.
// getResult() returns CUMULATIVE text (full utterance so far).

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const sherpaOnnx = require("sherpa-onnx");
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const fs = require("fs");

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
  const m: Record<number, number> = { 0: 2.0, 1: 1.2, 2: 0.8, 3: 0.5 };
  return m[s] ?? 0.8;
}
function mapVadToRule2(s: number): number {
  const m: Record<number, number> = { 0: 0.8, 1: 0.5, 2: 0.3, 3: 0.2 };
  return m[s] ?? 0.3;
}

// ---- Endpoint confusion set ----
const CONFUSION_MAP: Record<string, string> = {
  "在显价值": "在险价值",
  "风险穗": "风险矩阵",
  "富力业变换": "傅里叶变换",
  "富力业": "傅里叶",
  "在显": "在险",
};

let activeConfusionMap: Record<string, string> = { ...CONFUSION_MAP };

function applyEndpointCorrections(text: string): string {
  let result = text;
  for (const [wrong, correct] of Object.entries(activeConfusionMap)) {
    if (result.includes(wrong)) {
      result = result.replace(new RegExp(wrong, "g"), correct);
    }
  }
  return result;
}

function restorePunctuation(rawText: string): string {
  if (punctuation && rawText.trim()) {
    try {
      return punctuation.addPunct(rawText);
    } catch (e) {
      console.error("[lti-asr-worker] Punctuation error:", e);
    }
  }
  return rawText;
}

// ---- ASR engine ----

let recognizer: Recognizer | null = null;
let offlineRecognizer: any = null;
let stream: Stream | null = null;
let prevWasEndpoint = false;
let punctuation: any = null;

const rl = require("readline").createInterface({ input: process.stdin });
rl.on("line", (raw: string) => {
  let msg: {
    type: string;
    modelDir?: string;
    modelType?: "zipformer" | "sensevoice";
    language?: string;
    vadSensitivity?: number;
    bufferB64?: string;
    lexicon?: string;
    ruleFsts?: string;
    speechAutoPunctuate?: boolean;
    hotwordsFile?: string;
    decodingMethod?: string;
    speechMaxUtteranceSec?: number;
    confusionMap?: Record<string, string>;
  };
  try { msg = JSON.parse(raw); } catch { return; }

  try {
    switch (msg.type) {
      case "init": {
        if (!msg.modelDir || !msg.language) { process.stdout.write(JSON.stringify({ type: "ready", ok: false }) + "\n"); break; }
        if (msg.modelDir.split("/").some((p) => p === "..")) { process.stdout.write(JSON.stringify({ type: "ready", ok: false }) + "\n"); break; }

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
                  numThreads: 1,
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
                  language: "", // auto-detect
                  useInverseTextNormalization: 1,
                },
                tokens: msg.modelDir + "tokens.txt",
                numThreads: Math.min(4, Math.max(1, Math.floor(require("os").cpus().length / 2))),
                provider: "cpu",
                debug: 0,
              },
              decodingMethod: "greedy_search",
            });
            recognizer = null;
            stream = null;
            process.stdout.write(JSON.stringify({ type: "ready", ok: !!offlineRecognizer }) + "\n");
          } else {
            const hrConfig = (msg.lexicon && msg.ruleFsts) ? {
              hr: { lexicon: msg.lexicon, ruleFsts: msg.ruleFsts, dictDir: "" },
            } : {};
            const method = msg.decodingMethod ?? "greedy_search";
            const hotwordsConfig = (method === "modified_beam_search" && msg.hotwordsFile) ? {
              hotwordsFile: msg.hotwordsFile,
              hotwordsScore: 3.0,
              decodingMethod: "modified_beam_search",
              maxActivePaths: 4,
            } : {
              decodingMethod: method,
              ...(method === "modified_beam_search" ? { maxActivePaths: 4 } : {}),
            };
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
                numThreads: Math.min(4, Math.max(1, Math.floor(require("os").cpus().length / 2))), provider: "cpu", debug: 0,
              },
              featConfig: { sampleRate: 16000, featureDim: 80, dither: 0.00003 },
              blankPenalty: 1.5,
              enableEndpoint: 1,
              rule1MinTrailingSilence: mapVadToRule1(msg.vadSensitivity ?? 2),
              rule2MinTrailingSilence: mapVadToRule2(msg.vadSensitivity ?? 2),
              rule3MinUtteranceLength: msg.speechMaxUtteranceSec ?? 20.0,
              ...hrConfig,
              ...hotwordsConfig,
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
        stream.acceptWaveform(16000, samples);
        let decoded = false;
        while (recognizer.isReady(stream)) { recognizer.decode(stream); decoded = true; }
        if (decoded) {
          const r = recognizer.getResult(stream);
          const isEndpoint = recognizer.isEndpoint(stream);
          const endpointNow = isEndpoint && !prevWasEndpoint;
          prevWasEndpoint = isEndpoint;
          if (isEndpoint) { recognizer.reset(stream); prevWasEndpoint = false; }
          // getResult() returns incremental text — emit directly.
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
        s.acceptWaveform(16000, samples);
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
      case "reset": if (recognizer && stream) recognizer.reset(stream); break;
      case "destroy": {
        if (stream) { stream.free(); stream = null; }
        if (recognizer) { recognizer.free(); recognizer = null; }
        if (offlineRecognizer) { offlineRecognizer.free(); offlineRecognizer = null; }
        if (punctuation) { punctuation.free(); punctuation = null; }
        process.stdout.write(JSON.stringify({ type: "destroyed" }) + "\n");
        process.exit(0);
      }
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ type: "error", error: String(e) }) + "\n");
  }
});

