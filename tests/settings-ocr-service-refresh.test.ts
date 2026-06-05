import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OCR settings service refresh", () => {
  it("recreates the cached image OCR service after model-related settings change", () => {
    const mainSource = readFileSync("src/main.ts", "utf8");
    const settingsSource = readFileSync("src/settings.ts", "utf8");

    expect(mainSource).toContain("recreateOcrService(): void");
    expect(mainSource).toContain("this.ocrService.destroy();");
    expect(mainSource).toContain("this.ocrService = new LocalOfflineOcrService(this.app, this.settings);");

    expect(settingsSource).toContain("private async saveSettingsAndRecreateOcrService(): Promise<void>");
    expect(settingsSource).toContain("this.plugin.recreateOcrService();");
    expect(settingsSource).toContain("this.plugin.settings.paddleOcrTier = value as PaddleOcrModelTier;");
    expect(settingsSource).toContain("this.plugin.settings.paddleOcrModelPath = paddleInput.value.trim();");
    expect(settingsSource).toContain("this.plugin.settings.tesseractDataPath = tessInput.value.trim();");
    expect(settingsSource).toContain('if (key === "paddleOcrPdfConcurrency" || key === "paddleOcrPdfDpi")');
    expect(settingsSource).toContain("void this.saveSettingsAndRecreateOcrService();");
    expect(settingsSource).toContain("await this.saveSettingsAndRecreateOcrService();");
  });
});
