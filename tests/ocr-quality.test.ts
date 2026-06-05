import { describe, expect, it } from "vitest";
import { assessPdfTextExtraction } from "../src/ocr-quality";
import { scoreOcrTextQuality, shouldChallengePaddleOcrResult } from "../src/ocr-service";

describe("PDF text extraction quality gate", () => {
  it("rejects tiny pdftotext residue on a multi-page textbook", () => {
    const report = assessPdfTextExtraction("目录\n1\n2\n", 700);
    expect(report.usable).toBe(false);
    expect(report.reason).toBe("too-short");
    expect(report.requiredChars).toBeGreaterThan(10);
  });

  it("accepts substantial digital text", () => {
    const text = Array.from({ length: 10 }, (_, i) =>
      `Page ${i + 1} Engineering economics chapter content with formulas and explanations `.repeat(12)
    ).join("\n");
    const report = assessPdfTextExtraction(text, 10);
    expect(report.usable).toBe(true);
    expect(report.reason).toBe("ok");
  });

  it("rejects long punctuation-only extraction", () => {
    const report = assessPdfTextExtraction("---- .... //// \n".repeat(120), 10);
    expect(report.usable).toBe(false);
    expect(report.reason).toBe("too-few-meaningful-chars");
  });
});

describe("PaddleOCR result challenge heuristic", () => {
  it("challenges very short non-empty PaddleOCR output", () => {
    expect(shouldChallengePaddleOcrResult("第 1 章")).toBe(true);
  });

  it("challenges medium-length dense textbook fragments", () => {
    const fragment = "本书的历史\n工程经济学第13版的特色\n电子表格模型贯穿于整本教材中。".repeat(4);
    expect(fragment.length).toBeGreaterThan(80);
    expect(fragment.length).toBeLessThan(400);
    expect(shouldChallengePaddleOcrResult(fragment)).toBe(true);
  });

  it("challenges Latin-heavy output", () => {
    expect(shouldChallengePaddleOcrResult("Engineering economics ".repeat(8))).toBe(true);
  });

  it("does not challenge substantial CJK output", () => {
    expect(shouldChallengePaddleOcrResult("工程经济学教材正文内容，包含大量中文段落和术语说明。".repeat(25))).toBe(false);
  });
});

describe("OCR text quality scoring", () => {
  it("prefers complete CJK OCR over short PaddleOCR fragments", () => {
    const shortPaddle = "本书的历史\n工程经济学第13版的特色\n电子表格模型贯穿于整本教材中。".repeat(3);
    const completeChinese = "工程经济学 本书的历史 本书的前身 工程经济学概论 作者 出版 教材 内容 课程 学生 方案 成本 价值 练习题 ".repeat(20);
    expect(scoreOcrTextQuality(completeChinese).score).toBeGreaterThan(scoreOcrTextQuality(shortPaddle).score);
  });

  it("penalizes replacement noise", () => {
    expect(scoreOcrTextQuality("工程经济学正文内容".repeat(10)).score)
      .toBeGreaterThan(scoreOcrTextQuality("工程经济学□□□�正文内容".repeat(10)).score);
  });
});
