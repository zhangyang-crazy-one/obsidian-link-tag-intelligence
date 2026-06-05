import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeLoadedSettings } from "../src/settings";

describe("OCR defaults", () => {
  it("keeps local OCR enabled and smart-routed by default", () => {
    expect(DEFAULT_SETTINGS.ocrEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.ocrSmartRouting).toBe(true);
  });

  it("migrates legacy vision OCR routing settings", () => {
    expect(normalizeLoadedSettings({ visionEnabled: false, visionSmartRouting: false }).ocrEnabled).toBe(false);
    expect(normalizeLoadedSettings({ visionEnabled: false, visionSmartRouting: false }).ocrSmartRouting).toBe(false);
  });

  it("uses dense-textbook scan defaults for PaddleOCR PDF extraction", () => {
    expect(DEFAULT_SETTINGS.paddleOcrTier).toBe("server");
    expect(DEFAULT_SETTINGS.paddleOcrPdfDpi).toBe(240);
    expect(DEFAULT_SETTINGS.paddleDetDbThresh).toBe(0.2);
    expect(DEFAULT_SETTINGS.paddleDetBoxThresh).toBe(0.3);
    expect(DEFAULT_SETTINGS.paddleDetUnclipRatio).toBe(2.0);
    expect(DEFAULT_SETTINGS.paddleDetMinSize).toBe(2);
    expect(DEFAULT_SETTINGS.paddleDetNmsIouThresh).toBe(0.2);
    expect(DEFAULT_SETTINGS.paddleDetMaxCandidates).toBe(4000);
    expect(DEFAULT_SETTINGS.paddleDetLimitSideLen).toBe(2048);
    expect(DEFAULT_SETTINGS.paddleDetUseDilation).toBe(true);
  });
});
