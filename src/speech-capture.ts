// Microphone capture with audio level metering, used by the speech-to-text feature.
// Tries AudioWorklet first (clean off-main-thread processing), falls back to
// ScriptProcessorNode when Obsidian's CSP blocks blob: URLs for AudioWorklet.

export interface CaptureState {
  audioContext: AudioContext | null;
  mediaStream: MediaStream | null;
  processorNode: AudioWorkletNode | ScriptProcessorNode | null;
  sourceNode: MediaStreamAudioSourceNode | null;
  blobUrl: string | null;
  cleanup: () => void;
}

const WORKLET_CODE = `
class MicProcessor extends AudioWorkletProcessor {
  process(inputs) {
    var input = inputs[0];
    if (input && input.length > 0 && input[0] && input[0].length > 0) {
      this.port.postMessage(input[0]);
    }
    return true;
  }
}
registerProcessor('mic-processor', MicProcessor);
`;

async function tryAudioWorklet(
  audioContext: AudioContext,
  mediaStream: MediaStream,
  onAudioChunk: (chunk: Float32Array) => void
): Promise<{ node: AudioWorkletNode; source: MediaStreamAudioSourceNode; blobUrl: string }> {
  const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);

  await audioContext.audioWorklet.addModule(blobUrl);
  const node = new AudioWorkletNode(audioContext, "mic-processor");
  node.port.onmessage = (event: MessageEvent<Float32Array>) => onAudioChunk(event.data);

  const source = audioContext.createMediaStreamSource(mediaStream);
  source.connect(node);

  return { node, source, blobUrl };
}

function createScriptProcessorFallback(
  audioContext: AudioContext,
  mediaStream: MediaStream,
  onAudioChunk: (chunk: Float32Array) => void
): { node: ScriptProcessorNode; source: MediaStreamAudioSourceNode; blobUrl: null } {
  // 4096 samples at 16kHz = ~256ms per buffer — acceptable for real-time dictation
  const node = audioContext.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (event: AudioProcessingEvent) => {
    const input = event.inputBuffer.getChannelData(0);
    // Copy into new Float32Array to avoid detached buffer issues
    onAudioChunk(new Float32Array(input));
  };

  const source = audioContext.createMediaStreamSource(mediaStream);
  source.connect(node);
  // ScriptProcessorNode must be connected to destination to fire events
  node.connect(audioContext.destination);

  return { node, source, blobUrl: null };
}

export async function startCapture(
  onAudioChunk: (chunk: Float32Array) => void
): Promise<CaptureState> {
  const audioContext = new AudioContext({ sampleRate: 16000 });

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  let mediaStream: MediaStream;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
  } catch (error) {
    void audioContext.close();  // CR-03: close context on permission/device failure
    throw error;
  }

  let processorNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let blobUrl: string | null = null;

  try {
    // Primary path: AudioWorklet (off-main-thread, clean audio)
    const result = await tryAudioWorklet(audioContext, mediaStream, onAudioChunk);
    processorNode = result.node;
    sourceNode = result.source;
    blobUrl = result.blobUrl;
  } catch (_workletError) {
    // Fallback: ScriptProcessorNode (deprecated but works when CSP blocks blob: URLs)
    const fallback = createScriptProcessorFallback(audioContext, mediaStream, onAudioChunk);
    processorNode = fallback.node;
    sourceNode = fallback.source;
    blobUrl = fallback.blobUrl;
  }

  const cleanup = (): void => {
    if (processorNode) {
      try { processorNode.disconnect(); } catch { /* already closed */ }
    }
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch { /* already closed */ }
    }
    mediaStream.getTracks().forEach((track) => track.stop());
    void audioContext.close();
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  };

  return { audioContext, mediaStream, processorNode, sourceNode, blobUrl, cleanup };
}

export function stopCapture(state: CaptureState): void {
  state.cleanup();
}

export function calculateRMS(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

export function rmsToDecibels(rms: number): number {
  // Convert RMS amplitude to dB (full-scale, reference = 1.0)
  if (Number.isNaN(rms) || rms <= 0) {
    return -Infinity;
  }
  return 20 * Math.log10(rms);
}
