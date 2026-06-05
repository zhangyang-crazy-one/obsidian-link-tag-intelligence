import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PDF OCR source guard", () => {
  it("does not hard-code scanned PDF OCR to page 1 only", () => {
    const source = readFileSync("src/main.ts", "utf8");
    expect(source).not.toContain('pdftoppm -png -r 150 -f 1 -l 1 "${absolutePath}"');
    expect(source).toContain("runWithConcurrency<number, PdfPageOcrResult>");
    expect(source).toContain("paddleOcrPdfConcurrency");
    expect(source).toContain("new LocalOfflineOcrService(this.app, this.settings");
    expect(source).toContain("PDF 第 ${page}/${pageCount} 页");
    expect(source).toContain("buildPdfOcrPageMarker");
    expect(source).toContain("insertedDuringProcessing");
    expect(source).toContain("已按页写入当前文档");
    expect(source).toContain("assessPdfTextExtraction(text, pageCount)");
    expect(source).not.toContain("text.trim().length >= 10");
  });
});
