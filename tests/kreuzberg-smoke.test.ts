/**
 * Smoke test: kreuzberg on a single page of the English 17th-edition PDF
 * AND a single page of the Chinese 13th-edition PDF. The smoke test sets
 * TESSDATA_PREFIX to the project's pre-existing tessdata dir (populated by
 * tesseract.js on first use) so it does not depend on a network download.
 *
 * Run: TESSDATA_PREFIX=/path/to/tessdata npx vitest run tests/kreuzberg-smoke.test.ts
 *      or just `npx vitest run` — the test sets a default path below.
 */
import { describe, it } from "vitest";
import { KreuzbergOcrService } from "../src/kreuzberg-ocr-service";

// Pre-existing tessdata downloaded by tesseract.js at first use. If the
// kreuzberg Rust binary needs a different / newer version of eng or
// chi_sim, replace the files in this directory with the official
// releases from https://github.com/tesseract-ocr/tessdata/raw/main/
// (eng.traineddata ~24 MB, chi_sim.traineddata ~44 MB).
const TESSDATA_DIR = "/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/models/tessdata";

// Set a sensible default if the caller didn't override TESSDATA_PREFIX.
// Using a fixed string check here so we don't clobber the env every test
// run (some users run with their own directory).
if (!process.env.TESSDATA_PREFIX || process.env.TESSDATA_PREFIX === "") {
  process.env.TESSDATA_PREFIX = TESSDATA_DIR;
}

describe("kreuzberg smoke (manual, skipped in CI)", () => {
  it("OCRs a single EN page", async () => {
    const PAGE = "/tmp/ocr-test-gongjing17en/page-008.png";
    const svc = new KreuzbergOcrService(TESSDATA_DIR);
    const t0 = Date.now();
    const text = await svc.runOcr(PAGE);
    const ms = Date.now() - t0;
    console.log(`\n--- kreuzberg on EN page 8 (${ms}ms, ${text.length} chars) ---`);
    console.log(text.slice(0, 1500));
    console.log("--- end ---");
  }, 120_000);

  it("OCRs a single ZH page", async () => {
    const PAGE = "/tmp/ocr-test-gongjing13/page-010.png";
    const svc = new KreuzbergOcrService(TESSDATA_DIR);
    const t0 = Date.now();
    const text = await svc.runOcr(PAGE);
    const ms = Date.now() - t0;
    console.log(`\n--- kreuzberg on ZH page 10 (${ms}ms, ${text.length} chars) ---`);
    console.log(text.slice(0, 1500));
    console.log("--- end ---");
  }, 120_000);
});
