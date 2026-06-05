import { afterEach, describe, expect, it } from "vitest";
import { AIService, StreamAccumulator } from "../src/ai-service";

const makeApp = () => ({
  vault: {
    configDir: ".obsidian",
    adapter: {
      stat: async () => null,
      exists: async () => true,
      mkdir: async () => undefined,
      append: async () => undefined,
      write: async () => undefined,
    },
  },
});

const makeSettings = (overrides: Record<string, unknown>) => ({
  aiProvider: "minimax",
  aiApiStyle: "anthropic",
  aiModel: "MiniMax-M3",
  aiApiKey: "test-key",
  aiBaseUrl: "https://api.minimaxi.com",
  aiMaxTokens: 8192,
  aiTemperature: 1.0,
  aiRequestRetries: 1,
  aiRequestRetryBaseMs: 1,
  ...overrides,
});

type StreamMock = (options: any, flavor: string) => Promise<{ status: number; text: string; json: any }>;

// Install a mock for the streaming chat backend (chat paths now stream
// via streamChatRequest instead of requestUrl). Records the request
// options in `calls` and returns a non-streaming-shaped body so the
// downstream parsing path is exercised.
const installStreamMock = (calls: any[], impl?: StreamMock): void => {
  (globalThis as { __mockStreamChatRequest?: StreamMock }).__mockStreamChatRequest = async (options, flavor) => {
    calls.push(options);
    if (impl) return impl(options, flavor);
    const text = "ok";
    return flavor === "anthropic"
      ? { status: 200, text, json: { content: [{ type: "text", text }] } }
      : { status: 200, text, json: { choices: [{ message: { content: text } }] } };
  };
};

describe("AIService endpoint routing", () => {
  afterEach(() => {
    delete (globalThis as { __mockStreamChatRequest?: unknown }).__mockStreamChatRequest;
  });

  it("uses MiniMax Anthropic-compatible endpoint without remapping to Anthropic official", async () => {
    const calls: any[] = [];
    installStreamMock(calls, async () => ({
      status: 200,
      text: "Success",
      json: { content: [{ type: "text", text: "Success" }] },
    }));

    const service = new AIService(makeApp() as any, makeSettings({}) as any);
    await expect(service.runRefinement("hello")).resolves.toBe("Success");

    expect(calls[0].url).toBe("https://api.minimaxi.com/anthropic/v1/messages");
    expect(JSON.parse(calls[0].body).model).toBe("MiniMax-M3");
    expect(JSON.parse(calls[0].body).thinking).toEqual({ type: "adaptive" });
    expect(JSON.parse(calls[0].body).stream).toBe(true);
  });

  it("detects MiniMax-compatible settings even when provider preset is anthropic", async () => {
    const calls: any[] = [];
    installStreamMock(calls);

    const service = new AIService(makeApp() as any, makeSettings({
      aiProvider: "anthropic",
      aiApiStyle: "anthropic",
      aiBaseUrl: "https://api.minimaxi.com/anthropic",
      aiModel: "MiniMax-M3",
      aiMaxTokens: 888998,
    }) as any);
    await expect(service.runRefinement("hello")).resolves.toBe("ok");

    const body = JSON.parse(calls[0].body);
    expect(calls[0].url).toBe("https://api.minimaxi.com/anthropic/v1/messages");
    expect(body.thinking).toEqual({ type: "adaptive" });
    // M3 output cap is 524288 (older M2.x would clamp to 204800).
    expect(body.max_tokens).toBe(524288);
  });

  it("clamps older MiniMax M2.x output tokens to 204800 and omits thinking", async () => {
    const calls: any[] = [];
    installStreamMock(calls);

    const service = new AIService(makeApp() as any, makeSettings({
      aiModel: "MiniMax-M2",
      aiMaxTokens: 888998,
    }) as any);
    await expect(service.runRefinement("hello")).resolves.toBe("ok");

    const body = JSON.parse(calls[0].body);
    expect(body.max_tokens).toBe(204800);
    // thinking is M3-only.
    expect(body.thinking).toBeUndefined();
  });

  it("sends the configured temperature", async () => {
    const calls: any[] = [];
    installStreamMock(calls);

    const service = new AIService(makeApp() as any, makeSettings({
      aiTemperature: 0.2,
    }) as any);
    await service.runRefinement("hello");

    expect(JSON.parse(calls[0].body).temperature).toBe(0.2);
  });

  it("lets non-MiniMax compatible gateways use Anthropic wire format on their own base URL", async () => {
    const calls: any[] = [];
    installStreamMock(calls);

    const service = new AIService(makeApp() as any, makeSettings({
      aiProvider: "deepseek",
      aiApiStyle: "anthropic",
      aiBaseUrl: "https://api.deepseek.com",
      aiModel: "deepseek-chat",
    }) as any);
    await expect(service.runRefinement("hello")).resolves.toBe("ok");

    expect(calls[0].url).toBe("https://api.deepseek.com/anthropic/v1/messages");
    expect(calls[0].url).not.toContain("api.anthropic.com");
    // thinking is M3-only — DeepSeek must not get it.
    expect(JSON.parse(calls[0].body).thinking).toBeUndefined();
  });

  it("retries transient Electron connection closed errors", async () => {
    const calls: any[] = [];
    installStreamMock(calls, async () => {
      if (calls.length === 1) {
        throw new Error("net::ERR_CONNECTION_CLOSED");
      }
      return { status: 200, text: "retry ok", json: { content: [{ type: "text", text: "retry ok" }] } };
    });

    const service = new AIService(makeApp() as any, makeSettings({
      aiRequestRetries: 2,
      aiRequestRetryBaseMs: 1,
    }) as any);
    await expect(service.runRefinement("hello")).resolves.toBe("retry ok");
    expect(calls).toHaveLength(2);
  });

  it("uses the OpenAI chat endpoint and stream flag for openai wire format", async () => {
    const calls: any[] = [];
    installStreamMock(calls);

    const service = new AIService(makeApp() as any, makeSettings({
      aiProvider: "deepseek",
      aiApiStyle: "openai",
      aiBaseUrl: "https://api.deepseek.com",
      aiModel: "deepseek-v4-flash",
    }) as any);
    await expect(service.runRefinement("hello")).resolves.toBe("ok");

    expect(calls[0].url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(JSON.parse(calls[0].body).stream).toBe(true);
  });
});

describe("StreamAccumulator SSE parsing", () => {
  it("reassembles OpenAI delta chunks into a non-streaming body", () => {
    const acc = new StreamAccumulator("openai");
    for (const line of [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}`,
      "",
      `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" }, finish_reason: "stop" }] })}`,
      `data: ${JSON.stringify({ usage: { prompt_tokens: 3, completion_tokens: 2 } })}`,
      "data: [DONE]",
    ]) {
      acc.pushLine(line);
    }
    const json = acc.toResponseJson();
    expect(json.choices[0].message.content).toBe("Hello");
    expect(json.choices[0].finish_reason).toBe("stop");
    expect(json.usage).toEqual({ prompt_tokens: 3, completion_tokens: 2 });
  });

  it("reassembles Anthropic typed events into a non-streaming body", () => {
    const acc = new StreamAccumulator("anthropic");
    for (const line of [
      `data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 10 } } })}`,
      `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Wor" } })}`,
      `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "ld" } })}`,
      `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } })}`,
    ]) {
      acc.pushLine(line);
    }
    const json = acc.toResponseJson();
    expect(json.content[0].text).toBe("World");
    expect(json.stop_reason).toBe("end_turn");
    expect(json.usage).toEqual({ input_tokens: 10, output_tokens: 2 });
  });

  it("tolerates blank lines, comments, and malformed payloads", () => {
    const acc = new StreamAccumulator("openai");
    acc.pushLine(": ping");
    acc.pushLine("");
    acc.pushLine("event: message");
    acc.pushLine("data: {not valid json");
    acc.pushLine(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}`);
    expect(acc.toResponseJson().choices[0].message.content).toBe("ok");
  });
});
