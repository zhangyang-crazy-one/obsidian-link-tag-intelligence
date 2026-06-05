import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sidebar OCR action label", () => {
  it("does not expose removed visual-understanding copy in the toolbar", () => {
    const i18n = readFileSync("src/i18n.ts", "utf8");
    expect(i18n).toContain('ocr: "本地图片离线 OCR 提取"');
    expect(i18n).toContain('ocr: "Local image OCR"');
    expect(i18n).not.toContain("本地多模态图片打标描述");
    expect(i18n).not.toContain("视觉理解");
  });
});
