export class App {}
export class CachedMetadata {}
export class MarkdownView {}
export class WorkspaceLeaf {}
export class HoverPopover {}
export class MarkdownRenderChild {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class ItemView {}
export class Modal {}
export class SuggestModal<T = unknown> {
  protected _placeholder?: T;
}
export class Notice {}
export class TFile {
  path = "";
  basename = "";
  name = "";
}

export class FileSystemAdapter {}

export const Platform = {
  isDesktopApp: true
};

export const editorInfoField = {};

export function prepareFuzzySearch(_query: string): (input: string) => boolean {
  return (input: string) => input.length >= 0;
}

export function resolveSubpath(path: string): { path: string } {
  return { path };
}

// ── Web Audio API Mocks (for speech feature tests) ──

// AudioContext mock: enough to satisfy SpeechRecorder's startCapture/stopCapture
export class AudioContext {
  sampleRate: number;
  state: AudioContextState = "running";
  constructor(options?: AudioContextOptions) {
    this.sampleRate = options?.sampleRate ?? 44100;
  }
  async resume(): Promise<void> {
    this.state = "running";
  }
  async close(): Promise<void> {
    this.state = "closed";
  }
  createMediaStreamSource(_stream: MediaStream): MediaStreamAudioSourceNode {
    return new MediaStreamAudioSourceNode();
  }
  readonly audioWorklet = {
    addModule: async (_url: string): Promise<void> => { /* no-op */ }
  };
}

// MediaStream mock: tracks and stop
export class MediaStream {
  private tracks: MediaStreamTrack[] = [];
  constructor(tracks?: MediaStreamTrack[]) {
    this.tracks = tracks ?? [];
  }
  getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }
  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track);
  }
}

export class MediaStreamTrack {
  kind = "audio";
  stop(): void { /* no-op */ }
}

// AudioWorkletNode mock
export class AudioWorkletNode {
  port: { onmessage: ((event: MessageEvent) => void) | null };
  constructor() {
    this.port = { onmessage: null };
  }
  connect(_destination: unknown): void { /* no-op */ }
  disconnect(): void { /* no-op */ }
}

// MediaStreamAudioSourceNode mock
export class MediaStreamAudioSourceNode {
  connect(_destination: unknown): void { /* no-op */ }
  disconnect(): void { /* no-op */ }
}

// Minimal Blob mock for AudioWorklet CSP workaround
export class Blob {
  size: number;
  type: string;
  constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
    this.size = parts?.join("").length ?? 0;
    this.type = options?.type ?? "";
  }
}

// URL mock: createObjectURL / revokeObjectURL
export const URL = {
  _blobs: new Map<string, Blob>(),
  createObjectURL(blob: Blob): string {
    const url = `blob:mock-${this._blobs.size}`;
    this._blobs.set(url, blob);
    return url;
  },
  revokeObjectURL(url: string): void {
    this._blobs.delete(url);
  }
};

// getUserMedia mock
export function mockGetUserMedia(result: MediaStream | Error): void {
  (globalThis as unknown as { __mockGetUserMedia: MediaStream | Error }).__mockGetUserMedia = result;
}

export function clearMockGetUserMedia(): void {
  delete (globalThis as unknown as { __mockGetUserMedia?: unknown }).__mockGetUserMedia;
}
