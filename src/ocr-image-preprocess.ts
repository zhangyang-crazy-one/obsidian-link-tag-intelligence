// Lightweight image preprocessing for CPU OCR. Upscaling helps Tesseract on
// dense textbook scans and table pages without adding a heavy OCR model.
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const os = require("os");
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const sharp = require("sharp");

export async function createOcrInputImage(filePath: string, jobId: string): Promise<string | null> {
  if (!/\.(png|jpe?g|webp|tiff?|bmp)$/i.test(filePath)) {
    return null;
  }
  const outputPath = path.join(os.tmpdir(), `lti-kreuzberg-ocr-${jobId}.png`);
  const metadata = await sharp(filePath).metadata();
  const width = Math.max(1, Math.round((metadata.width ?? 0) * 1.25));
  const height = Math.max(1, Math.round((metadata.height ?? 0) * 1.25));
  await sharp(filePath)
    .resize({ width, height, fit: "fill", withoutEnlargement: false })
    .png()
    .toFile(outputPath);
  return outputPath;
}
