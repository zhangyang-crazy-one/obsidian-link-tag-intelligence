// Mock sherpa-onnx API surface for Worker tests.
// Provides minimal stubs matching the v1.13.1 API used by speech-worker.ts.
// Tests use vi.mock to replace with spies; this file provides type-safe imports.

export class MockOnlineStream {
  acceptWaveform(_sampleRate: number, _samples: Float32Array): void {}
  free(): void {}
}

export class MockOnlineRecognizer {
  private _readyCount = 0;
  private _maxReadyCalls = 1;

  createStream(): MockOnlineStream {
    return new MockOnlineStream();
  }
  isReady(_stream: MockOnlineStream): boolean {
    // Return true once per audio chunk to simulate single decode cycle.
    // Real sherpa-onnx returns true while there are frames available, then false.
    if (this._readyCount < this._maxReadyCalls) {
      this._readyCount++;
      return true;
    }
    return false;
  }
  decode(_stream: MockOnlineStream): void {
    // After decode, reset ready counter for the next audio chunk
    this._readyCount = this._maxReadyCalls;
  }
  getResult(_stream: MockOnlineStream): { text: string; tokens: string[]; timestamps: number[] } {
    return { text: 'test text', tokens: ['test', 'text'], timestamps: [0.0, 1.0] };
  }
  isEndpoint(_stream: MockOnlineStream): boolean {
    // Default: not endpoint. Tests can override via spy if needed.
    return false;
  }
  reset(_stream: MockOnlineStream): void {
    this._readyCount = 0;
  }
  free(): void {
    this._readyCount = 0;
  }
}

export function createOnlineRecognizer(
  _wasmModule: unknown,
  _config: unknown
): MockOnlineRecognizer {
  return new MockOnlineRecognizer();
}
