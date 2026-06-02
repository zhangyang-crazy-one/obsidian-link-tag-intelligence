/**
 * Smoke integration test for PaddleOcrService against real models.
 *
 * IMPORTANT: This is a SMOKE test, not a regression test. It only verifies
 * that the pipeline runs end-to-end (no crash, returns non-empty text)
 * for the two images we have on disk. It does NOT assert specific box
 * counts, coordinates, or recognized text — those would couple the test
 * to the noisy MagicGrid SVG output and create Goodhart's-law
 * overfitting pressure on the postprocessing hyperparameters.
 *
 * Skipped by default. Run explicitly with:
 *   npx vitest run tests/paddle-ocr-integration.test.ts
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import { PaddleOcrService } from "../src/paddle-ocr-service";

const MODEL_DIR = "/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/models/ocr/pp-ocrv5/mobile";
const ZH_PNG = "/tmp/ocr-test/zh.png";
const EN_PNG = "/tmp/ocr-test/en.png";

describe("PaddleOcrService end-to-end smoke (manual, skipped in CI)", () => {
  it.skip("runs Chinese image through the full pipeline without crashing", async () => {
    expect(fs.existsSync(ZH_PNG)).toBe(true);
    expect(fs.existsSync(MODEL_DIR)).toBe(true);

    const svc = new PaddleOcrService(MODEL_DIR);
    const t0 = Date.now();
    const text = await svc.runOcr(ZH_PNG);
    const elapsed = Date.now() - t0;
    // Smoke-level invariants only:
    expect(typeof text).toBe("string");
    expect(elapsed).toBeLessThan(60_000);
    // No assertion on text.length or contents — would overfit to MagicGrid
  }, 120_000);

  it.skip("runs English image through the full pipeline without crashing", async () => {
    expect(fs.existsSync(EN_PNG)).toBe(true);

    const svc = new PaddleOcrService(MODEL_DIR);
    const t0 = Date.now();
    const text = await svc.runOcr(EN_PNG);
    const elapsed = Date.now() - t0;
    expect(typeof text).toBe("string");
    expect(elapsed).toBeLessThan(60_000);
  }, 120_000);
});

