/**
 * One-off smoke test for the textbook scenario.
 *
 * Runs PaddleOcrService against 10 pages of a Chinese economics textbook
 * and reports recognized text + per-page timing. NOT a real eval —
 * just a manual sanity check that the new postprocessor works on
 * realistic book-page images (not MagicGrid SVGs).
 *
 * Skipped by default. Run explicitly with:
 *   npx vitest run tests/book-smoke.test.ts
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PaddleOcrService } from "../src/paddle-ocr-service";

const MODEL_DIR = "/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/models/ocr/pp-ocrv5/mobile";
const PAGES_DIR = "/tmp/ocr-test-book";

describe("Book smoke (manual, skipped in CI)", () => {
  it("OCRs 10 pages of a Chinese economics textbook", async () => {
    if (!fs.existsSync(PAGES_DIR)) {
      console.log(`Skipping: ${PAGES_DIR} not found. Generate pages with:`);
      console.log(`  pdftoppm -f 1 -l 10 -r 200 -png "<pdf>" ${PAGES_DIR}/page`);
      return;
    }

    const pages = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith(".png")).sort();
    if (pages.length === 0) {
      console.log(`Skipping: no PNG files in ${PAGES_DIR}`);
      return;
    }
    console.log(`Found ${pages.length} pages\n`);

    const svc = new PaddleOcrService(MODEL_DIR);
    // Enable diagnostic logging so we can see dbPostprocess filter stats
    // and rec model argmax sequences (gated by this env var, off in CI)
    process.env.LTI_PADDLE_DIAG = "1";
    const totalT0 = Date.now();
    let totalChars = 0;

    for (let i = 0; i < pages.length; i++) {
      const f = pages[i];
      const fp = path.join(PAGES_DIR, f);
      const t0 = Date.now();
      const text = await svc.runOcr(fp, (m) => {
        if (m.includes("/")) process.stdout.write(`\r  [${f}] ${m}                    `);
      });
      const elapsed = Date.now() - t0;
      totalChars += text.length;
      process.stdout.write("\n");
      console.log(`\n========== Page ${i + 1}/${pages.length}: ${f} (${elapsed}ms) ==========`);
      console.log(text);
      console.log("--- end ---\n");
    }

    const totalElapsed = Date.now() - totalT0;
    console.log(`\n========== Summary ==========`);
    console.log(`Total pages: ${pages.length}`);
    console.log(`Total characters: ${totalChars}`);
    console.log(`Total time: ${(totalElapsed / 1000).toFixed(1)}s`);
    console.log(`Avg per page: ${(totalElapsed / pages.length / 1000).toFixed(1)}s`);

    // Smoke-level invariants
    expect(totalChars).toBeGreaterThan(0);
  }, 600_000);
});
