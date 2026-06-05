import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import * as cp from "child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KreuzbergOcrService } from "../src/kreuzberg-ocr-service";

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("KreuzbergOcrService worker startup", () => {
  it("rejects runOcr when the worker exits before it emits ready", async () => {
    const child = makeFakeChild();
    vi.mocked(cp.spawn).mockReturnValue(child);

    const service = new KreuzbergOcrService("/tessdata", "/workers/kreuzberg-worker.cjs");
    const ocrPromise = service.runOcr("/input.png");

    child.emit("exit", 1, null);

    await expect(ocrPromise).rejects.toThrow(/kreuzberg-worker exited unexpectedly/);
    expect(child.stdin?.write).not.toHaveBeenCalled();
  });

  it("spawns the worker without a shell so paths are passed as argv", async () => {
    const child = makeFakeChild();
    vi.mocked(cp.spawn).mockReturnValue(child);

    const service = new KreuzbergOcrService("/tessdata", "/workers/My Vault/kreuzberg-worker.cjs");
    const ocrPromise = service.runOcr("/input.png");

    child.emit("exit", 1, null);
    await expect(ocrPromise).rejects.toThrow(/kreuzberg-worker exited unexpectedly/);

    expect(cp.spawn).toHaveBeenCalledWith(
      "node",
      ["/workers/My Vault/kreuzberg-worker.cjs"],
      expect.objectContaining({ shell: false }),
    );
  });

  it("releases the worker when the idle timer fires", () => {
    const source = readFileSync("src/kreuzberg-ocr-service.ts", "utf8");
    expect(source).toContain("this.stopWorker();");
    expect(source).toContain("private stopWorker(): void");
    expect(source).toContain("this.child = null;");
    expect(source).toContain('process.kill(-(child.pid ?? 0), "SIGTERM")');
  });

  it("does not stop the worker while an OCR job is still running", async () => {
    vi.useFakeTimers();
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const child = makeFakeChild();
    vi.mocked(cp.spawn).mockReturnValue(child);

    const service = new KreuzbergOcrService("/tessdata", "/workers/kreuzberg-worker.cjs");
    const ocrPromise = service.runOcr("/input.png");
    child.stdout?.emit("data", Buffer.from(JSON.stringify({ type: "ready" }) + "\n"));
    await vi.advanceTimersByTimeAsync(121_000);

    expect(child.stdin?.end).not.toHaveBeenCalled();
    expect(killSpy).not.toHaveBeenCalled();

    const writePayload = vi.mocked(child.stdin!.write).mock.calls[0]?.[0] as string;
    const jobId = JSON.parse(writePayload).jobId;
    child.stdout?.emit("data", Buffer.from(JSON.stringify({ type: "result", jobId, text: "done" }) + "\n"));
    await expect(ocrPromise).resolves.toBe("done");

    await vi.advanceTimersByTimeAsync(121_000);
    expect(child.stdin?.end).toHaveBeenCalledTimes(1);
  });
});
