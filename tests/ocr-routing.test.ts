import { describe, expect, it, vi } from "vitest";
import { LocalOfflineOcrService } from "../src/ocr-service";

vi.mock("obsidian", () => {
  class Notice {
    constructor(_msg: string, _duration?: number) {}
  }
  class App {}
  return { Notice, App, TFile: class {}, Plugin: class {} };
});

function makeService(paddleText: string, kreuzbergText: string) {
  const app = {
    vault: {
      adapter: { getBasePath: () => "/tmp/fake-vault" },
      configDir: ".obsidian",
    },
  } as any;
  const service = new LocalOfflineOcrService(app, {
    paddleOcrTier: "server",
    paddleDetDbThresh: 0.2,
    paddleDetBoxThresh: 0.3,
    paddleDetUnclipRatio: 2,
    paddleDetMinSize: 2,
    paddleDetNmsIouThresh: 0.2,
    paddleDetMaxCandidates: 4000,
    paddleDetLimitSideLen: 2048,
    paddleDetScoreMode: "fast",
    paddleDetUseDilation: true,
    paddleOcrCpuThreads: 0,
  });
  (service as any).paddleOcrService = {
    runOcr: vi.fn(async () => paddleText),
  };
  (service as any).kreuzbergOcrService = {
    runOcr: vi.fn(async () => kreuzbergText),
  };
  return service;
}

describe("LocalOfflineOcrService OCR routing", () => {
  it("chooses Kreuzberg first for substantial Chinese OCR", async () => {
    const paddle = "本书的历史\n工程经济学第13版的特色\n电子表格模型贯穿于整本教材中。".repeat(3);
    const kreuzberg = "工程经济学 本书的历史 本书的前身 工程经济学概论 出版 作者 教材 课程 学生 成本 价值 方案 ".repeat(20);
    const service = makeService(paddle, kreuzberg);
    await expect(service.processTask("/tmp/page.png", "<OCR>", true)).resolves.toBe(kreuzberg);
    expect((service as any).kreuzbergOcrService.runOcr).toHaveBeenCalledTimes(1);
    expect((service as any).paddleOcrService.runOcr).not.toHaveBeenCalled();
  });

  it("runs PaddleOCR only when Kreuzberg returns a weak result", async () => {
    const paddle = "工程经济学教材正文内容，包含大量中文段落、术语说明、公式解释和章节标题。".repeat(30);
    const kreuzberg = "短结果";
    const service = makeService(paddle, kreuzberg);
    await expect(service.processTask("/tmp/page.png", "<OCR>", true)).resolves.toBe(paddle);
    expect((service as any).kreuzbergOcrService.runOcr).toHaveBeenCalledTimes(1);
    expect((service as any).paddleOcrService.runOcr).toHaveBeenCalledTimes(1);
  });
});
