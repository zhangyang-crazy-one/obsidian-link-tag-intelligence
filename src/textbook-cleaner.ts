// Textbook OCR cleanup — splits a 700-page book into per-chapter AI
// calls and saves each cleaned chapter as a separate Markdown file.
//
// The OCR engine (PaddleOCR mobile + Kreuzberg) produces noisy text:
// character errors, line break artifacts, layout collapse. Manually
// fixing 700 pages is infeasible. AI cleanup is the right tool, but
// a 700-page single call exceeds the practical output limit of any
// current model. The textbook-specific pattern: process one
// chapter per call, write the cleaned output to its own file.
//
// This module is the per-chapter runner. It reads a JSON manifest
// the user authors (Books/{name}/manifest.json) and:
//
//   1. For each chapter entry, reads the source note (which contains
//      the OCR'd text for that chapter) and constructs a textbook-
//      tuned prompt with chapter metadata.
//   2. Calls AIService.runRefinement to get the cleaned Markdown.
//   3. Saves the result to {output_dir}/ch{NN}-{title}.md.
//   4. Repeats for every chapter, reporting progress via Notice.
//
// The AI prompt is textbook-specific: handles formulas (LaTeX),
// tables (Markdown pipe syntax with HTML fallback for complex
// shapes), code blocks (```lang), exercises (numbered lists with
// solutions separated), and figure placeholders ([图 X.Y 描述：…]).
// OCR-specific hints are injected based on the manifest's
// `ocr_source` field so the AI knows which error pattern to favor
// when uncertain (PaddleOCR is good at Chinese but mistranscribes
// formulas; Kreuzberg is good at English/formulas but Chinese needs
// chi_sim). For OCR source "hybrid" or unknown, the prompt asks
// the AI to expect mixed quality.
//
// Output file naming: chapters with `number: 1, title: "绪论"` get
// saved as `ch01-绪论.md`. The number is zero-padded to 2 digits,
// which sorts cleanly in file lists up to 99 chapters (a 700-page
// book typically has 10-20 chapters, well within 2-digit padding).
// If the manifest sets `output_dir: "Books/foo/chapters"`, the
// full path is `Books/foo/chapters/ch01-绪论.md` resolved against
// the vault root. The directory is auto-created if missing.
//
// Cross-chapter context: when a chapter has `prev_chapter_id` set
// in the manifest (by reference, not page number), the cleaner
// reads the previous chapter's last 2 paragraphs from the already-
// saved output and includes them in the prompt under
// `{{prev_tail_2_paragraphs}}`. Same for `next_chapter_id` → first
// 2 paragraphs. This lets the AI keep chapter titles / terminology
// consistent across the book. The user wires prev/next IDs in the
// manifest manually (chapter.order[i].next = chapter.order[i+1].id
// etc.) since computing by page range alone is brittle for
// textbooks that have prefaces/appendices/indexes in between.

import { App, TFile, Notice } from "obsidian";
import { AIService } from "./ai-service";
import type { LinkTagIntelligenceSettings } from "./settings";

export type TextbookChapter = {
  /** Unique slug, e.g. "ch01-intro". Used as the file name suffix
   *  and as the prev/next cross-reference. */
  id: string;
  /** Chapter number, used for the zero-padded prefix in the
   *  output file name. */
  number: number;
  /** Display title (Chinese, English, or both — whatever the book uses). */
  title: string;
  /** [startPage, endPage] in the original physical book, for
   *  reference only (not used to slice the source note, which the
   *  user already partitioned per chapter). */
  page_range?: [number, number];
  /** Vault-relative path to the source note (OCR text for this
   *  chapter). */
  source_note: string;
  /** Optional cross-chapter references. The cleaner reads
   *  `prev_chapter_id`'s already-saved output to extract the tail
   *  for context, and reads `next_chapter_id`'s source note to
   *  extract the head. */
  prev_chapter_id?: string;
  next_chapter_id?: string;
};

export type TextbookManifest = {
  book_title: string;
  ocr_source: "paddle-mobile" | "kreuzberg" | "hybrid";
  /** Vault-relative path to the directory where chapter outputs
   *  will be saved. Auto-created if missing. */
  output_dir: string;
  /** Optional override for the cleanup prompt. If unset, the
   *  built-in textbook prompt is used. */
  prompt_override?: string;
  chapters: TextbookChapter[];
};

const TEXTBOOK_PROMPT = `你是中文/英文教材排版修复专家。当前输入是 1 个章节（20-50 页）的 OCR 识别文本，输出应该是该章节清理后的完整 Markdown。

── 教材特有元素（重点处理）──
1. 公式：行内公式用 $...$，块级用 $$...$$。OCR 常把 = 看成 -，把希腊字母（α β γ δ）看错。多行公式保留换行。
2. 表格：用 Markdown 表格语法 | col1 | col2 | + |---|---||。OCR 经常把表格列错位，按语义还原。复杂表格用 HTML <table> 也行，比错位强。
3. 代码：用代码块 \`\`\`语言名 ... \`\`\` 包裹。OCR 经常把缩进和换行弄乱，按代码语义重排。
4. 例题/习题：例 1.1、习题 1-1 这种编号要保留。题目和解答之间用空行分隔。选择题用 - [ ] 或列表。
5. 图表：OCR 提取不到图片，只保留图表标题和说明文字。占位：[图 X.Y 描述：xxx]，方便后续手动插入原图。

── 通用清理 ──
- 字符级修正：形近字（己/已/巳、未/末、士/土、辨/辩/瓣）、数字 0/O 1/l/I、中文标点统一全角
- 排版：合并错误断行、章节标题用 #/##/###、删除页眉页脚水印
- 模糊处用 [?] 不臆测
- 不重写不润色不删减

── 上下文 ──
教材名：{{book_title}}
章节编号：第 {{chapter_number}} 章
章节标题：{{chapter_title}}
本章节页码范围：{{page_range}}
上一章末尾两段（仅供衔接参考，不出现在输出中）：{{prev_tail_2_paragraphs}}
下一章开头两段（仅供衔接参考）：{{next_head_2_paragraphs}}

── 当前章节 OCR 文本 ──
{{chapter_ocr_text}}

── 输出格式 ──
纯 Markdown，不要用 \`\`\`markdown 包裹。
不要输出"以下是..."等前缀或解释。
章节首页用 # 第 X 章 标题 开始。
末尾如有未完公式或图，标注 [待人工补充：...]。
`;

/**
 * Read and parse a textbook manifest JSON file from the vault.
 * Throws if the file is missing, unreadable, or has the wrong
 * shape (must be a JSON object with a `chapters` array). The
 * 700-page-book use case means manifest edits are common, so we
 * surface the error path explicitly rather than failing later at
 * the first chapter.
 */
export async function parseManifest(
  app: App,
  manifestPath: string,
): Promise<TextbookManifest> {
  const file = app.vault.getAbstractFileByPath(manifestPath);
  // Duck-typing instead of `instanceof TFile` so this is testable
  // without booting Obsidian's full class hierarchy. We just need
  // a `path` string and a `read()` method that returns the bytes.
  if (!file || typeof (file as any).path !== "string" || typeof (file as any).read !== "function") {
    throw new Error(`manifest 路径无效或文件不存在: ${manifestPath}`);
  }
  let raw: string;
  try {
    raw = await (app.vault.read as any)(file);
  } catch (e: any) {
    throw new Error(`读取 manifest 失败: ${e.message ?? e}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    throw new Error(`manifest JSON 解析失败 (检查第 ${e.message.match(/\d+/) ?? "?"} 字符): ${e.message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("manifest 必须是 JSON object");
  }
  const m = parsed as Partial<TextbookManifest>;
  if (typeof m.book_title !== "string" || !m.book_title.trim()) {
    throw new Error("manifest 缺少 book_title");
  }
  if (typeof m.output_dir !== "string" || !m.output_dir.trim()) {
    throw new Error("manifest 缺少 output_dir");
  }
  if (!Array.isArray(m.chapters) || m.chapters.length === 0) {
    throw new Error("manifest.chapters 必须是至少含 1 个章节的数组");
  }
  for (let i = 0; i < m.chapters.length; i++) {
    const c = m.chapters[i];
    if (typeof c.id !== "string" || !c.id.trim()) {
      throw new Error(`chapters[${i}].id 缺失或为空`);
    }
    if (typeof c.number !== "number") {
      throw new Error(`chapters[${i}].number 必须是数字`);
    }
    if (typeof c.title !== "string" || !c.title.trim()) {
      throw new Error(`chapters[${i}].title 缺失或为空`);
    }
    if (typeof c.source_note !== "string" || !c.source_note.trim()) {
      throw new Error(`chapters[${i}].source_note 缺失或为空`);
    }
  }
  return m as TextbookManifest;
}

/**
 * Extract the last 2 non-empty paragraphs from a string. Used to
 * build the prev-tail context for the next chapter's prompt. The
 * "paragraph" boundary is a double newline or single newline
 * followed by content that looks like prose (i.e. doesn't start
 * with `#`, `-`, or `|` — those are headings/lists/tables and
 * don't carry prose context).
 */
function extractTailParagraphs(text: string, count = 2): string {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^[#\-|>\d]/.test(p));
  return paragraphs.slice(-count).join("\n\n");
}

/**
 * Extract the first 2 non-empty paragraphs. Same paragraph
 * heuristic as extractTailParagraphs but takes from the front.
 */
function extractHeadParagraphs(text: string, count = 2): string {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^[#\-|>\d]/.test(p));
  return paragraphs.slice(0, count).join("\n\n");
}

/**
 * Sanitize a chapter title for use as part of a filename. The
 * original title may contain characters that are illegal in cross-
 * platform filenames (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`,
 * `|`, plus control characters). The Obsidian vault is on the
 * user's local FS, so we strip those. Whitespace collapses to
 * single space; leading/trailing dots and spaces are trimmed.
 */
export function sanitizeForFilename(title: string): string {
  // Collapse whitespace FIRST, then strip illegal FS chars. Order
  // matters: if we strip first, the regex would also match the
  // single inter-word space we want to keep, replacing it with "_".
  return title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, "_")
    .replace(/^\.+|\.+$/g, "");
}

/**
 * Resolve a vault-relative path to an absolute path on the local
 * filesystem. The vault may be in a sandboxed location (e.g. on
 * mobile) but the textbook cleaner always runs on desktop (where
 * it has child-process access for the OCR workers), so we just
 * join with the adapter's base path.
 */
function resolveVaultPath(
  app: App,
  vaultRelative: string,
): string {
  const adapter = app.vault.adapter as { getBasePath?: () => string };
  const base = adapter.getBasePath?.() ?? "";
  return base ? `${base}/${vaultRelative}` : vaultRelative;
}

/**
 * Run the textbook cleaner. Loops the manifest's chapters, calls
 * the AI per chapter, saves each output to disk. Reports progress
 * via Notice. The cleaner is sequential, not parallel — MiniMax-
 * M3 rate-limits per-account, and 700-page-book use cases care
 * more about reliability than throughput.
 *
 * If a chapter fails (AI error, file-write error, etc.), the error
 * is logged to the console and the cleaner proceeds to the next
 * chapter. Failures are accumulated and thrown at the end so the
 * caller can show a summary.
 *
 * Returns a result object the caller can use to show a final
 * Notice / status. The `progress` callback (if provided) is called
 * after each chapter with (chapterIndex, chapterCount, chapter,
 * result) — used by the command palette UI for live updates.
 */
export async function cleanBook(
  app: App,
  settings: LinkTagIntelligenceSettings,
  manifest: TextbookManifest,
  options?: {
    onProgress?: (info: {
      index: number;
      total: number;
      chapter: TextbookChapter;
      result: { ok: true; outputPath: string; chars: number } | { ok: false; error: string };
    }) => void;
  },
): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  failures: Array<{ chapter: TextbookChapter; error: string }>;
}> {
  const ai = new AIService(app, settings);
  // Build an index by chapter ID so prev/next cross-references are
  // a simple lookup. The user wires these in the manifest, but the
  // cleaner is robust to missing cross-refs — it just leaves the
  // tail/head placeholders empty.
  const byId = new Map<string, TextbookChapter>();
  for (const c of manifest.chapters) byId.set(c.id, c);

  // Map output path by chapter id so prev/next lookups can read
  // already-saved outputs. Built up as we go.
  const outputById = new Map<string, string>();
  // Map tail context (last 2 paragraphs of cleaned output) so the
  // next chapter can borrow it. Kept in memory only — no need to
  // re-read the file from disk.
  const tailById = new Map<string, string>();

  const failures: Array<{ chapter: TextbookChapter; error: string }> = [];
  let succeeded = 0;

  // Ensure the output directory exists. The user puts this in the
  // manifest, but a fresh vault won't have it. Create it eagerly so
  // the per-chapter writes don't fail.
  const outputDir = manifest.output_dir.replace(/\/+$/, "");
  try {
    await app.vault.createFolder(outputDir).catch((e) => {
      // createFolder throws on existing — that's the success case.
      if (!String(e?.message ?? "").includes("already exists")) throw e;
    });
  } catch (e: any) {
    throw new Error(`创建输出目录失败 ${outputDir}: ${e.message ?? e}`);
  }

  for (let i = 0; i < manifest.chapters.length; i++) {
    const chapter = manifest.chapters[i];
    new Notice(`📖 清理 ${manifest.book_title} · 第 ${chapter.number} 章 ${chapter.title} (${i + 1}/${manifest.chapters.length})`);

    try {
      // Read the source note. The user partitioned the OCR text
      // per chapter in advance; the cleaner doesn't re-slice by
      // page range (the source notes may not align with physical
      // page boundaries — depends on the user's prep workflow).
      const sourceFile = app.vault.getAbstractFileByPath(chapter.source_note);
      // Duck-typing (see parseManifest for rationale).
      if (!sourceFile || typeof (sourceFile as any).read !== "function") {
        throw new Error(`源笔记不存在: ${chapter.source_note}`);
      }
      const ocrText = await (sourceFile as any).read();

      // Build the prompt. Use the manifest's prompt_override if
      // provided, otherwise the built-in textbook prompt. The
      // placeholders are filled in below in order.
      const promptTemplate = manifest.prompt_override?.trim() || TEXTBOOK_PROMPT;
      let prompt = promptTemplate
        .replace(/\{\{book_title\}\}/g, manifest.book_title)
        .replace(/\{\{chapter_number\}\}/g, String(chapter.number))
        .replace(/\{\{chapter_title\}\}/g, chapter.title)
        .replace(/\{\{page_range\}\}/g, chapter.page_range ? `${chapter.page_range[0]}–${chapter.page_range[1]}` : "（未指定）");

      // Cross-chapter context: read the previous chapter's saved
      // output from disk if available (we wrote it earlier in this
      // loop), then take the last 2 paragraphs. Same for next, but
      // we don't have a saved output yet — read the source note's
      // first 2 paragraphs as a hint.
      let prevTail = "";
      if (chapter.prev_chapter_id && outputById.has(chapter.prev_chapter_id)) {
        // We saved the previous chapter to disk; read it back.
        // tailById keeps a memory copy, but for the very first
        // chapter run (when this is the second call), the
        // outputById lookup covers it. For robustness, fall back
        // to memory if disk read fails.
        const prevOutputPath = outputById.get(chapter.prev_chapter_id)!;
        const prevFile = app.vault.getAbstractFileByPath(prevOutputPath);
        if (prevFile instanceof TFile) {
          const prevText = await app.vault.read(prevFile);
          prevTail = extractTailParagraphs(prevText);
        } else if (tailById.has(chapter.prev_chapter_id)) {
          prevTail = tailById.get(chapter.prev_chapter_id)!;
        }
      }
      let nextHead = "";
      if (chapter.next_chapter_id && byId.has(chapter.next_chapter_id)) {
        // The next chapter hasn't been processed yet, so we read
        // its source note and take the first 2 prose paragraphs.
        const nextChapter = byId.get(chapter.next_chapter_id)!;
        const nextFile = app.vault.getAbstractFileByPath(nextChapter.source_note);
        if (nextFile instanceof TFile) {
          const nextText = await app.vault.read(nextFile);
          nextHead = extractHeadParagraphs(nextText);
        }
      }

      prompt = prompt
        .replace(/\{\{prev_tail_2_paragraphs\}\}/g, prevTail || "（无）")
        .replace(/\{\{next_head_2_paragraphs\}\}/g, nextHead || "（无）")
        .replace(/\{\{chapter_ocr_text\}\}/g, ocrText);

      // Call the AI. The AIService progress callback updates the
      // user-facing Notice; we don't need our own.
      const cleaned = await ai.runRefinement(prompt);
      if (!cleaned.trim()) {
        throw new Error("AI 返回内容为空");
      }

      // Sanitize title for filename. Pad number to 2 digits (handles
      // up to 99 chapters; for a 100+ chapter book the user can
      // bump the pad length in sanitizeForFilename).
      const safeTitle = sanitizeForFilename(chapter.title);
      const numPad = String(chapter.number).padStart(2, "0");
      const fileName = `ch${numPad}-${safeTitle}.md`;
      const outputPath = `${outputDir}/${fileName}`;

      // Write the cleaned output. Use modify() if the file already
      // exists (re-run case), create() otherwise.
      const existing = app.vault.getAbstractFileByPath(outputPath);
      if (existing instanceof TFile) {
        await app.vault.modify(existing, cleaned);
      } else {
        await app.vault.create(outputPath, cleaned);
      }

      // Cache for cross-chapter lookups.
      outputById.set(chapter.id, outputPath);
      tailById.set(chapter.id, extractTailParagraphs(cleaned));

      succeeded++;
      options?.onProgress?.({
        index: i,
        total: manifest.chapters.length,
        chapter,
        result: { ok: true, outputPath: resolveVaultPath(app, outputPath), chars: cleaned.length },
      });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error(`[textbook-cleaner] chapter ${chapter.id} failed:`, e);
      failures.push({ chapter, error: msg });
      options?.onProgress?.({
        index: i,
        total: manifest.chapters.length,
        chapter,
        result: { ok: false, error: msg },
      });
    }
  }

  return {
    total: manifest.chapters.length,
    succeeded,
    failed: failures.length,
    failures,
  };
}

/**
 * Manifest path picked by the user from the command palette.
 * Stored in settings under textbookManifestPath so the user can
 * re-run the same job without re-picking.
 */
export async function pickManifestFile(app: App): Promise<string | null> {
  return new Promise((resolve) => {
    let chosen: string | null = null;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    input.addEventListener("change", () => {
      const f = input.files?.[0];
      if (f) chosen = f.name;
      document.body.removeChild(input);
      resolve(chosen);
    });
    document.body.appendChild(input);
    input.click();
    // Fallback timer in case the user cancels the picker
    setTimeout(() => {
      if (input.parentNode) {
        document.body.removeChild(input);
        resolve(chosen);
      }
    }, 60_000);
  });
}
