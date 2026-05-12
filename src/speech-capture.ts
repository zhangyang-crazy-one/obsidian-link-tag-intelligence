// AudioWorklet-based microphone capture with audio level metering.
// Used by the speech-to-text feature for Phase 01 audio pipeline.
// AudioWorklet processor code is embedded as a string and loaded via
// Blob URL to bypass Obsidian's CSP restriction on external module loads.

export interface CaptureState {
  audioContext: AudioContext | null;
  mediaStream: MediaStream | null;
  workletNode: AudioWorkletNode | null;
  sourceNode: MediaStreamAudioSourceNode | null;
  blobUrl: string | null;
  cleanup: () => void;
}

const WORKLET_PROCESSOR = `
class MicProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    if (input && input.length > 0 && input[0] && input[0].length > 0) {
      // Send mono PCM chunk to main thread for RMS calculation
      this.port.postMessage(input[0]);
    }
    return true; // keep processor alive; return false only when done
  }
}
registerProcessor('mic-processor', MicProcessor);
`;

export async function startCapture(
  onAudioChunk: (chunk: Float32Array) => void
): Promise<CaptureState> {
  // Create AudioContext on user gesture (NOT in plugin onload)
  // 16kHz sample rate matches sherpa-onnx Zipformer model expectations
  const audioContext = new AudioContext({ sampleRate: 16000 });

  // Resume if suspended (Chromium autoplay policy may suspend)
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  // Audio-only: prevents macOS Electron video+audio getUserMedia bug (Pitfall 5)
  // Disable all processing: raw PCM for ASR pipeline
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    },
    video: false
  });

  // Blob URL CSP workaround: Obsidian blocks audioWorklet.addModule(filePath)
  // Construct processor code as inline string, create Blob, load from blob: URL
  const blob = new Blob([WORKLET_PROCESSOR], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);

  let workletNode: AudioWorkletNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;

  try {
    await audioContext.audioWorklet.addModule(blobUrl);
    workletNode = new AudioWorkletNode(audioContext, "mic-processor");

    workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      onAudioChunk(event.data);
    };

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    sourceNode.connect(workletNode);

    const cleanup = (): void => {
      // Disconnect and close all audio pipeline resources.
      // Critical for hot-reload: prevents resource exhaustion (Pitfall 4).
      if (workletNode) {
        try { workletNode.port.onmessage = null; } catch { /* node already closed */ }
        try { workletNode.disconnect(); } catch { /* already disconnected */ }
      }
      if (sourceNode) {
        try { sourceNode.disconnect(); } catch { /* already disconnected */ }
      }
      // Stop all media tracks to release microphone
      mediaStream.getTracks().forEach((track) => track.stop());
      // Close AudioContext (releases audio hardware)
      void audioContext.close();
      // Revoke Blob URL to prevent memory leak
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };

    return { audioContext, mediaStream, workletNode, sourceNode, blobUrl, cleanup };
  } catch (error) {
    // Clean up partially created resources on failure
    mediaStream.getTracks().forEach((track) => track.stop());
    void audioContext.close();
    if (blobUrl) { URL.revokeObjectURL(blobUrl); }
    throw error;
  }
}

export function stopCapture(state: CaptureState): void {
  state.cleanup();
}

export function calculateRMS(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

export function rmsToDecibels(rms: number): number {
  // Convert RMS amplitude to dB (full-scale, reference = 1.0)
  if (rms <= 0) {
    return -Infinity;
  }
  return 20 * Math.log10(rms);
}
