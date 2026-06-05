"use strict";

// src/ocr-image-preprocess.ts
var os = require("os");
var path = require("path");
var sharp = require("sharp");
async function createOcrInputImage(filePath, jobId) {
  if (!/\.(png|jpe?g|webp|tiff?|bmp)$/i.test(filePath)) {
    return null;
  }
  const outputPath = path.join(os.tmpdir(), `lti-kreuzberg-ocr-${jobId}.png`);
  const metadata = await sharp(filePath).metadata();
  const width = Math.max(1, Math.round((metadata.width ?? 0) * 1.25));
  const height = Math.max(1, Math.round((metadata.height ?? 0) * 1.25));
  await sharp(filePath).resize({ width, height, fit: "fill", withoutEnlargement: false }).png().toFile(outputPath);
  return outputPath;
}

// src/kreuzberg-worker.ts
var readline = require("readline");
var kreuzberg = require("@kreuzberg/node");
var fs = require("fs");
function emit(json) {
  process.stdout.write(JSON.stringify(json) + "\n");
}
function normalizeCjkOcrText(text) {
  return text.replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, "$1").replace(/([\u3400-\u9fff])\s+([，。；：、！？）】》])/g, "$1$2").replace(/([（【《])\s+([\u3400-\u9fff])/g, "$1$2");
}
var rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.type === "extract") {
    await runExtract(msg).catch((e) => {
      emit({ type: "error", jobId: msg.jobId, error: String(e?.message ?? e) });
    });
  }
});
async function runExtract(req) {
  const { filePath, tessdataPath, jobId } = req;
  const prevTessdataPrefix = process.env.TESSDATA_PREFIX;
  if (tessdataPath) {
    process.env.TESSDATA_PREFIX = tessdataPath;
  }
  let ocrFilePath = filePath;
  let temporaryImagePath = null;
  try {
    emit({ type: "progress", jobId, stage: "loading", message: "\u6B63\u5728\u52A0\u8F7D Tesseract \u8BED\u8A00\u6A21\u578B..." });
    try {
      temporaryImagePath = await createOcrInputImage(filePath, jobId);
      if (temporaryImagePath) {
        ocrFilePath = temporaryImagePath;
        emit({ type: "progress", jobId, stage: "preprocessing", message: "\u6B63\u5728\u9884\u5904\u7406\u56FE\u7247\u4EE5\u63D0\u5347\u5C0F\u5B57\u8BC6\u522B\u7387..." });
      }
    } catch (e) {
      emit({ type: "progress", jobId, stage: "preprocessing", message: `OCR \u9884\u5904\u7406\u5931\u8D25\uFF0C\u4F7F\u7528\u539F\u56FE\u7EE7\u7EED\uFF1A${String(e?.message ?? e)}` });
    }
    emit({ type: "progress", jobId, stage: "extracting", message: "\u6B63\u5728\u901A\u8FC7 Kreuzberg \u63D0\u53D6\u6587\u5B57..." });
    const result = await kreuzberg.extractFile(ocrFilePath, null, {
      outputFormat: "plain",
      useCache: false,
      ocr: {
        backend: "tesseract",
        language: "chi_sim"
      },
      layout: void 0
    });
    const text = normalizeCjkOcrText(result.content);
    emit({ type: "progress", jobId, stage: "done", message: `\u63D0\u53D6\u5B8C\u6210\uFF08${text.length} \u5B57\u7B26\uFF09` });
    emit({ type: "result", jobId, success: true, text });
  } catch (e) {
    emit({ type: "error", jobId, error: String(e?.message ?? e) });
  } finally {
    if (temporaryImagePath) {
      try {
        fs.unlinkSync(temporaryImagePath);
      } catch {
      }
    }
    if (prevTessdataPrefix === void 0) {
      delete process.env.TESSDATA_PREFIX;
    } else {
      process.env.TESSDATA_PREFIX = prevTessdataPrefix;
    }
  }
}
process.on("unhandledRejection", (err) => {
  process.stderr.write(`[kreuzberg-worker] unhandledRejection: ${err}
`);
  process.exit(71);
});
process.on("uncaughtException", (err) => {
  process.stderr.write(`[kreuzberg-worker] uncaughtException: ${err}
`);
  process.exit(72);
});
emit({ type: "ready" });
