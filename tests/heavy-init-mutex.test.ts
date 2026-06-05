/**
 * Unit test for HeavyInitMutex — confirms the FIFO serialization contract
 * that prevents audio / OCR heavy inits from racing each other.
 */
import { describe, it, expect } from "vitest";
import { HeavyInitMutex, withHeavyInit } from "../src/heavy-init-mutex";

describe("HeavyInitMutex", () => {
  it("runs queued tasks strictly sequentially (FIFO)", async () => {
    const mutex = new HeavyInitMutex();
    const order: string[] = [];
    const tasks = [
      mutex.run("speech", async () => {
        order.push("speech:start");
        await new Promise((r) => setTimeout(r, 20));
        order.push("speech:end");
        return "speech-result";
      }),
      mutex.run("paddle", async () => {
        order.push("paddle:start");
        await new Promise((r) => setTimeout(r, 20));
        order.push("paddle:end");
        return "paddle-result";
      }),
      mutex.run("speech-model-download", async () => {
        order.push("speech-model-download:start");
        await new Promise((r) => setTimeout(r, 20));
        order.push("speech-model-download:end");
        return "speech-model-download-result";
      }),
    ];
    const results = await Promise.all(tasks);
    // Each task returns its own value, captured in promise order
    // (which mirrors the order they were queued).
    expect(results).toEqual(["speech-result", "paddle-result", "speech-model-download-result"]);
    // Serial execution: each :start must come after the previous :end.
    expect(order).toEqual([
      "speech:start", "speech:end",
      "paddle:start", "paddle:end",
      "speech-model-download:start", "speech-model-download:end",
    ]);
  });

  it("propagates errors from the inner task", async () => {
    const mutex = new HeavyInitMutex();
    const okTask = mutex.run("ok", async () => "good");
    const failTask = mutex.run("fail", async () => {
      throw new Error("boom");
    });
    await expect(okTask).resolves.toBe("good");
    await expect(failTask).rejects.toThrow("boom");
  });

  it("the default singleton is shared across the project", async () => {
    // Two independent callers, different "task" names — second waits
    // for first.
    const order: string[] = [];
    const t1 = withHeavyInit("caller-A", async () => {
      order.push("A:start");
      await new Promise((r) => setTimeout(r, 15));
      order.push("A:end");
    });
    const t2 = withHeavyInit("caller-B", async () => {
      order.push("B:start");
      await new Promise((r) => setTimeout(r, 5));
      order.push("B:end");
    });
    await Promise.all([t1, t2]);
    expect(order).toEqual([
      "A:start", "A:end",
      "B:start", "B:end",
    ]);
  });
});
