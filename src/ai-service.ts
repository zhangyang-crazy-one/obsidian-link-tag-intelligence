import { App, FileSystemAdapter, TFile, requestUrl, Notice } from "obsidian";
import type { LinkTagIntelligenceSettings, AITemplate } from "./settings";
import { getSpeechModelDir } from "./settings";
import { debugLog } from "./debug-log";

export type AIProgressCallback = (statusKey: string, detail?: string) => void;

type ChatFlavor = "openai" | "anthropic";

/**
 * Accumulates Server-Sent Events from a streaming chat completion and
 * reassembles them into the SAME JSON shape the non-streaming endpoint
 * returns, so downstream parsing is identical.
 *
 *  - openai:   `data: {choices:[{delta:{content}}]}` lines, terminated
 *              by `data: [DONE]`. Final shape:
 *              `{choices:[{message:{content},finish_reason}], usage}`.
 *  - anthropic: typed events (message_start / content_block_delta /
 *              message_delta) carrying text deltas + usage. Final shape:
 *              `{content:[{type:"text",text}], stop_reason, usage}`.
 *
 * Exported for unit testing of the SSE grammar.
 */
export class StreamAccumulator {
  private content = "";
  private finishReason: string | null = null;
  private usage: any = null;
  private raw = "";

  constructor(private readonly flavor: ChatFlavor) {}

  /** Feed a single line (without trailing newline) from the SSE stream. */
  pushLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) return; // blank or comment
    if (!trimmed.startsWith("data:")) return;        // ignore `event:` lines
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;

    let evt: any;
    try {
      evt = JSON.parse(payload);
    } catch {
      return; // tolerate partial/garbage lines
    }
    this.raw += payload + "\n";

    if (this.flavor === "openai") {
      const choice = evt.choices?.[0];
      const delta = choice?.delta?.content;
      if (typeof delta === "string") this.content += delta;
      if (choice?.finish_reason) this.finishReason = choice.finish_reason;
      if (evt.usage) this.usage = evt.usage;
      return;
    }

    // anthropic
    switch (evt.type) {
      case "message_start":
        if (evt.message?.usage) this.usage = { ...evt.message.usage };
        break;
      case "content_block_delta": {
        const t = evt.delta?.text;
        if (typeof t === "string") this.content += t;
        break;
      }
      case "message_delta":
        if (evt.delta?.stop_reason) this.finishReason = evt.delta.stop_reason;
        if (evt.usage) this.usage = { ...(this.usage ?? {}), ...evt.usage };
        break;
      default:
        break;
    }
  }

  /** The concatenated raw `data:` payloads (for debugging / text field). */
  rawText(): string {
    return this.raw;
  }

  /** Reassemble into a non-streaming-shaped response body. */
  toResponseJson(): any {
    if (this.flavor === "openai") {
      return {
        choices: [{ message: { content: this.content }, finish_reason: this.finishReason }],
        usage: this.usage ?? undefined,
      };
    }
    return {
      content: [{ type: "text", text: this.content }],
      stop_reason: this.finishReason,
      usage: this.usage ?? undefined,
    };
  }
}

export class AIService {
  private app: App;
  private settings: LinkTagIntelligenceSettings;

  constructor(app: App, settings: LinkTagIntelligenceSettings) {
    this.app = app;
    this.settings = settings;
  }

  private extractChatText(json: any, flavor: ChatFlavor): string {
    if (flavor === "openai") {
      return String(json?.choices?.[0]?.message?.content ?? "").trim();
    }

    if (Array.isArray(json?.content)) {
      let content = json.content
        .filter((item: any) => item && item.type === "text" && typeof item.text === "string")
        .map((item: any) => item.text)
        .join("")
        .trim();

      if (!content) {
        content = json.content
          .filter((item: any) => item && typeof item.text === "string" && item.text.trim())
          .map((item: any) => item.text)
          .join("")
          .trim();
      }
      return content;
    }

    if (typeof json?.content === "string") {
      return json.content.trim();
    }

    return "";
  }

  private isTransientEmptyChatResponse(json: any, flavor: ChatFlavor): boolean {
    if (this.extractChatText(json, flavor)) return false;
    const usage = json?.usage ?? {};
    const outputTokenValue = usage.output_tokens
      ?? usage.completion_tokens
      ?? usage.outputTokens;
    const outputTokens = Number(outputTokenValue ?? 0);
    const stopReason = flavor === "openai"
      ? json?.choices?.[0]?.finish_reason
      : json?.stop_reason;
    return !stopReason || outputTokenValue === undefined || outputTokens === 0;
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

    if (this.isMiniMaxEndpoint()) {
      baseUrl = baseUrl.replace(/\/(?:anthropic(?:\/v1)?|v1)$/, "");
      return family === "anthropic"
        ? `${baseUrl}/anthropic/v1`
        : `${baseUrl}/v1`;
    }

    if (family === "anthropic") {
      if (/^https:\/\/api\.anthropic\.com(?:\/v1)?$/i.test(baseUrl)) {
        return baseUrl.toLowerCase().endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      }
      if (baseUrl.toLowerCase().endsWith("/anthropic/v1")) {
        return baseUrl;
      }
      if (baseUrl.toLowerCase().endsWith("/anthropic")) {
        return `${baseUrl}/v1`;
      }
      return `${baseUrl}/anthropic/v1`;
    }

    if (baseUrl.toLowerCase().endsWith("/v1")) {
      return baseUrl;
    }
    return `${baseUrl}/v1`;
  }

  private isMiniMaxEndpoint(): boolean {
    return this.settings.aiProvider === "minimax"
      || /minimax/i.test(this.settings.aiModel)
      || /minimax/i.test(this.settings.aiBaseUrl);
  }

  /**
   * Safe wrapper around requestUrl with automatic retry logic and
   * user notices.
   *
   * Note: Obsidian's requestUrl API does NOT accept a `timeout`
   * option (its RequestUrlParam interface has no such field), so the
   * only knob we have for unstable long-context calls is the retry
   * count / backoff (user-tunable via aiRequestRetries /
   * aiRequestRetryBaseMs). For long prefills, the chat paths use a
   * streaming backend instead (see streamChatRequest) which keeps
   * the connection alive and avoids net::ERR_EMPTY_RESPONSE.
   *
   * `execute` lets the caller swap in a different request backend
   * (e.g. the streaming one) while reusing this retry/backoff loop.
   */
  private async requestUrlWithRetry(
    options: any,
    maxRetries?: number,
    initialDelayMs?: number,
    execute?: (options: any) => Promise<{ status: number; text: string; json: any }>,
    validate?: (response: { status: number; text: string; json: any }) => void,
  ): Promise<any> {
    // Resolve retry config from settings (user-tunable) so they can
    // bump retries / base delay for unstable providers like M3
    // without code changes. Defaults preserve prior behavior.
    maxRetries = maxRetries ?? this.settings.aiRequestRetries ?? 5;
    initialDelayMs = initialDelayMs ?? this.settings.aiRequestRetryBaseMs ?? 2000;
    const runRequest = execute ?? ((opts: any) => requestUrl(opts));

    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await runRequest(options);

        // Return immediately if it's a successful response (200),
        // or a standard client error (4xx) which we should not retry.
        if (response.status === 200 || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
          if (response.status === 200) validate?.(response);
          return response;
        }

        throw new Error(`API 返回了 HTTP status ${response.status}`);
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message || String(err);
        // Classify the error. EMPTY_RESPONSE / aborted / network
        // errors are transient → retry. Hard 4xx (other than the
        // ones requestUrl re-throws) are persistent → don't retry.
        const isTransient = /EMPTY_RESPONSE|CONNECTION_CLOSED|CONNECTION_RESET|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ERR_|aborted|network|fetch|timeout|empty chat response|接口响应内容为空/i.test(errMsg)
          || errMsg.includes("status 5")
          || errMsg.includes("status 429");
        if (!isTransient && attempt < maxRetries) {
          throw err;
        }

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
   * Streaming request backend for chat completions. Uses Node's
   * `https`/`http` directly (desktop-only — same `require` context as
   * runLocalASR's child_process) instead of Obsidian's `requestUrl`,
   * because requestUrl buffers the whole response and a long M3
   * prefill stays silent long enough for Electron's net layer to drop
   * the socket (net::ERR_EMPTY_RESPONSE / ERR_CONNECTION_CLOSED).
   * A streamed (SSE) response keeps bytes flowing so the connection
   * never goes idle.
   *
   * Returns the SAME shape as requestUrl ({status, text, json}) so the
   * downstream parsing in runOpenAIChat / runAnthropicChat is reused
   * unchanged. `flavor` selects the SSE event grammar.
   */
  private streamChatRequest(
    options: { url: string; method?: string; headers?: Record<string, string>; body?: string },
    flavor: "openai" | "anthropic",
  ): Promise<{ status: number; text: string; json: any }> {
    // Test injection point (mirrors __mockRequestUrl). Lets unit tests
    // exercise the chat paths without a real socket. The mock receives
    // the request options and the flavor and returns {status,text,json}.
    const mock = (globalThis as unknown as {
      __mockStreamChatRequest?: (options: unknown, flavor: string) => Promise<{ status: number; text: string; json: any }>;
    }).__mockStreamChatRequest;
    if (mock) {
      return mock(options, flavor);
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const https = require("https");
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const http = require("http");
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const { URL } = require("url");

    return new Promise((resolve, reject) => {
      let parsed: any;
      try {
        parsed = new URL(options.url);
      } catch (e: any) {
        reject(new Error(`Invalid stream URL: ${e?.message ?? e}`));
        return;
      }
      const transport = parsed.protocol === "http:" ? http : https;
      const req = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
          path: parsed.pathname + parsed.search,
          method: options.method ?? "POST",
          headers: {
            ...(options.headers ?? {}),
            // Streaming endpoints expect to send back text/event-stream.
            "Accept": "text/event-stream",
          },
        },
        (res: any) => {
          const status: number = res.statusCode ?? 0;
          // Non-200: collect the (non-SSE) error body and hand it back
          // in the same shape so the caller's status check reports it.
          if (status !== 200) {
            let errBody = "";
            res.setEncoding("utf8");
            res.on("data", (c: string) => { errBody += c; });
            res.on("end", () => {
              let json: any = null;
              try { json = JSON.parse(errBody); } catch { /* leave null */ }
              resolve({ status, text: errBody, json });
            });
            return;
          }

          const acc = new StreamAccumulator(flavor);
          let buffer = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            buffer += chunk;
            // SSE events are separated by blank lines; process complete
            // lines and keep the trailing partial line in the buffer.
            let nlIndex: number;
            while ((nlIndex = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, nlIndex).replace(/\r$/, "");
              buffer = buffer.slice(nlIndex + 1);
              acc.pushLine(line);
            }
          });
          res.on("end", () => {
            if (buffer.trim()) acc.pushLine(buffer.replace(/\r$/, ""));
            resolve({ status: 200, text: acc.rawText(), json: acc.toResponseJson() });
          });
          res.on("error", (e: any) => reject(e));
        },
      );
      req.on("error", (e: any) => reject(new Error(e?.message ?? String(e))));
      if (options.body) req.write(options.body);
      req.end();
    });
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
    // aiProvider selects the endpoint preset / billing account. aiApiStyle
    // selects the wire format. Keep those separate so DeepSeek, MiniMax, and
    // custom gateways can use Anthropic-compatible Messages without being
    // remapped to Anthropic's official endpoint.
    if (this.settings.aiApiStyle === "anthropic" || this.settings.aiProvider === "anthropic") {
      return this.runAnthropicChat(prompt);
    }
    return this.runOpenAIChat(prompt);
  }

  private getMaxTokens(): number {
    const val = this.settings.aiMaxTokens || 4096;
    if (this.isMiniMaxEndpoint()) {
      // Per MiniMax docs the output cap is model-specific:
      //   MiniMax-M3  → 524288 (512K)
      //   M2/M2.1/M2.5/M2.7 and others → 204800 (200K)
      // A blanket 512000 cap would over-shoot the non-M3 models and
      // get the request rejected / silently truncated.
      const upper = this.isMiniMaxM3() ? 524288 : 204800;
      return Math.min(val, upper);
    }
    if (this.settings.aiProvider === "deepseek") {
      // DeepSeek V4 output cap is 384K; the old 1M cap could trip 422.
      return Math.min(val, 384000);
    }
    if (this.settings.aiProvider === "anthropic") {
      // Claude supports up to 16384 output tokens (e.g., Claude 3.5 Sonnet new limit).
      return Math.min(val, 16384);
    }
    // OpenAI and others: cap at 1M to be extremely generous for customizable APIs/proxies.
    return Math.min(val, 1000000);
  }

  /** True when the configured model is MiniMax-M3 (vs older M2.x). */
  private isMiniMaxM3(): boolean {
    return /m3/i.test(this.settings.aiModel);
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
          temperature: this.settings.aiTemperature ?? 1.0,
          stream: true
        }),
        throw: false
      }, undefined, undefined, (opts) => this.streamChatRequest(opts, "openai"), (res) => {
        const json = typeof res.json === "object" && res.json !== null ? res.json : JSON.parse(res.text);
        if (this.isTransientEmptyChatResponse(json, "openai")) {
          throw new Error(`empty chat response: ${JSON.stringify(json)}`);
        }
      });
    } catch (err: any) {
      debugLog(this.app, "ai.openai.request-failed", {
        provider: this.settings.aiProvider,
        apiStyle: this.settings.aiApiStyle,
        url,
        model: modelName,
        error: err?.message ?? String(err),
      });
      throw new Error(`Failed to request AI API: ${err.message || err}`);
    }

    if (response.status !== 200) {
      debugLog(this.app, "ai.openai.non-200", {
        provider: this.settings.aiProvider,
        apiStyle: this.settings.aiApiStyle,
        url,
        model: modelName,
        status: response.status,
        body: String(response.text ?? "").slice(0, 2000),
      });
      throw new Error(`Chat API error (${response.status}): ${response.text}`);
    }

    const json = typeof response.json === "object" && response.json !== null ? response.json : JSON.parse(response.text);
    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }
    const content = this.extractChatText(json, "openai");
    if (!content.trim()) {
      debugLog(this.app, "ai.openai.empty-content", {
        provider: this.settings.aiProvider,
        apiStyle: this.settings.aiApiStyle,
        url,
        model: modelName,
        finishReason: json.choices?.[0]?.finish_reason,
        usage: json.usage,
        responsePreview: JSON.stringify(json).slice(0, 4000),
      });
      throw new Error(`接口响应内容为空。完整响应体: ${JSON.stringify(json)}`);
    }
    if (json.usage) {
      // Cache observability: DeepSeek reports prompt_cache_hit_tokens /
      // prompt_cache_miss_tokens; MiniMax/Anthropic report
      // cache_read_input_tokens / cache_creation_input_tokens.
      debugLog(this.app, "ai.openai.usage", { model: modelName, usage: json.usage });
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
    // Both Authorization (Bearer) and x-api-key are sent so the same
    // code path works for Anthropic-official (x-api-key) and
    // compatible gateways like MiniMax / DeepSeek (Bearer).
    headers["Authorization"] = `Bearer ${this.settings.aiApiKey}`;
    headers["x-api-key"] = this.settings.aiApiKey;
    headers["anthropic-version"] = "2023-06-01";

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
          temperature: this.settings.aiTemperature ?? 1.0,
          // `thinking` is a MiniMax-M3-specific knob ("adaptive" lets
          // the model decide whether to think — the official default).
          // Only send it for M3; older M2.x have built-in thinking.
          ...(this.isMiniMaxM3() ? { thinking: { type: "adaptive" } } : {}),
          stream: true
        }),
        throw: false
      }, undefined, undefined, (opts) => this.streamChatRequest(opts, "anthropic"), (res) => {
        const json = typeof res.json === "object" && res.json !== null ? res.json : JSON.parse(res.text);
        if (this.isTransientEmptyChatResponse(json, "anthropic")) {
          throw new Error(`empty chat response: ${JSON.stringify(json)}`);
        }
      });
    } catch (err: any) {
      debugLog(this.app, "ai.anthropic.request-failed", {
        provider: this.settings.aiProvider,
        apiStyle: this.settings.aiApiStyle,
        url,
        model: modelName,
        error: err?.message ?? String(err),
      });
      throw new Error(`Failed to request Anthropic API: ${err.message || err}`);
    }

    if (response.status !== 200) {
      const body = (() => {
        try { return JSON.parse(response.text); } catch { return null; }
      })();
      const apiErrMsg = body?.error?.message ?? response.text;
      debugLog(this.app, "ai.anthropic.non-200", {
        provider: this.settings.aiProvider,
        apiStyle: this.settings.aiApiStyle,
        url,
        model: modelName,
        status: response.status,
        body: String(response.text ?? "").slice(0, 2000),
      });
      throw new Error(`Anthropic Messages API error (${response.status}): ${apiErrMsg}`);
    }

    const json = typeof response.json === "object" && response.json !== null ? response.json : JSON.parse(response.text);
    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }
    
    // Deliberately do not fall back to `thinking` blocks. MiniMax's
    // Anthropic-compatible endpoint may return structured reasoning
    // blocks before the final text; those are not user-facing content
    // and must not be inserted into notes.
    const content = this.extractChatText(json, "anthropic");

    if (!content.trim()) {
      debugLog(this.app, "ai.anthropic.empty-content", {
        provider: this.settings.aiProvider,
        apiStyle: this.settings.aiApiStyle,
        url,
        model: modelName,
        stopReason: json.stop_reason,
        usage: json.usage,
        responsePreview: JSON.stringify(json).slice(0, 4000),
      });
      throw new Error(`接口响应内容为空。完整响应体: ${JSON.stringify(json)}`);
    }
    if (json.usage) {
      debugLog(this.app, "ai.anthropic.usage", { model: modelName, usage: json.usage });
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
