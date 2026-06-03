import { App, FileSystemAdapter, TFile, requestUrl, Notice } from "obsidian";
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
   * Normalize the user-entered base URL for the requested API family.
   * For the MiniMax provider, the platform exposes both an OpenAI-style
   * endpoint (/v1) and an Anthropic-style endpoint (/anthropic/v1) on the
   * same host; we strip whatever family suffix the user entered and re-append
   * the correct one, so all of these inputs converge to the right URL:
   *   https://api.minimaxi.com            → /v1  or /anthropic/v1
   *   https://api.minimaxi.com/v1         → re-aimed to the other family
   *   https://api.minimaxi.com/anthropic  → /v1  or /anthropic/v1
   *   https://api.minimaxi.com/anthropic/v1 → re-aimed to the other family
   * For other providers we just strip common endpoint suffixes so the caller
   * can re-append the standard path segment.
   */
  private getNormalizedBaseUrl(family: "openai" | "anthropic" = "openai"): string {
    let baseUrl = this.settings.aiBaseUrl.trim().replace(/\/+$/, "");

    const suffixesToStrip = [
      "/chat/completions",
      "/messages",
      "/text/chatcompletion_v2",
      "/text/chatcompletion",
      "/audio/speech_to_text",
      "/audio/transcriptions"
    ];
    for (const suffix of suffixesToStrip) {
      if (baseUrl.toLowerCase().endsWith(suffix)) {
        baseUrl = baseUrl.slice(0, -suffix.length).replace(/\/+$/, "");
      }
    }

    if (this.settings.aiProvider === "minimax") {
      baseUrl = baseUrl.replace(/\/(?:anthropic(?:\/v1)?|v1)$/, "");
      return family === "anthropic"
        ? `${baseUrl}/anthropic/v1`
        : `${baseUrl}/v1`;
    }

    return baseUrl;
  }

  /**
   * Safe wrapper around requestUrl with automatic retry logic and user notices.
   */
  private async requestUrlWithRetry(
    options: any,
    maxRetries = 3,
    initialDelayMs = 1500
  ): Promise<any> {
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await requestUrl(options);
        
        // Return immediately if it's a successful response (200),
        // or a standard client error (4xx) which we should not retry.
        if (response.status === 200 || (response.status >= 400 && response.status < 500)) {
          return response;
        }
        
        throw new Error(`API returned HTTP status ${response.status}`);
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message || String(err);
        
        if (attempt < maxRetries) {
          const delay = initialDelayMs * Math.pow(2, attempt - 1);
          new Notice(`⚠️ [Local AI] 网络连接异常，正在尝试第 ${attempt} 次重连 (等待 ${Math.round(delay / 1000)}秒)...`, 4000);
          console.warn(`[lti-ai-retry] Attempt ${attempt} failed: ${errMsg}. Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error(`[lti-ai-retry] All ${maxRetries} attempts failed.`);
        }
      }
    }
    
    throw lastError || new Error("Request failed after all retry attempts.");
  }

  /**
   * Send the audio binary to cloud speech-to-text API (OpenAI Whisper or MiniMax ASR).
   */
  async runCloudASR(file: TFile, onProgress: AIProgressCallback): Promise<string> {
    onProgress("aiStatusAsr", "Uploading to Cloud...");
    const buffer = await this.app.vault.readBinary(file);
    
    let mimeType = "audio/wav";
    if (file.extension === "mp3") mimeType = "audio/mp3";
    else if (file.extension === "m4a") mimeType = "audio/m4a";
    else if (file.extension === "webm") mimeType = "audio/webm";
    else if (file.extension === "ogg") mimeType = "audio/ogg";
    else if (file.extension === "aac") mimeType = "audio/aac";

    let url = "";
    let modelName = "whisper-1";

    const baseUrl = this.getNormalizedBaseUrl();
    if (this.settings.aiProvider === "minimax") {
      modelName = "speech-to-text";
      url = `${baseUrl}/audio/speech_to_text`;
    } else {
      modelName = "whisper-1";
      url = `${baseUrl}/audio/transcriptions`;
    }

    const boundary = "----ObsidianFormBoundary" + Math.random().toString(36).substring(2, 15);
    
    const header1 = `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${modelName}\r\n`;
    const header2 = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    
    const encoder = new TextEncoder();
    const header1Bytes = encoder.encode(header1);
    const header2Bytes = encoder.encode(header2);
    const footerBytes = encoder.encode(footer);
    const fileBytes = new Uint8Array(buffer);
    
    const totalLength = header1Bytes.length + header2Bytes.length + fileBytes.length + footerBytes.length;
    const bodyBytes = new Uint8Array(totalLength);
    
    let offset = 0;
    bodyBytes.set(header1Bytes, offset);
    offset += header1Bytes.length;
    bodyBytes.set(header2Bytes, offset);
    offset += header2Bytes.length;
    bodyBytes.set(fileBytes, offset);
    offset += fileBytes.length;
    bodyBytes.set(footerBytes, offset);

    let response;
    try {
      response = await this.requestUrlWithRetry({
        url,
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.settings.aiApiKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body: bodyBytes.buffer,
        throw: false
      });
    } catch (err: any) {
      throw new Error(`Failed to request Cloud ASR API: ${err.message || err}`);
    }

    if (response.status !== 200) {
      throw new Error(`Cloud ASR API error (${response.status}): ${response.text}`);
    }

    const json = typeof response.json === "object" && response.json !== null ? response.json : JSON.parse(response.text);
    return json.text || json.transcript || "";
  }

  /**
   * Public entry point for callers that have already constructed
   * the prompt themselves (e.g. src/textbook-cleaner.ts drives
   * per-chapter cleanup with chapter metadata substituted into the
   * template before calling). Other internal call sites use this
   * too via processTranscription.
   */
  async runRefinement(prompt: string): Promise<string> {
    const provider = this.settings.aiProvider;

    // Anthropic path: native Anthropic provider, OR MiniMax provider when the
    // user picked the Anthropic wire format. The Anthropic format is required
    // for MiniMax M3 multimodal / image inputs (it uses structured content
    // blocks: { type: "text" | "image", ... }).
    if (provider === "anthropic" || (provider === "minimax" && this.settings.aiApiStyle === "anthropic")) {
      return this.runAnthropicChat(prompt);
    }
    // OpenAI-compatible path: OpenAI, DeepSeek, and MiniMax when the user
    // picked the OpenAI wire format (text-only requests).
    return this.runOpenAIChat(prompt);
  }

  private getMaxTokens(): number {
    const val = this.settings.aiMaxTokens || 4096;
    if (this.settings.aiProvider === "minimax") {
      // MiniMax-M3 supports up to 512000 output tokens.
      return Math.min(val, 512000);
    }
    if (this.settings.aiProvider === "deepseek") {
      // DeepSeek supports massive context/outputs, cap at 1M to prevent clipping.
      return Math.min(val, 1000000);
    }
    if (this.settings.aiProvider === "anthropic") {
      // Claude supports up to 16384 output tokens (e.g., Claude 3.5 Sonnet new limit).
      return Math.min(val, 16384);
    }
    // OpenAI and others: cap at 1M to be extremely generous for customizable APIs/proxies.
    return Math.min(val, 1000000);
  }

  private async runOpenAIChat(prompt: string): Promise<string> {
    const baseUrl = this.getNormalizedBaseUrl("openai");
    const url = `${baseUrl}/chat/completions`;

    // Pass the model name through as-is. Earlier code rewrote "MiniMax-M3"
    // to the legacy "MiniMax-Text-01" identifier, which the current
    // platform API rejects. The user-supplied value is the source of truth.
    const modelName = this.settings.aiModel.trim();
    const maxTokens = this.getMaxTokens();

    let response;
    try {
      response = await this.requestUrlWithRetry({
        url,
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.settings.aiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: maxTokens,
          messages: [
            { role: "user", content: prompt }
          ],
          temperature: 0.3
        }),
        throw: false
      });
    } catch (err: any) {
      throw new Error(`Failed to request AI API: ${err.message || err}`);
    }

    if (response.status !== 200) {
      throw new Error(`Chat API error (${response.status}): ${response.text}`);
    }

    const json = typeof response.json === "object" && response.json !== null ? response.json : JSON.parse(response.text);
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
    const baseUrl = this.getNormalizedBaseUrl("anthropic");
    const url = `${baseUrl}/messages`;

    // Pass the model name through as-is. Earlier code rewrote "MiniMax-M3"
    // to the legacy "MiniMax-Text-01" identifier, which the current
    // platform API rejects. The user-supplied value is the source of truth.
    const modelName = this.settings.aiModel.trim();
    const maxTokens = this.getMaxTokens();

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (this.settings.aiProvider === "minimax") {
      headers["Authorization"] = `Bearer ${this.settings.aiApiKey}`;
      headers["x-api-key"] = this.settings.aiApiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["x-api-key"] = this.settings.aiApiKey;
      headers["anthropic-version"] = "2023-06-01";
    }

    let response;
    try {
      response = await this.requestUrlWithRetry({
        url,
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelName,
          max_tokens: maxTokens,
          messages: [
            { role: "user", content: prompt }
          ],
          temperature: 0.3
        }),
        throw: false
      });
    } catch (err: any) {
      throw new Error(`Failed to request Anthropic API: ${err.message || err}`);
    }

    if (response.status !== 200) {
      throw new Error(`Anthropic Messages API error (${response.status}): ${response.text}`);
    }

    const json = typeof response.json === "object" && response.json !== null ? response.json : JSON.parse(response.text);
    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }
    
    // Parse content array robustly, extracting and joining all parts with multi-tier fallbacks
    let content = "";
    if (Array.isArray(json.content)) {
      // Tier 1: Extract all structured type === "text" parts
      content = json.content
        .filter((item: any) => item && item.type === "text" && typeof item.text === "string")
        .map((item: any) => item.text)
        .join("")
        .trim();

      // Tier 2: Extract any field named "text" if type-filtering yielded nothing
      if (!content) {
        content = json.content
          .filter((item: any) => item && typeof item.text === "string" && item.text.trim())
          .map((item: any) => item.text)
          .join("")
          .trim();
      }

      // Tier 3: Extract from "thinking" property if both of the above are empty (handles token cutoff/thinking-only cases)
      if (!content) {
        content = json.content
          .filter((item: any) => item && typeof item.thinking === "string" && item.thinking.trim())
          .map((item: any) => {
            const thinkingText = item.thinking;
            // If the thinking block contains code fences for markdown (e.g. ```markdown ... ```), extract it
            const mdMatch = thinkingText.match(/```markdown\n([\s\S]*?)(?:```|$)/) || thinkingText.match(/```\n([\s\S]*?)(?:```|$)/);
            if (mdMatch && mdMatch[1].trim()) {
              return mdMatch[1].trim();
            }
            return thinkingText;
          })
          .join("")
          .trim();
      }
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
