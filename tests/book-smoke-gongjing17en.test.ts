/**
 * Real-PDF smoke test: 工程经济学 第17版 英文版.pdf, first 10 pages.
 * Run: npx vitest run tests/book-smoke-gongjing17en.test.ts
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PaddleOcrEngine } from "../src/paddle-ocr-service";

const MODEL_DIR = "/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/models/ocr/pp-ocrv5/mobile";
const PAGES_DIR = "/tmp/ocr-test-gongjing17en";
const SOURCE_PDF = "工程经济学 第17版 英文版.pdf (first 10 pages @ 200dpi)";

describe("Book smoke: gongjing17en (manual, skipped in CI)", () => {
  it("OCRs 10 pages of the user-specified ENGLISH PDF", async () => {
    if (!fs.existsSync(PAGES_DIR)) {
      console.log(`Skipping: ${PAGES_DIR} not found.`);
      return;
    }
    const pages = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith(".png")).sort();
    if (pages.length === 0) {
      console.log(`Skipping: no PNG files in ${PAGES_DIR}`);
      return;
    }
    console.log(`Found ${pages.length} pages from ${SOURCE_PDF}\n`);

    const svc = new PaddleOcrEngine(MODEL_DIR);
    process.env.LTI_PADDLE_DIAG = "1";
    const t0 = Date.now();
    let totalChars = 0;
    let totalEnglishish = 0;

    for (let i = 0; i < pages.length; i++) {
      const f = pages[i];
      const fp = path.join(PAGES_DIR, f);
      const pt0 = Date.now();
      const text = await svc.runOcr(fp);
      const ms = Date.now() - pt0;
      totalChars += text.length;
      // Count chars that look like Latin/English (rough heuristic)
      const englishish = (text.match(/[A-Za-z0-9.,;:()\-'" ]/g) || []).length;
      totalEnglishish += englishish;
      console.log(`\n========== Page ${i+1}/${pages.length}: ${f} (${ms}ms, ${text.length} chars, ${englishish} englishish) ==========`);
      console.log(text);
      console.log("--- end ---");
    }
    const total = Date.now() - t0;
    console.log(`\n========== Summary ==========`);
    console.log(`Source: ${SOURCE_PDF}`);
    console.log(`Tier: mobile | Dpi: 200 | Pages: ${pages.length}`);
    console.log(`Total characters: ${totalChars} (of which ${totalEnglishish} ~English/Latin)`);
    console.log(`Total time: ${(total/1000).toFixed(1)}s | Avg/page: ${(total/pages.length/1000).toFixed(2)}s`);
    expect(totalChars).toBeGreaterThan(0);
  }, 600_000);
});
