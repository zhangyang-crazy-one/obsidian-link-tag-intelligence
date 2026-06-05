import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Kreuzberg worker OCR preprocessing", () => {
  it("skips non-image files", async () => {
    const { createOcrInputImage } = await import("../src/ocr-image-preprocess");
    await expect(createOcrInputImage("/tmp/sample.pdf", "skip")).resolves.toBeNull();
  });

  it("upscales image inputs by 1.25x for small textbook glyphs", async () => {
    const sharp = await import("sharp");
    const input = join(tmpdir(), "lti-kreuzberg-preprocess-input.png");
    await sharp.default({
      create: {
        width: 100,
        height: 80,
        channels: 3,
        background: "white",
      },
    }).png().toFile(input);

    const { createOcrInputImage } = await import("../src/ocr-image-preprocess");
    const output = await createOcrInputImage(input, "unit-test");
    expect(output).toBeTruthy();
    expect(existsSync(output!)).toBe(true);
    const metadata = await sharp.default(output!).metadata();
    expect(metadata.width).toBe(125);
    expect(metadata.height).toBe(100);

    rmSync(input, { force: true });
    rmSync(output!, { force: true });
  });
});
