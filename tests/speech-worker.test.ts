import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockOnlineRecognizer,
  MockOnlineStream,
  createOnlineRecognizer
} from './mocks/sherpa-onnx';

// ── Test harness: simulate Worker environment ──

let postedMessages: unknown[] = [];
let workerOnMessage: ((event: MessageEvent) => void) | null = null;
let recognizer: MockOnlineRecognizer | null = null;
let stream: MockOnlineStream | null = null;
type InitConfig = {
  modelConfig: {
    modelingUnit: string;
    bpeVocab?: string;
    [key: string]: unknown;
  };
  enableEndpoint: number;
  decodingMethod: string;
  blankPenalty?: number;
  featConfig: { sampleRate: number; featureDim: number; dither?: number };
  hr?: { lexicon: string; ruleFsts: string; dictDir: string };
  [key: string]: unknown;
};

let lastInitConfig: InitConfig | null = null;

function mapVadSensitivityToRule1(sensitivity: number): number {
  const map: Record<number, number> = { 0: 1.6, 1: 1.2, 2: 0.8, 3: 0.5 };
  return map[sensitivity] ?? 0.8;
}

function mapVadSensitivityToRule2(sensitivity: number): number {
  const map: Record<number, number> = { 0: 0.8, 1: 0.6, 2: 0.4, 3: 0.25 };
  return map[sensitivity] ?? 0.4;
}

// ── Inline Worker handler (mirrors speech-worker.ts contract) ──

function workerOnMessageHandler(e: MessageEvent): void {
  const msg = e.data as { type: string; modelDir?: string; language?: string; vadSensitivity?: number; buffer?: ArrayBuffer; lexicon?: string; ruleFsts?: string };

  switch (msg.type) {
    case 'init': {
      if (!msg.modelDir || !msg.language) {
        return;
      }

      // Validate path: reject '..' traversal (T-02-01 threat mitigation)
      const pathParts = msg.modelDir.split('/');
      for (const part of pathParts) {
        if (part === '..') {
          return; // security rejection — no ready message sent
        }
      }

      const hrConfig = (msg.lexicon && msg.ruleFsts) ? {
        hr: { lexicon: msg.lexicon, ruleFsts: msg.ruleFsts, dictDir: '' },
      } : {};
      const cfg = {
        modelConfig: {
          transducer: {
            encoder: msg.modelDir + 'encoder.int8.onnx',
            decoder: msg.modelDir + 'decoder.onnx',
            joiner: msg.modelDir + 'joiner.int8.onnx',
          },
          tokens: msg.modelDir + 'tokens.txt',
          modelingUnit: 'bpe',
          bpeVocab: msg.modelDir + 'bpe.vocab',
          numThreads: 1,
          provider: 'cpu',
          debug: 0,
        },
        featConfig: { sampleRate: 16000, featureDim: 80, dither: 0.00003 },
        decodingMethod: 'greedy_search',
        blankPenalty: 1.5,
        enableEndpoint: 1,
        rule1MinTrailingSilence: mapVadSensitivityToRule1(msg.vadSensitivity ?? 2),
        rule2MinTrailingSilence: mapVadSensitivityToRule2(msg.vadSensitivity ?? 2),
        rule3MinUtteranceLength: 20.0,
        ...hrConfig,
      };

      lastInitConfig = cfg as unknown as InitConfig;
      recognizer = createOnlineRecognizer({}, cfg);
      stream = recognizer.createStream();
      postedMessages.push({ type: 'ready' });
      return;
    }

    case 'audio': {
      if (!recognizer || !stream || !msg.buffer) {
        return; // no crash if audio arrives before init
      }

      const samples = new Float32Array(msg.buffer);
      stream.acceptWaveform(16000, samples);
      while (recognizer.isReady(stream)) {
        recognizer.decode(stream);
      }
      const result = recognizer.getResult(stream);
      const text = result.text || '';
      const isEndpoint = recognizer.isEndpoint(stream);
      postedMessages.push({ type: 'result', text, isEndpoint });

      if (isEndpoint) {
        recognizer.reset(stream);
      }
      return;
    }

    case 'reset': {
      if (recognizer && stream) {
        recognizer.reset(stream);
      }
      return;
    }

    case 'destroy': {
      if (stream) {
        stream.free();
        stream = null;
      }
      if (recognizer) {
        recognizer.free();
        recognizer = null;
      }
      postedMessages.push({ type: 'destroyed' });
      return;
    }
  }
}

// ------ Tests ------

describe('Mock sherpa-onnx API surface', () => {
  it('createOnlineRecognizer returns recognizer with expected methods', () => {
    const rec = createOnlineRecognizer({}, {});
    expect(rec).toBeDefined();
    expect(typeof rec.createStream).toBe('function');
    expect(typeof rec.isReady).toBe('function');
    expect(typeof rec.decode).toBe('function');
    expect(typeof rec.getResult).toBe('function');
    expect(typeof rec.isEndpoint).toBe('function');
    expect(typeof rec.reset).toBe('function');
    expect(typeof rec.free).toBe('function');
  });

  it('OnlineStream has acceptWaveform and free methods', () => {
    const rec = createOnlineRecognizer({}, {});
    const str = rec.createStream();
    expect(typeof str.acceptWaveform).toBe('function');
    expect(typeof str.free).toBe('function');
  });

  it('WASM module first argument is accepted by createOnlineRecognizer', () => {
    const wasmModule = { HEAP8: new Int8Array(0) };
    const rec = createOnlineRecognizer(wasmModule, {});
    expect(rec).toBeInstanceOf(MockOnlineRecognizer);
  });
});

describe('Worker message protocol', () => {
  beforeEach(() => {
    postedMessages = [];
    recognizer = null;
    stream = null;
    lastInitConfig = null;
    workerOnMessage = workerOnMessageHandler;
  });

  function sendMessage(msg: Record<string, unknown>): void {
    workerOnMessage!({ data: msg } as MessageEvent);
  }

  function getLastPosted(): Record<string, unknown> | null {
    return postedMessages.length > 0
      ? (postedMessages[postedMessages.length - 1] as Record<string, unknown>)
      : null;
  }

  it('init uses BPE modelingUnit for zh (zh-2025 model uses sentencepiece BPE)', () => {
    sendMessage({ type: 'init', modelDir: '/fake/models/', language: 'zh', vadSensitivity: 2 });
    expect(postedMessages).toHaveLength(1);
    expect(getLastPosted()!.type).toBe('ready');
    expect(lastInitConfig!.modelConfig.modelingUnit).toBe('bpe');
    expect(lastInitConfig!.modelConfig.bpeVocab).toBe('/fake/models/bpe.vocab');
  });

  it('init uses BPE modelingUnit for en', () => {
    sendMessage({ type: 'init', modelDir: '/fake/models/', language: 'en', vadSensitivity: 2 });
    expect(postedMessages).toHaveLength(1);
    expect(getLastPosted()!.type).toBe('ready');
    expect(lastInitConfig!.modelConfig.modelingUnit).toBe('bpe');
  });

  it('audio message produces result with text and isEndpoint', () => {
    // init first
    sendMessage({ type: 'init', modelDir: '/fake/models/', language: 'zh', vadSensitivity: 2 });
    postedMessages = []; // clear ready message

    const buffer = new Float32Array(128).buffer;
    sendMessage({ type: 'audio', buffer });

    expect(postedMessages).toHaveLength(1);
    const msg = getLastPosted()!;
    expect(msg.type).toBe('result');
    expect(typeof msg.text).toBe('string');
    expect(typeof msg.isEndpoint).toBe('boolean');
  });

  it('destroy sends destroyed message and frees resources', () => {
    sendMessage({ type: 'init', modelDir: '/fake/models/', language: 'zh', vadSensitivity: 2 });
    postedMessages = []; // clear ready

    sendMessage({ type: 'destroy' });

    expect(postedMessages).toHaveLength(1);
    expect(getLastPosted()!.type).toBe('destroyed');
    // After destroy, audio should not crash and should not post
    sendMessage({ type: 'audio', buffer: new Float32Array(128).buffer });
    // No new result message expected since recognizer/stream are null
    expect(postedMessages).toHaveLength(1);
  });

  it('reset calls recognizer.reset without posting a message', () => {
    sendMessage({ type: 'init', modelDir: '/fake/models/', language: 'zh', vadSensitivity: 2 });
    postedMessages = [];

    sendMessage({ type: 'reset' });

    // reset should not post any message
    expect(postedMessages).toHaveLength(0);
  });

  it('audio before init does not crash or post messages', () => {
    // No init sent
    const buffer = new Float32Array(128).buffer;
    sendMessage({ type: 'audio', buffer });
    expect(postedMessages).toHaveLength(0);
  });

  it('VAD sensitivity mapping produces correct rule values', () => {
    // Verify VAD mapping function
    expect(mapVadSensitivityToRule1(0)).toBe(1.6);
    expect(mapVadSensitivityToRule1(1)).toBe(1.2);
    expect(mapVadSensitivityToRule1(2)).toBe(0.8);
    expect(mapVadSensitivityToRule1(3)).toBe(0.5);

    expect(mapVadSensitivityToRule2(0)).toBe(0.8);
    expect(mapVadSensitivityToRule2(1)).toBe(0.6);
    expect(mapVadSensitivityToRule2(2)).toBe(0.4);
    expect(mapVadSensitivityToRule2(3)).toBe(0.25);
  });

  it('init sends ready with enableEndpoint=1', () => {
    sendMessage({ type: 'init', modelDir: '/fake/models/', language: 'zh', vadSensitivity: 2 });
    expect(lastInitConfig!.enableEndpoint).toBe(1);
  });

  it('init adds blankPenalty=1.5 for greedy_search', () => {
    sendMessage({ type: 'init', modelDir: '/fake/models/', language: 'zh', vadSensitivity: 2 });
    expect(lastInitConfig!.blankPenalty).toBe(1.5);
    expect(lastInitConfig!.decodingMethod).toBe('greedy_search');
  });

  it('init includes featConfig with dither', () => {
    sendMessage({ type: 'init', modelDir: '/fake/models/', language: 'zh', vadSensitivity: 2 });
    expect(lastInitConfig!.featConfig.dither).toBe(0.00003);
  });

  // ── HomophoneReplacer (HR) tests ──

  it('init includes hr config when lexicon and ruleFsts are provided', () => {
    sendMessage({
      type: 'init', modelDir: '/fake/models/', language: 'zh', vadSensitivity: 2,
      lexicon: '/fake/models/lexicon.txt', ruleFsts: '/fake/models/replace.fst',
    });
    expect(lastInitConfig!.hr).toBeDefined();
    expect(lastInitConfig!.hr!.lexicon).toBe('/fake/models/lexicon.txt');
    expect(lastInitConfig!.hr!.ruleFsts).toBe('/fake/models/replace.fst');
  });

  it('init does NOT include hr config when only lexicon is provided', () => {
    sendMessage({
      type: 'init', modelDir: '/fake/models/', language: 'zh', vadSensitivity: 2,
      lexicon: '/fake/models/lexicon.txt',
    });
    expect(lastInitConfig!.hr).toBeUndefined();
  });

  it('init does NOT include hr config when only ruleFsts is provided', () => {
    sendMessage({
      type: 'init', modelDir: '/fake/models/', language: 'zh', vadSensitivity: 2,
      ruleFsts: '/fake/models/replace.fst',
    });
    expect(lastInitConfig!.hr).toBeUndefined();
  });

  it('init does NOT include hr config when neither lexicon nor ruleFsts provided', () => {
    sendMessage({ type: 'init', modelDir: '/fake/models/', language: 'zh', vadSensitivity: 2 });
    expect(lastInitConfig!.hr).toBeUndefined();
  });

  it('init rejects modelDir with .. path traversal', () => {
    sendMessage({ type: 'init', modelDir: '/fake/../etc/', language: 'zh', vadSensitivity: 2 });
    // No ready message should be posted (security rejection)
    expect(postedMessages).toHaveLength(0);
  });
});
