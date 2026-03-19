import { promises as fs } from "node:fs";
import path from "node:path";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toPosix(value) {
  return value.replace(/\\/g, "/");
}

function basenameWithoutExtension(filePath) {
  const normalized = toPosix(filePath);
  return path.posix.basename(normalized, path.posix.extname(normalized));
}

function stripMarkdownExtension(filePath) {
  return toPosix(filePath).replace(/\.md$/i, "");
}

function normalizeNotePath(notePath) {
  const normalized = toPosix(trimString(notePath));
  if (!normalized) {
    throw new CliCommandError("missing-note-path", "Missing --note-path.");
  }

  const withoutLeadingSlash = normalized.replace(/^\/+/, "");
  const safePath = path.posix.normalize(withoutLeadingSlash);
  if (!safePath || safePath === "." || safePath.startsWith("../") || safePath.includes("/../")) {
    throw new CliCommandError("invalid-note-path", "The note path must stay inside the vault.", {
      note_path: normalized
    });
  }

  return safePath.toLowerCase().endsWith(".md") ? safePath : `${safePath}.md`;
}

function parsePositiveInteger(value, flagName) {
  const normalized = trimString(value);
  if (!normalized) {
    throw new CliCommandError("invalid-line-range", `Missing ${flagName}.`);
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new CliCommandError("invalid-line-range", `${flagName} must be a positive integer.`, {
      value: normalized
    });
  }

  return parsed;
}

function parseOptionalPositiveInteger(value, flagName) {
  const normalized = trimString(value);
  if (!normalized) {
    return null;
  }
  return parsePositiveInteger(normalized, flagName);
}

function normalizeExplicitLineRange(startLineValue, endLineValue, totalLines) {
  const startLine = parsePositiveInteger(startLineValue, "--start-line");
  const endLine = trimString(endLineValue) ? parsePositiveInteger(endLineValue, "--end-line") : startLine;

  if (endLine < startLine) {
    throw new CliCommandError("invalid-line-range", "--end-line must be greater than or equal to --start-line.", {
      start_line: startLine,
      end_line: endLine
    });
  }

  if (startLine > totalLines || endLine > totalLines) {
    throw new CliCommandError("line-out-of-bounds", "The requested line range exceeds the file length.", {
      start_line: startLine,
      end_line: endLine,
      total_lines: totalLines
    });
  }

  return { startLine, endLine };
}

function parsePreviewLineLimit(value, fallback = 6) {
  const normalized = trimString(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new CliCommandError("invalid-preview-line-limit", "--max-preview-lines must be a positive integer.", {
      value: normalized
    });
  }

  return parsed;
}

function parseMaxResults(value, fallback = 5) {
  const normalized = trimString(value);
  if (!normalized) {
    return fallback;
  }
  return parsePositiveInteger(normalized, "--max-results");
}

function normalizeLocateScope(value) {
  const normalized = trimString(value).toLowerCase() || "paragraph";
  if (!["line", "paragraph"].includes(normalized)) {
    throw new CliCommandError("unsupported-scope", "Unsupported --scope. Use line or paragraph.", {
      scope: normalized
    });
  }
  return normalized;
}

function normalizeQuery(value) {
  const normalized = trimString(value);
  if (!normalized) {
    throw new CliCommandError("missing-query", "Missing --query.");
  }
  return normalized;
}

function normalizeSearchableText(value) {
  return trimString(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isMarkdownStandaloneLine(line) {
  return /^\s*#{1,6}\s+/.test(line)
    || /^\s*(?:[-*+]\s+|\d+\.\s+)/.test(line)
    || /^\s*>/.test(line)
    || /^\s*```/.test(line);
}

function formatLegacyLineReference(target, startLine, endLine) {
  if (endLine > startLine) {
    return `<<${target}:${startLine}-${endLine}>>`;
  }
  return `<<${target}:${startLine}>>`;
}

function formatLegacyBlockReference(target, startLine, endLine) {
  if (endLine > startLine) {
    return `(((${target}#${startLine}-${endLine})))`;
  }
  return `(((${target}#${startLine})))`;
}

function buildPreview(lines, startLine, endLine, maxPreviewLines) {
  const selectedLineCount = endLine - startLine + 1;
  const previewEndLine = Math.min(endLine, startLine + maxPreviewLines - 1);
  const preview = lines.slice(startLine - 1, previewEndLine).join("\n").trim();
  const truncated = previewEndLine < endLine;

  return {
    preview,
    previewLineCount: previewEndLine - startLine + 1,
    selectedLineCount,
    truncated
  };
}

async function loadNote(options = {}) {
  const vaultPath = trimString(options.vaultPath);
  if (!vaultPath) {
    throw new CliCommandError("missing-vault", "Missing --vault.");
  }

  const notePath = normalizeNotePath(options.notePath);
  const absolutePath = path.join(vaultPath, notePath);

  let content;
  try {
    content = await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new CliCommandError("note-not-found", "The target note does not exist.", {
        note_path: notePath
      });
    }
    throw error;
  }

  const lines = content.split("\n");

  return {
    notePath,
    title: basenameWithoutExtension(notePath),
    targetLinktext: stripMarkdownExtension(notePath),
    totalLines: lines.length,
    lines
  };
}

function buildRangeResult(note, startLine, endLine, maxPreviewLines) {
  const preview = buildPreview(note.lines, startLine, endLine, maxPreviewLines);
  const warnings = preview.truncated ? ["preview_truncated"] : [];

  return {
    notePath: note.notePath,
    title: note.title,
    targetLinktext: note.targetLinktext,
    totalLines: note.totalLines,
    startLine,
    endLine,
    warnings,
    ...preview
  };
}

export class CliCommandError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CliCommandError";
    this.code = code;
    this.details = details;
  }
}

export async function inspectReferenceRange(options = {}) {
  const note = await loadNote(options);
  const { startLine, endLine } = normalizeExplicitLineRange(options.startLine, options.endLine, note.totalLines);
  const maxPreviewLines = parsePreviewLineLimit(options.maxPreviewLines, 6);
  const range = buildRangeResult(note, startLine, endLine, maxPreviewLines);
  return {
    status: "ok",
    note_path: range.notePath,
    target_title: range.title,
    target_linktext: range.targetLinktext,
    start_line: range.startLine,
    end_line: range.endLine,
    total_lines: range.totalLines,
    selected_line_count: range.selectedLineCount,
    preview_line_count: range.previewLineCount,
    preview: range.preview,
    warnings: range.warnings
  };
}

function formatReferenceForKind(kind, targetLinktext, startLine, endLine) {
  if (kind === "line") {
    return formatLegacyLineReference(targetLinktext, startLine, endLine);
  }
  if (kind === "block") {
    return formatLegacyBlockReference(targetLinktext, startLine, endLine);
  }
  throw new CliCommandError("unsupported-kind", "Unsupported --kind. Use line or block.", {
    kind
  });
}

function normalizeReferenceKind(value) {
  const normalized = trimString(value).toLowerCase() || "line";
  if (!["line", "block"].includes(normalized)) {
    throw new CliCommandError("unsupported-kind", "Unsupported --kind. Use line or block.", {
      kind: normalized
    });
  }
  return normalized;
}

function buildParagraphCandidates(lines) {
  const candidates = [];
  let startLine = null;
  let buffer = [];
  let inFrontmatter = false;

  function flush(endLine) {
    if (startLine === null || buffer.length === 0) {
      startLine = null;
      buffer = [];
      return;
    }

    candidates.push({
      startLine,
      endLine,
      text: buffer.join("\n")
    });
    startLine = null;
    buffer = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = trimString(line);

    if (index === 0 && trimmed === "---") {
      inFrontmatter = true;
      flush(index);
      continue;
    }

    if (inFrontmatter) {
      if (trimmed === "---") {
        inFrontmatter = false;
      }
      continue;
    }

    if (!trimString(line)) {
      flush(index);
      continue;
    }

    if (isMarkdownStandaloneLine(line)) {
      flush(index);
      candidates.push({
        startLine: index + 1,
        endLine: index + 1,
        text: line
      });
      continue;
    }

    if (startLine === null) {
      startLine = index + 1;
    }
    buffer.push(line);
  }

  flush(lines.length);
  return candidates;
}

function buildLineCandidates(lines) {
  return lines
    .map((line, index) => ({
      startLine: index + 1,
      endLine: index + 1,
      text: line
    }))
    .filter((candidate) => Boolean(trimString(candidate.text)));
}

function buildSearchCandidates(lines, scope) {
  return scope === "line" ? buildLineCandidates(lines) : buildParagraphCandidates(lines);
}

function buildReferenceMatch(note, candidate, occurrence, maxPreviewLines) {
  const range = buildRangeResult(note, candidate.startLine, candidate.endLine, maxPreviewLines);
  return {
    occurrence,
    start_line: range.startLine,
    end_line: range.endLine,
    selected_line_count: range.selectedLineCount,
    preview_line_count: range.previewLineCount,
    preview: range.preview,
    line_reference: formatLegacyLineReference(range.targetLinktext, range.startLine, range.endLine),
    block_reference: formatLegacyBlockReference(range.targetLinktext, range.startLine, range.endLine),
    warnings: range.warnings
  };
}

async function locateReferenceMatches(options = {}) {
  const note = await loadNote(options);
  const scope = normalizeLocateScope(options.scope);
  const query = normalizeQuery(options.query);
  const maxPreviewLines = parsePreviewLineLimit(options.maxPreviewLines, 6);
  const maxResults = parseMaxResults(options.maxResults, 5);
  const normalizedQuery = normalizeSearchableText(query);
  const candidates = buildSearchCandidates(note.lines, scope)
    .filter((candidate) => normalizeSearchableText(candidate.text).includes(normalizedQuery));

  const returned = candidates
    .slice(0, maxResults)
    .map((candidate, index) => buildReferenceMatch(note, candidate, index + 1, maxPreviewLines));
  const warnings = candidates.length > maxResults ? ["result_truncated"] : [];

  return {
    note,
    scope,
    query,
    maxResults,
    matchCount: candidates.length,
    candidates,
    matches: returned,
    warnings
  };
}

async function resolveReferenceRange(options = {}) {
  if (trimString(options.query)) {
    const located = await locateReferenceMatches(options);
    const occurrence = parseOptionalPositiveInteger(options.occurrence, "--occurrence");

    if (located.matchCount === 0) {
      throw new CliCommandError("no-match", "No matching line or paragraph was found for --query.", {
        note_path: located.note.notePath,
        scope: located.scope,
        query: located.query
      });
    }

    if (occurrence !== null) {
      if (occurrence > located.matchCount) {
        throw new CliCommandError("occurrence-out-of-range", "--occurrence exceeds the number of matches.", {
          note_path: located.note.notePath,
          scope: located.scope,
          query: located.query,
          occurrence,
          match_count: located.matchCount
        });
      }
      const candidate = located.candidates[occurrence - 1];
      return buildRangeResult(
        located.note,
        candidate.startLine,
        candidate.endLine,
        parsePreviewLineLimit(options.maxPreviewLines, 6)
      );
    }

    if (located.matchCount > 1) {
      throw new CliCommandError("ambiguous-match", "Multiple matches were found for --query. Use --occurrence or ref locate.", {
        note_path: located.note.notePath,
        scope: located.scope,
        query: located.query,
        match_count: located.matchCount,
        matches: located.matches
      });
    }

    const match = located.matches[0];
    return buildRangeResult(
      located.note,
      match.start_line,
      match.end_line,
      parsePreviewLineLimit(options.maxPreviewLines, 6)
    );
  }

  const note = await loadNote(options);
  const { startLine, endLine } = normalizeExplicitLineRange(options.startLine, options.endLine, note.totalLines);
  const maxPreviewLines = parsePreviewLineLimit(options.maxPreviewLines, 6);
  return buildRangeResult(note, startLine, endLine, maxPreviewLines);
}

export async function locateReferenceRanges(options = {}) {
  const located = await locateReferenceMatches(options);
  return {
    status: "ok",
    scope: located.scope,
    query: located.query,
    note_path: located.note.notePath,
    target_title: located.note.title,
    target_linktext: located.note.targetLinktext,
    total_lines: located.note.totalLines,
    match_count: located.matchCount,
    returned_match_count: located.matches.length,
    max_results: located.maxResults,
    matches: located.matches,
    warnings: located.warnings
  };
}

export async function formatReferenceRange(options = {}) {
  const range = await resolveReferenceRange(options);
  const normalizedKind = normalizeReferenceKind(options.kind);
  const reference = formatReferenceForKind(normalizedKind, range.targetLinktext, range.startLine, range.endLine);

  return {
    status: "ok",
    kind: normalizedKind,
    note_path: range.notePath,
    target_title: range.title,
    target_linktext: range.targetLinktext,
    start_line: range.startLine,
    end_line: range.endLine,
    total_lines: range.totalLines,
    selected_line_count: range.selectedLineCount,
    preview_line_count: range.previewLineCount,
    preview: range.preview,
    reference,
    warnings: range.warnings
  };
}
