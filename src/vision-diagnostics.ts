// Vision diagnostics — single entry point to check the integrity of all
// local vision/OCR model files. Called by:
//   - the settings tab "Run model diagnostics" button
//   - runLocalVisionTask() on first invocation (lazy, non-blocking)
//
// Returns a DiagnosticReport that callers can either display in a Notice
// or persist for later inspection.

import * as path from "path";
import { PaddleOcrService } from "./paddle-ocr-service";
import { PADDLE_DEFAULT_MODEL_DIR } from "./paddle-ocr-types";
import { TesseractOcrService } from "./tesseract-ocr-service";

/** A single engine's model state. */
export type ModelState = {
  present: boolean;
  missing: string[];
  missingOptional?: string[];
  modelDir: string;
  fileCount: number;
  totalSizeBytes?: number;
};

/** Top-level report returned by runDiagnostics(). */
export type DiagnosticReport = {
  paddleOcr: ModelState;
  tesseract: ModelState;
  qwenVl: ModelState;
  visionWorkerJs: { present: boolean; path: string };
  overallOk: boolean;
  generatedAt: string;
};

export type VisionLikeSettings = {
  paddleOcrModelPath?: string;
  tesseractDataPath?: string;
  visionModelPath?: string;
};

export class VisionDiagnostics {
  private readonly fs: typeof import("fs");
  private readonly pathLib: typeof import("path");
  private readonly vaultRoot: string | null;

  constructor(
    private readonly pluginDir: string,
    private readonly settings: VisionLikeSettings,
    opts?: { vaultRoot?: string | null; fs?: typeof import("fs"); path?: typeof import("path") }
  ) {
    this.fs = opts?.fs ?? require("fs");
    this.pathLib = opts?.path ?? require("path");
    this.vaultRoot = opts?.vaultRoot ?? null;
  }

  /**
   * Check the presence of every local vision/OCR model file. Pure read-only.
   */
  public runDiagnostics(): DiagnosticReport {
    const paddleOcrDir = this.resolvePaddleOcrDir();
    const tesseractDir = this.resolveTesseractDir();
    const qwenVlDir = this.resolveQwenVlDir();
    const visionWorkerPath = this.pathLib.join(this.pluginDir, "vision-worker.js");

    // PaddleOCR — 3 required + 1 optional (cls). PP-OCRv5 mobile cls ONNX is not
    // yet published by PaddlePaddle, so cls is treated as optional and only logged
    // in the missingOptional list.
    const paddleOcrRequired = [
      this.pathLib.join(paddleOcrDir, "det", "inference.onnx"),
      this.pathLib.join(paddleOcrDir, "rec", "inference.onnx"),
      this.pathLib.join(paddleOcrDir, "dict", "ppocr_keys_v5.txt"),
    ];
    const paddleOcrOptional = [
      this.pathLib.join(paddleOcrDir, "cls", "inference.onnx"),
    ];
    const paddleMissing = paddleOcrRequired.filter((p) => !this.fs.existsSync(p));
    const paddleMissingOptional = paddleOcrOptional.filter((p) => !this.fs.existsSync(p));
    const paddleOcrAll = [...paddleOcrRequired, ...paddleOcrOptional];
    const paddleTotalSize = paddleOcrAll.reduce((s, p) => s + this.safeSize(p), 0);

    // Tesseract — chi_sim + eng language data
    const tesseractFiles = [
      this.pathLib.join(tesseractDir, "chi_sim.traineddata"),
      this.pathLib.join(tesseractDir, "eng.traineddata"),
    ];
    const tessMissing = tesseractFiles.filter((p) => !this.fs.existsSync(p));
    const tessTotalSize = tesseractFiles.reduce((s, p) => s + this.safeSize(p), 0);

    // Qwen-VL — at least the onnx/ subdir
    const qwenOnnxDir = this.pathLib.join(qwenVlDir, "onnx");
    let qwenMissing: string[] = [];
    let qwenFileCount = 0;
    if (!this.fs.existsSync(qwenOnnxDir)) {
      qwenMissing = [qwenOnnxDir];
    } else {
      try {
        const files = this.fs.readdirSync(qwenOnnxDir).filter((f) => f.endsWith(".onnx") || f.endsWith(".onnx_data"));
        qwenFileCount = files.length;
        if (files.length === 0) qwenMissing = [`${qwenOnnxDir} (empty — no .onnx files)`];
      } catch (e) {
        qwenMissing = [`${qwenOnnxDir} (unreadable: ${String(e)})`];
      }
    }

    return {
      paddleOcr: {
        present: paddleMissing.length === 0,
        missing: paddleMissing,
        missingOptional: paddleMissingOptional,
        modelDir: paddleOcrDir,
        fileCount: paddleOcrAll.length - paddleMissing.length - paddleMissingOptional.length,
        totalSizeBytes: paddleTotalSize,
      },
      tesseract: {
        present: tessMissing.length === 0,
        missing: tessMissing,
        modelDir: tesseractDir,
        fileCount: tesseractFiles.length - tessMissing.length,
        totalSizeBytes: tessTotalSize,
      },
      qwenVl: {
        present: qwenMissing.length === 0,
        missing: qwenMissing,
        modelDir: qwenVlDir,
        fileCount: qwenFileCount,
      },
      visionWorkerJs: {
        present: this.fs.existsSync(visionWorkerPath),
        path: visionWorkerPath,
      },
      overallOk: paddleMissing.length === 0 && tessMissing.length === 0 && qwenMissing.length === 0 && this.fs.existsSync(visionWorkerPath),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Format a DiagnosticReport as a multi-line Markdown string suitable for an
   * Obsidian Notice or settings panel summary.
   */
  public formatReport(r: DiagnosticReport): string {
    const lines: string[] = [];
    lines.push(r.overallOk ? "✅ 视觉模型完整性检查通过" : "❌ 视觉模型完整性检查未通过");
    lines.push("");
    lines.push(this.formatEngine("PaddleOCR (主 OCR 引擎)", r.paddleOcr, "PP-OCRv5 mobile ONNX (~22MB required, +1MB optional cls)"));
    lines.push(this.formatEngine("Tesseract (OCR 兜底)", r.tesseract, "chi_sim + eng traineddata (~6MB)"));
    lines.push(this.formatEngine("Qwen2-VL (图像语义)", r.qwenVl, "ONNX 量化包 (~1-4GB)"));
    lines.push(this.formatVisionWorker(r.visionWorkerJs));

    if (r.paddleOcr.missingOptional && r.paddleOcr.missingOptional.length > 0) {
      lines.push("");
      lines.push("ℹ️ PaddleOCR 方向分类 (cls) 模型缺失 - PaddlePaddle 暂未发布 PP-OCRv5 mobile 的 cls ONNX 导出，OCR 仍可正常工作（跳过 0°/180° 旋转判定）。");
    }

    if (!r.overallOk) {
      lines.push("");
      lines.push("修复指引:");
      lines.push("• 在设置中调整对应模型路径到正确位置");
      lines.push("• 或使用「打开模型目录」按钮在文件管理器中查看实际文件");
      lines.push("• PaddleOCR/Tesseract 可从 HF 镜像 (https://hf-mirror.com) 下载");
    }
    return lines.join("\n");
  }

  private formatEngine(name: string, state: ModelState, hint: string): string {
    const status = state.present ? "✅" : "❌";
    const fileInfo = state.totalSizeBytes !== undefined
      ? `${state.fileCount} 个文件, ${this.formatBytes(state.totalSizeBytes)}`
      : `${state.fileCount} 个文件`;
    const lines = [
      `${status} ${name}`,
      `   目录: ${state.modelDir}`,
      `   状态: ${fileInfo} (${hint})`,
    ];
    if (state.missing.length > 0) {
      lines.push(`   缺失: ${state.missing.length} 项`);
      for (const m of state.missing) {
        lines.push(`     - ${m}`);
      }
    }
    return lines.join("\n");
  }

  private formatVisionWorker(state: { present: boolean; path: string }): string {
    return `${state.present ? "✅" : "❌"} Vision Worker (vision-worker.js)\n   路径: ${state.path}`;
  }

  // ---------------------------------------------------------------------------
  // Path resolution (mirrors the logic in vision-service.ts)
  // ---------------------------------------------------------------------------

  private resolveRelative(dir: string): string {
    if (this.pathLib.isAbsolute(dir)) return dir;
    // Prefer the vault root if known (matches the semantics in vision-service.ts).
    // Fallback: walk up 3 levels from the plugin dir, which is the standard Obsidian layout.
    if (this.vaultRoot) return this.pathLib.resolve(this.vaultRoot, dir);
    return this.pathLib.resolve(this.pluginDir, "..", "..", "..", dir);
  }

  private resolvePaddleOcrDir(): string {
    let dir = this.settings.paddleOcrModelPath;
    if (!dir) return this.pathLib.join(this.pluginDir, PADDLE_DEFAULT_MODEL_DIR);
    return this.resolveRelative(dir);
  }

  private resolveTesseractDir(): string {
    let dir = this.settings.tesseractDataPath;
    if (!dir) return this.pathLib.join(this.pluginDir, "models", "tessdata");
    return this.resolveRelative(dir);
  }

  private resolveQwenVlDir(): string {
    let dir = this.settings.visionModelPath;
    if (!dir) return this.pathLib.join(this.pluginDir, "models", "Qwen2-VL-2B-Instruct");
    return this.resolveRelative(dir);
  }

  private safeSize(p: string): number {
    try {
      return this.fs.statSync(p).size;
    } catch {
      return 0;
    }
  }

  private formatBytes(n: number): string {
    if (n === 0) return "0 B";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
}
