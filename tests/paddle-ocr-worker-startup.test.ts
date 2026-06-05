import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import * as cp from "child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaddleOcrService } from "../src/paddle-ocr-service";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

function makeFakeChild(): cp.ChildProcess {
  const child = new EventEmitter() as cp.ChildProcess;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  } as unknown as cp.ChildProcess["stdin"];
  return child;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PaddleOcrService worker startup", () => {
  it("rejects init when the worker exits before it emits ready", async () => {
    const child = makeFakeChild();
    vi.mocked(cp.spawn).mockReturnValue(child);

    const service = new PaddleOcrService("/models", "/workers/paddle-ocr-worker.cjs");
    const initPromise = service.init();

    child.emit("exit", 1, null);

    await expect(initPromise).rejects.toThrow(/paddle-ocr-worker exited unexpectedly/);
    expect(child.stdin?.write).not.toHaveBeenCalled();
  });
});
