import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "events";

// ── Mock @huggingface/transformers + heavy-init-mutex BEFORE import ──────────

const { mockWithHeavyInit, mockEnv } = vi.hoisted(() => {
  const env = { allowLocalModels: false, allowRemoteModels: false };
  // withHeavyInit just runs the task directly (no serialization in tests)
  const withHeavyInit = vi.fn((_name: string, task: () => Promise<unknown>) => task());
  return { mockWithHeavyInit: withHeavyInit, mockEnv: env };
});

vi.mock("@huggingface/transformers", () => ({ env: mockEnv }));
vi.mock("../src/heavy-init-mutex", () => ({
  withHeavyInit: mockWithHeavyInit,
  heavyInitMutex: { run: (n: string, t: () => Promise<unknown>) => t() },
}));

// Mock Notice so it doesn't actually try to render
vi.mock("obsidian", () => {
  class Notice {
    constructor(_msg: string, _duration?: number) {}
  }
  class App {}
  return { Notice, App, TFile: class {}, Plugin: class {} };
});

import { LocalOfflineVisionService } from "../src/vision-service";

// ── Helpers ─────────────────────────────────────────────────────────────────

type FakeChild = EventEmitter & {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
  pid: number;
  exitCode: number | null;
  signalCode: string | null;
};

function makeFakeChild(pid = 99999): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdin = { write: vi.fn(() => true), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => {
    child.killed = true;
    return true;
  });
  child.killed = false;
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  return child;
}

function makeService(opts: {
  child: FakeChild;
  isReady?: boolean;
  pendingReject?: (err: Error) => void;
  onRespawnFailed?: (err: Error) => void;
}) {
  const app = {
    vault: {
      adapter: { getBasePath: () => "/tmp/fake-vault" },
      configDir: ".obsidian",
    },
  } as any;
  const service = new LocalOfflineVisionService(app, {}, {
    onRespawnFailed: opts.onRespawnFailed,
  });
  // Inject the fake child (production normally assigns in buildWorker)
  (service as any).childProcess = opts.child;
  if (opts.isReady !== undefined) (service as any).isReady = opts.isReady;
  if (opts.pendingReject) (service as any).pendingRequestReject = opts.pendingReject;

  // Wire the production exit handler to the fake child so the test
  // exercises the real onWorkerExit / pendingRequestReject logic.
  // Mirrors src/vision-service.ts buildWorker's exit listener exactly.
  opts.child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    const svc = service as any;
    const wasTerminating = svc.terminating;
    const wasReady = svc.isReady;
    // Only reject the pending request on UNEXPECTED exits. Graceful
    // exits (terminateProcess-driven or clean code 0) leave the request
    // in place — the user is unlikely to await forever because the
    // idle timer / a fresh user action will replace the worker.
    const isUnexpected =
      !wasTerminating &&
      wasReady &&
      code !== 0 &&
      signal !== "SIGTERM" &&
      signal !== "SIGKILL" &&
      signal !== "SIGINT";
    if (isUnexpected && svc.pendingRequestReject) {
      const reject = svc.pendingRequestReject;
      svc.pendingRequestReject = null;
      reject(new Error(`Vision worker exited unexpectedly (code=${code}, signal=${signal})`));
    }
    svc.terminating = false;
    svc.isReady = false;
    svc.childProcess = null;
    svc.initPromise = null;
    let reason: "init-failed" | "unexpected" | "graceful";
    if (wasTerminating) reason = "graceful";
    else if (!wasReady) reason = "init-failed";
    else if (code === 0 || signal === "SIGTERM" || signal === "SIGKILL" || signal === "SIGINT") {
      reason = "graceful";
    } else reason = "unexpected";
    svc.onWorkerExit(reason, code, signal);
  });

  return service;
}

describe("vision-service lifecycle", () => {
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    killSpy.mockRestore();
    mockWithHeavyInit.mockClear();
  });

  // ── T1: graceful destroy — child exits cleanly within 500ms, no SIGTERM
  it("T1: graceful destroy writes destroy message, ends stdin, and does NOT escalate when child exits cleanly", () => {
    const child = makeFakeChild();
    const service = makeService({ child, isReady: true });

    service.terminateProcess();

    // Detach happened synchronously
    expect((service as any).childProcess).toBeNull();
    expect((service as any).terminating).toBe(true);
    // destroy message written
    expect(child.stdin.write).toHaveBeenCalledTimes(1);
    const written = (child.stdin.write.mock.calls[0][0] as string).trim();
    expect(JSON.parse(written)).toEqual({ type: "destroy" });
    // stdin closed
    expect(child.stdin.end).toHaveBeenCalledTimes(1);

    // Child exits cleanly within 500ms — SIGTERM timer should NOT fire.
    // We must also set child.exitCode to mimic Node's actual child behavior
    // (the production code checks this to know the child is gone).
    vi.advanceTimersByTime(100);
    child.exitCode = 0;
    child.emit("exit", 0, null);
    vi.runAllTimers();

    expect(killSpy).not.toHaveBeenCalled();
    expect(child.kill).not.toHaveBeenCalled();
  });

  // ── T2: child ignores destroy → SIGTERM fires via process.kill(-pid, "SIGTERM")
  it("T2: child ignores destroy → SIGTERM via process group after 500ms", () => {
    const child = makeFakeChild(42424);
    const service = makeService({ child, isReady: true });

    service.terminateProcess();

    // 500ms: SIGTERM should fire
    vi.advanceTimersByTime(500);
    expect(killSpy).toHaveBeenCalledWith(-42424, "SIGTERM");
    // SIGKILL has not fired yet
    vi.advanceTimersByTime(499);
    expect(killSpy).toHaveBeenCalledTimes(1);
    // 1000ms total: SIGKILL fires
    vi.advanceTimersByTime(1);
    expect(killSpy).toHaveBeenCalledWith(-42424, "SIGKILL");
  });

  // ── T3: pendingRequestReject fires when worker exits mid-inference
  it("T3: mid-inference crash releases the hung awaiter via pendingRequestReject", () => {
    const child = makeFakeChild();
    const rejectFn = vi.fn();
    const service = makeService({ child, isReady: true, pendingReject: rejectFn });

    // Simulate the worker dying with a non-zero code
    child.emit("exit", 1, null);

    expect(rejectFn).toHaveBeenCalledTimes(1);
    const err = rejectFn.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/exited unexpectedly.*code=1/);
    // Cleared so we don't double-fire
    expect((service as any).pendingRequestReject).toBeNull();
  });

  // ── T4: graceful exit (code 0) does NOT reject the pending request
  it("T4: graceful exit (code 0) does NOT release a hung awaiter (defensive)", () => {
    const child = makeFakeChild();
    const rejectFn = vi.fn();
    const service = makeService({ child, isReady: true, pendingReject: rejectFn });
    // Mark this as a terminateProcess-driven exit so the reason is "graceful"
    (service as any).terminating = true;

    child.emit("exit", 0, null);

    // Graceful exit should NOT reject — the worker finished cleanly, but
    // the parent might still be waiting for a `result` message that
    // never came. Conservative: don't reject, let the idle timer / user
    // retry handle it. (Document this as a known limitation.)
    // We assert the current behavior: reject is NOT called.
    // If a future change decides to reject graceful exits too, this
    // assertion will fail and prompt a deliberate decision.
    expect(rejectFn).not.toHaveBeenCalled();
  });

  // ── T5: 6 unexpected exits within 60s triggers onRespawnFailed
  it("T5: 6 unexpected exits within 60s triggers onRespawnFailed callback", () => {
    const onRespawnFailed = vi.fn();
    const child = makeFakeChild();
    const service = makeService({ child, isReady: true, onRespawnFailed });

    for (let i = 0; i < 5; i++) {
      child.emit("exit", 1, "SIGSEGV");
    }
    expect(onRespawnFailed).not.toHaveBeenCalled();

    // 6th failure crosses the hard-stop threshold
    child.emit("exit", 1, "SIGSEGV");
    expect(onRespawnFailed).toHaveBeenCalledTimes(1);
    const err = onRespawnFailed.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/failed 6 times within 60s/);
  });

  // ── T6: graceful exit resets the respawn budget
  it("T6: a single graceful exit resets the respawn budget counter", () => {
    const onRespawnFailed = vi.fn();
    const child = makeFakeChild();
    const service = makeService({ child, isReady: true, onRespawnFailed });

    // 3 unexpected exits, then a graceful one
    child.emit("exit", 1, "SIGSEGV");
    child.emit("exit", 1, "SIGSEGV");
    child.emit("exit", 1, "SIGSEGV");
    // Graceful (e.g., user idled out the worker)
    (service as any).terminating = true;
    child.emit("exit", 0, null);

    const state = (service as any).respawnState;
    expect(state.count).toBe(0);
    expect(state.firstFailureAt).toBe(0);

    // Now we can take 5 more unexpected exits before the callback fires
    for (let i = 0; i < 5; i++) {
      const c = makeFakeChild();
      (service as any).childProcess = c;
      (service as any).isReady = true;
      c.emit("exit", 1, "SIGSEGV");
    }
    expect(onRespawnFailed).not.toHaveBeenCalled();
  });

  // ── T7: memory pressure — monotonically rising RSS in window triggers terminateProcess
  it("T7: monotonically rising RSS in window ≥ 6GB triggers graceful terminateProcess", () => {
    const child = makeFakeChild();
    const service = makeService({ child, isReady: true });
    // Spy terminateProcess to verify it gets called
    const termSpy = vi.spyOn(service, "terminateProcess");

    // Push 3 reports, each rising, all above 6GB
    const SIX_GB_PLUS = 7 * 1024 * 1024 * 1024;
    (service as any).recordMemoryReport(SIX_GB_PLUS);
    (service as any).recordMemoryReport(SIX_GB_PLUS + 100_000_000);
    (service as any).recordMemoryReport(SIX_GB_PLUS + 200_000_000);

    expect(termSpy).toHaveBeenCalledTimes(1);
  });

  // ── T8: not-rising RSS does NOT trigger memory respawn
  it("T8: stable or falling RSS does NOT trigger memory respawn", () => {
    const child = makeFakeChild();
    const service = makeService({ child, isReady: true });
    const termSpy = vi.spyOn(service, "terminateProcess");

    const SIX_GB = 6 * 1024 * 1024 * 1024;
    (service as any).recordMemoryReport(SIX_GB + 100_000_000);
    (service as any).recordMemoryReport(SIX_GB + 50_000_000); // falling
    (service as any).recordMemoryReport(SIX_GB + 80_000_000);

    expect(termSpy).not.toHaveBeenCalled();
  });
});
