import { App, FileSystemAdapter, TFile } from "obsidian";
import type { LinkTagIntelligenceSettings, AITemplate } from "./settings";
import { getSpeechModelDir } from "./settings";

export type AIProgressCallback = (statusKey: string, detail?: string) => void;

export class AIService {
  private app: App;
  private settings: LinkTagIntelligenceSettings;

  constructor(app: App, settings: LinkTagIntelligenceSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * Decode any browser-supported audio file inside the vault into raw mono Float32Array PCM samples at 16kHz.
   */
  async decodeAudioFile(file: TFile): Promise<Float32Array> {
    const buffer = await this.app.vault.readBinary(file);
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    try {
      const audioBuffer = await audioCtx.decodeAudioData(buffer);
      // We take channel 0 (mono)
      return audioBuffer.getChannelData(0);
    } finally {
      void audioCtx.close();
    }
  }

  /**
   * Run local ASR on raw Float32Array PCM samples using the child process sherpa-onnx worker.
   */
  async runLocalASR(samples: Float32Array, onProgress: AIProgressCallback): Promise<string> {
    const adapter = this.app.vault.adapter;
    const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
    const pluginDir = basePath + "/.obsidian/plugins/link-tag-intelligence";
    
    // Get ASR model directory
    const modelDir = getSpeechModelDir(this.app, this.settings.speechLanguage);
    const lexicon = pluginDir + "/models/lexicon.txt";
    const ruleFsts = pluginDir + "/models/replace.fst";
    const hotwordsFile = this.settings.speechHotwordsFile ? (pluginDir + "/" + this.settings.speechHotwordsFile) : "";

    // Check if require is available (Obsidian Desktop/Electron context)
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const cp = require("child_process");
    const isWindows = process.platform === "win32";

    return new Promise<string>((resolve, reject) => {
      onProgress("aiStatusAsr", "0%");
      
      const child = cp.spawn("node", ["asr-worker.js"], {
        cwd: pluginDir,
        stdio: ["pipe", "pipe", "pipe"],
        shell: isWindows ? false : true,
        detached: isWindows ? false : true,
      });

      let stdoutBuf = "";
      let stderrLog = "";
      const sentences: string[] = [];
      let isReady = false;

      child.on("error", (err: Error) => {
        reject(new Error(`Failed to start local ASR process: ${err.message}`));
      });

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop() ?? "";
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === "ready") {
              if (msg.ok) {
                isReady = true;
                // Once ready, feed the audio stream
                void feedAudio();
              } else {
                child.kill();
                reject(new Error(msg.error || "ASR worker failed to initialize"));
              }
            } else if (msg.type === "result") {
              if (msg.text && msg.isEndpoint) {
                sentences.push(msg.text);
                onProgress("aiStatusAsr", sentences.join(" "));
              }
            }
          } catch { /* skip */ }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrLog += chunk.toString();
      });

      child.on("exit", (code: number) => {
        if (code !== null && code !== 0) {
          reject(new Error(`Local ASR process exited with code ${code}. Stderr: ${stderrLog}`));
        } else {
          resolve(sentences.join(" ").trim());
        }
      });

      // Send Init parameters
      child.stdin.write(JSON.stringify({
        type: "init",
        modelDir,
        language: this.settings.speechLanguage,
        vadSensitivity: this.settings.speechVadSensitivity,
        speechAutoPunctuate: this.settings.speechAutoPunctuate,
        decodingMethod: this.settings.speechDecodingMethod,
        speechMaxUtteranceSec: this.settings.speechMaxUtteranceSec,
        lexicon,
        ruleFsts,
        hotwordsFile
      }) + "\n");

      // Feed Audio in chunks
      const feedAudio = async () => {
        try {
          const chunkLength = 16000 * 2; // 2-second chunks
          const totalSamples = samples.length;
          
          for (let i = 0; i < totalSamples; i += chunkLength) {
            const chunk = samples.subarray(i, Math.min(i + chunkLength, totalSamples));
            const buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
            const base64 = buf.toString("base64");
            
            child.stdin.write(JSON.stringify({ type: "audio", bufferB64: base64 }) + "\n");
            
            const pct = Math.min(100, Math.round((i / totalSamples) * 100));
            onProgress("aiStatusAsr", `${pct}%`);
            
            // Yield event loop to keep UI responsive
            await new Promise(r => setTimeout(r, 10));
          }

          // Feed 2.5 seconds of silence to force the last sentence endpoint finalization
          const silence = new Float32Array(16000 * 2.5);
          const silenceBuf = Buffer.from(silence.buffer, silence.byteOffset, silence.byteLength);
          child.stdin.write(JSON.stringify({ type: "audio", bufferB64: silenceBuf.toString("base64") }) + "\n");
          
          // Let ASR process remaining queue, then destroy
          await new Promise(r => setTimeout(r, 1000));
          child.stdin.write(JSON.stringify({ type: "destroy" }) + "\n");
        } catch (err) {
          child.kill();
          reject(err);
        }
      };
    });
  }

  /**
   * Send the audio binary to cloud speech-to-text API (OpenAI Whisper or MiniMax ASR).
   */
  async runCloudASR(file: TFile, onProgress: AIProgressCallback): Promise<string> {
    onProgress("aiStatusAsr", "Uploading to Cloud...");
    const buffer = await this.app.vault.readBinary(file);
    const formData = new FormData();
    
    let mimeType = "audio/wav";
    if (file.extension === "mp3") mimeType = "audio/mp3";
    else if (file.extension === "m4a") mimeType = "audio/m4a";
    else if (file.extension === "webm") mimeType = "audio/webm";
    else if (file.extension === "ogg") mimeType = "audio/ogg";
    else if (file.extension === "aac") mimeType = "audio/aac";

    const blob = new Blob([buffer], { type: mimeType });
    formData.append("file", blob, file.name);

    let url = "";
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.settings.aiApiKey}`,
    };

    if (this.settings.aiProvider === "minimax") {
      formData.append("model", "speech-to-text");
      url = `${this.settings.aiBaseUrl}/audio/speech_to_text`;
    } else {
      formData.append("model", "whisper-1");
      url = `${this.settings.aiBaseUrl}/audio/transcriptions`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cloud ASR API error (${response.status}): ${errText}`);
    }

    const json = await response.json();
    return json.text || json.transcript || "";
  }

  /**
   * Run the LLM refinement completion (OpenAI-compatible or Anthropic).
   */
  async runRefinement(prompt: string): Promise<string> {
    const provider = this.settings.aiProvider;
    
    if (provider === "anthropic") {
      return this.runAnthropicChat(prompt);
    } else {
      // openai, deepseek, minimax are all openai-compatible chat completion endpoints
      return this.runOpenAIChat(prompt);
    }
  }

  private async runOpenAIChat(prompt: string): Promise<string> {
    const url = `${this.settings.aiBaseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.settings.aiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.settings.aiModel,
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Chat API error (${response.status}): ${errText}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }
    const content = json.choices?.[0]?.message?.content || "";
    if (!content.trim()) {
      throw new Error(`接口响应内容为空。完整响应体: ${JSON.stringify(json)}`);
    }
    return content;
  }

  private async runAnthropicChat(prompt: string): Promise<string> {
    const url = `${this.settings.aiBaseUrl}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": this.settings.aiApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.settings.aiModel,
        max_tokens: 4096,
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic Messages API error (${response.status}): ${errText}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }
    
    // Parse content array robustly, extracting and joining all "text" type parts
    let content = "";
    if (Array.isArray(json.content)) {
      content = json.content
        .filter((item: any) => item && item.type === "text" && typeof item.text === "string")
        .map((item: any) => item.text)
        .join("")
        .trim();
    } else if (typeof json.content === "string") {
      content = json.content.trim();
    }

    if (!content.trim()) {
      throw new Error(`接口响应内容为空。完整响应体: ${JSON.stringify(json)}`);
    }
    return content;
  }

  /**
   * Orchestrate full workflow: ASR -> Variable replacements -> LLM Refinement.
   */
  async processTranscription(
    audioFile: TFile | null,
    template: AITemplate,
    selection: string,
    wholeFileContent: string,
    onProgress: AIProgressCallback
  ): Promise<string> {
    // 1. ASR Stage
    let transcription = "";
    if (audioFile) {
      if (this.settings.aiAsrSource === "local") {
        onProgress("aiStatusDecoding");
        const samples = await this.decodeAudioFile(audioFile);
        transcription = await this.runLocalASR(samples, onProgress);
      } else {
        transcription = await this.runCloudASR(audioFile, onProgress);
      }

      if (!transcription.trim()) {
        throw new Error("No speech transcription captured.");
      }
    }

    // 2. Refinement Stage
    onProgress("aiStatusRefining");
    const dateStr = new Date().toISOString().split("T")[0];

    // Substitute placeholders
    let prompt = template.prompt;
    prompt = prompt.replace(/\{\{selection\}\}/g, selection || "");
    prompt = prompt.replace(/\{\{file:whole\}\}/g, wholeFileContent || "");
    prompt = prompt.replace(/\{\{date\}\}/g, dateStr);

    // If template has {{transcription}} placeholder, replace it. Otherwise, append transcription.
    if (prompt.includes("{{transcription}}")) {
      prompt = prompt.replace(/\{\{transcription\}\}/g, transcription);
    } else if (transcription) {
      prompt = `${prompt}\n\n待整理的转录文本：\n${transcription}`;
    }

    // If apiKey is empty, we just skip LLM refinement and return raw transcription!
    // This is a great fallback so users can still use it for pure local ASR without LLM.
    if (!this.settings.aiApiKey.trim()) {
      return transcription;
    }

    const refinedText = await this.runRefinement(prompt);
    return refinedText || transcription;
  }
}
