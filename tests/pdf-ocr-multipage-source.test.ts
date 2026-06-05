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
    expect(source).toContain('const { execFile } = require("child_process")');
    expect(source).toContain('const os = require("os")');
    expect(source).toContain("const tempDir = os.tmpdir()");
    expect(source).toContain("path.join(tempDir");
    expect(source).toContain('runPdfCommand("pdfinfo", [absolutePath])');
    expect(source).toContain('runPdfCommand("pdftotext", [absolutePath, "-"]');
    expect(source).toContain('runPdfCommand("pdftoppm", [');
    expect(source).toContain("PaddleOCR 模型未就绪，无法继续执行扫描版 PDF OCR。");
    expect(source).toContain("PaddleOCR 模型未就绪，无法继续执行图片 OCR。");
    expect(source.indexOf('runPdfCommand("pdftotext", [absolutePath, "-"]')).toBeLessThan(
      source.indexOf("PaddleOCR 模型未就绪，无法继续执行扫描版 PDF OCR。")
    );
    expect(source).not.toContain('exec(`pdfinfo "${absolutePath}"');
    expect(source).not.toContain('exec(`pdftotext "${absolutePath}"');
    expect(source).not.toContain("exec(`pdftoppm");
    expect(source).not.toContain("fs.readdirSync(\"/tmp\")");
    expect(source).not.toContain("`/tmp/${tmpFile}`");
    expect(source).not.toContain("text.trim().length >= 10");
  });
});
