// Local OCR routing service.
// Keeps OCR local and lightweight: Kreuzberg/Tesseract first, PaddleOCR as
// challenger/fallback. Visual-understanding models are intentionally not part
// of this service.

import { App } from "obsidian";
import * as path from "path";
import { KreuzbergOcrService } from "./kreuzberg-ocr-service";
import { PaddleOcrService } from "./paddle-ocr-service";
import { DEFAULT_PADDLE_TIER, getPaddleTierModelDir, type PaddleOcrModelTier } from "./paddle-ocr-types";

const LATIN_RATIO_TESSERACT_TRIGGER = 0.6;
const MIN_CHARS_FOR_RATIO_CHECK = 30;
const MIN_CHARS_FOR_SHORT_RESULT_CHALLENGE = 400;

export function scoreOcrTextQuality(text: string): { score: number; chars: number; cjk: number; latin: number; replacementNoise: number } {
  let cjk = 0;
  let latin = 0;
  let replacementNoise = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if ((code >= 0x3400 && code <= 0x9FFF) || (code >= 0xFF00 && code <= 0xFFEF)) cjk++;
    else if (
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5A) ||
      (code >= 0x61 && code <= 0x7A)
    ) latin++;
    if (ch === "�" || ch === "□") replacementNoise++;
  }
  return {
    score: cjk * 2 + latin * 0.5 + text.trim().length * 0.1 - replacementNoise * 20,
    chars: text.trim().length,
    cjk,
    latin,
    replacementNoise,
  };
}

export function shouldChallengePaddleOcrResult(text: string): boolean {
  const trimmedLength = text.trim().length;
  if (trimmedLength === 0) return true;
  if (trimmedLength < MIN_CHARS_FOR_SHORT_RESULT_CHALLENGE) return true;
  if (text.length < MIN_CHARS_FOR_RATIO_CHECK) return false;

  let latin = 0;
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isLatin = (
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5A) ||
      (code >= 0x61 && code <= 0x7A) ||
      (code >= 0x20 && code <= 0x2F) ||
      (code >= 0x3A && code <= 0x40) ||
      (code >= 0x5B && code <= 0x60) ||
      (code >= 0x7B && code <= 0x7E)
    );
    const isCjk = (code >= 0x3000 && code <= 0x9FFF) || (code >= 0xFF00 && code <= 0xFFEF);
    if (isLatin) latin++;
    if (isLatin || isCjk) total++;
  }
  if (total === 0) return false;
  return latin / total >= LATIN_RATIO_TESSERACT_TRIGGER;
}

export class LocalOfflineOcrService {
  private app: App;
  private settings: any;
  private paddleOcrService: PaddleOcrService;
  private kreuzbergOcrService: KreuzbergOcrService;
  private lastPaddleError: string | null = null;

  constructor(app: App, settings?: any) {
    this.app = app;
    this.settings = settings ?? {};

    const pluginDir = this.getPluginDir();
    const paddleTier: PaddleOcrModelTier = this.settings?.paddleOcrTier ?? DEFAULT_PADDLE_TIER;

    let paddleOcrDir = this.settings?.paddleOcrModelPath;
    if (!paddleOcrDir) {
      paddleOcrDir = path.join(pluginDir, getPaddleTierModelDir(paddleTier));
    } else if (!path.isAbsolute(paddleOcrDir)) {
      const adapter = this.app.vault.adapter as any;
      const vaultPath = adapter.getBasePath ? adapter.getBasePath() : "";
      paddleOcrDir = path.resolve(vaultPath, paddleOcrDir);
    }

    const paddleOcrWorkerPath = path.join(pluginDir, "paddle-ocr-worker.cjs");
    this.paddleOcrService = new PaddleOcrService(paddleOcrDir, paddleOcrWorkerPath, {
      tier: paddleTier,
      detConfig: {
        dbThresh: this.settings.paddleDetDbThresh,
        dbBoxThresh: this.settings.paddleDetBoxThresh,
        unclipRatio: this.settings.paddleDetUnclipRatio,
        minSize: this.settings.paddleDetMinSize,
        nmsIouThresh: this.settings.paddleDetNmsIouThresh,
        maxCandidates: this.settings.paddleDetMaxCandidates,
        limitSideLen: this.settings.paddleDetLimitSideLen,
        scoreMode: this.settings.paddleDetScoreMode,
        useDilation: this.settings.paddleDetUseDilation,
      },
      cpuThreads: this.settings.paddleOcrCpuThreads,
    });

    let kreuzbergTessdataDir = this.settings?.tesseractDataPath;
    if (!kreuzbergTessdataDir) {
      kreuzbergTessdataDir = path.join(pluginDir, "models", "tessdata");
    } else if (!path.isAbsolute(kreuzbergTessdataDir)) {
      const adapter = this.app.vault.adapter as any;
      const vaultPath = adapter.getBasePath ? adapter.getBasePath() : "";
      kreuzbergTessdataDir = path.resolve(vaultPath, kreuzbergTessdataDir);
    }

    const kreuzbergWorkerPath = path.join(pluginDir, "kreuzberg-worker.cjs");
    this.kreuzbergOcrService = new KreuzbergOcrService(
      kreuzbergTessdataDir,
      kreuzbergWorkerPath,
    );
  }

  private getPluginDir(): string {
    const adapter = this.app.vault.adapter as any;
    const vaultPath = adapter.getBasePath ? adapter.getBasePath() : "";
    const manifestDir = this.app.vault.configDir + "/plugins/link-tag-intelligence";
    return path.resolve(vaultPath, manifestDir);
  }

  public async processTask(
    imagePath: string,
    task: "<OCR>",
    isSmartRoutingEnabled = true,
    onStatus?: (msg: string) => void
  ): Promise<string> {
    if (task !== "<OCR>") {
      throw new Error("LocalOfflineOcrService only supports OCR tasks.");
    }
    if (isSmartRoutingEnabled) {
      return this.runOcrWithFallback(imagePath, onStatus);
    }
    if (onStatus) onStatus("正在使用 PaddleOCR 提取文字...");
    return this.paddleOcrService.runOcr(imagePath, onStatus);
  }

  private async runOcrWithFallback(imagePath: string, onStatus?: (msg: string) => void): Promise<string> {
    let kreuzbergResult = "";
    let kreuzbergOk = false;
    try {
      if (onStatus) onStatus("正在使用 Kreuzberg/Tesseract 中文 OCR 提取文字...");
      kreuzbergResult = await this.kreuzbergOcrService.runOcr(imagePath, onStatus);
      kreuzbergOk = true;
      if (!shouldChallengePaddleOcrResult(kreuzbergResult)) {
        return kreuzbergResult;
      }
      if (onStatus) onStatus("Kreuzberg 结果偏短，调用 PaddleOCR 进行补充对比...");
    } catch (kreuzbergErr: any) {
      console.warn("[lti-ocr-service] Kreuzberg OCR 失败，回退到 PaddleOCR:", kreuzbergErr);
      if (onStatus) onStatus("Kreuzberg OCR 失败，自动回退到 PaddleOCR...");
    }

    let paddleResult = "";
    let paddleOk = false;
    try {
      if (onStatus) onStatus("正在使用 PaddleOCR 提取文字...");
      paddleResult = await this.paddleOcrService.runOcr(imagePath, onStatus);
      paddleOk = true;
    } catch (paddleErr: any) {
      this.lastPaddleError = paddleErr?.message ?? String(paddleErr);
      console.warn("[lti-ocr-service] PaddleOCR 也失败:", paddleErr);
      if (!kreuzbergOk) {
        throw new Error(
          `OCR 全部失败。Kreuzberg: (failed) | PaddleOCR: ${this.lastPaddleError ?? "(unknown)"}`
        );
      }
      return kreuzbergResult;
    }

    if (kreuzbergOk && paddleOk) {
      const paddleScore = scoreOcrTextQuality(paddleResult);
      const kreuzbergScore = scoreOcrTextQuality(kreuzbergResult);
      return kreuzbergScore.score > paddleScore.score ? kreuzbergResult : paddleResult;
    }
    return paddleOk ? paddleResult : kreuzbergResult;
  }

  public destroy(): void {
    this.paddleOcrService.destroy();
    this.kreuzbergOcrService.destroy();
  }
}
