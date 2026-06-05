import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pickLocalOcrFileWithHtmlInput } from "../src/local-ocr-picker";

class FakeInput {
  type = "";
  accept = "";
  style: Record<string, string> = {};
  files: Array<{ name: string; path?: string }> | null = null;
  parentNode: { removeChild: (node: FakeInput) => void } | null = null;
  click = vi.fn();
  private listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, handler: () => void) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  emit(type: string) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler();
    }
  }
}

function makePickerDom() {
  const input = new FakeInput();
  const winListeners = new Map<string, Array<() => void>>();
  const body = {
    appendChild: vi.fn((node: FakeInput) => {
      node.parentNode = body;
      return node;
    }),
    removeChild: vi.fn((node: FakeInput) => {
      node.parentNode = null;
      return node;
    }),
  };
  const doc = {
    body,
    createElement: vi.fn(() => input),
  };
  const win = {
    addEventListener: vi.fn((type: string, handler: () => void) => {
      const handlers = winListeners.get(type) ?? [];
      handlers.push(handler);
      winListeners.set(type, handlers);
    }),
    removeEventListener: vi.fn((type: string, handler: () => void) => {
      const handlers = (winListeners.get(type) ?? []).filter((item) => item !== handler);
      winListeners.set(type, handlers);
    }),
    emit: (type: string) => {
      for (const handler of winListeners.get(type) ?? []) {
        handler();
      }
    },
  };
  return { input, doc, win, body };
}

describe("pickLocalOcrFileWithHtmlInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves null and removes the hidden input when the picker is canceled", async () => {
    const { input, doc, win, body } = makePickerDom();
    const promise = pickLocalOcrFileWithHtmlInput({
      doc: doc as unknown as Document,
      win: win as unknown as Window,
      cancelDelayMs: 5,
      timeoutMs: 1_000,
    });

    expect(input.click).toHaveBeenCalledTimes(1);
    win.emit("focus");
    await vi.advanceTimersByTimeAsync(5);

    await expect(promise).resolves.toBeNull();
    expect(body.removeChild).toHaveBeenCalledWith(input);
  });

  it("resolves the selected absolute file path on change", async () => {
    const { input, doc, win, body } = makePickerDom();
    const promise = pickLocalOcrFileWithHtmlInput({
      doc: doc as unknown as Document,
      win: win as unknown as Window,
      cancelDelayMs: 5,
      timeoutMs: 1_000,
    });

    input.files = [{ name: "scan.pdf", path: "/tmp/scan.pdf" }];
    input.emit("change");

    await expect(promise).resolves.toEqual({
      absolutePath: "/tmp/scan.pdf",
      fileName: "scan.pdf",
      isPdf: true,
    });
    expect(body.removeChild).toHaveBeenCalledWith(input);
  });
});
