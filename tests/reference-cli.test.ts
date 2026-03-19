import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { CliCommandError, formatReferenceRange, inspectReferenceRange, locateReferenceRanges } from "../cli/reference-lib.mjs";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function createTempVault() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lti-ref-cli-"));
  tempDirs.push(directory);
  return directory;
}

async function writeNote(vaultPath: string, notePath: string, content: string) {
  const absolutePath = path.join(vaultPath, notePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("reference CLI library", () => {
  it("inspects a line range and returns preview metadata", async () => {
    const vaultPath = await createTempVault();
    await writeNote(
      vaultPath,
      "Knowledge/Research/Literature/demo-note.md",
      [
        "# Demo",
        "line two",
        "line three",
        "line four"
      ].join("\n")
    );

    await expect(inspectReferenceRange({
      vaultPath,
      notePath: "Knowledge/Research/Literature/demo-note",
      startLine: "2",
      endLine: "3"
    })).resolves.toEqual({
      status: "ok",
      note_path: "Knowledge/Research/Literature/demo-note.md",
      target_title: "demo-note",
      target_linktext: "Knowledge/Research/Literature/demo-note",
      start_line: 2,
      end_line: 3,
      total_lines: 4,
      selected_line_count: 2,
      preview_line_count: 2,
      preview: "line two\nline three",
      warnings: []
    });
  });

  it("formats a legacy line reference", async () => {
    const vaultPath = await createTempVault();
    await writeNote(
      vaultPath,
      "Knowledge/Research/Literature/demo-note.md",
      [
        "# Demo",
        "alpha",
        "beta",
        "gamma"
      ].join("\n")
    );

    await expect(formatReferenceRange({
      vaultPath,
      notePath: "Knowledge/Research/Literature/demo-note.md",
      kind: "line",
      startLine: "2",
      endLine: "3"
    })).resolves.toMatchObject({
      status: "ok",
      kind: "line",
      reference: "<<Knowledge/Research/Literature/demo-note:2-3>>",
      preview: "alpha\nbeta"
    });
  });

  it("formats a legacy block reference", async () => {
    const vaultPath = await createTempVault();
    await writeNote(
      vaultPath,
      "Knowledge/Research/Literature/demo-note.md",
      [
        "# Demo",
        "alpha",
        "beta"
      ].join("\n")
    );

    await expect(formatReferenceRange({
      vaultPath,
      notePath: "Knowledge/Research/Literature/demo-note.md",
      kind: "block",
      startLine: "2",
      endLine: "3"
    })).resolves.toMatchObject({
      status: "ok",
      kind: "block",
      reference: "(((Knowledge/Research/Literature/demo-note#2-3)))"
    });
  });

  it("locates paragraph matches from a text snippet", async () => {
    const vaultPath = await createTempVault();
    await writeNote(
      vaultPath,
      "Knowledge/Research/Literature/demo-note.md",
      [
        "# Demo",
        "",
        "First paragraph line one.",
        "First paragraph line two.",
        "",
        "Second paragraph mentions OpenAlex citation counts.",
        "Second paragraph closes here."
      ].join("\n")
    );

    await expect(locateReferenceRanges({
      vaultPath,
      notePath: "Knowledge/Research/Literature/demo-note.md",
      query: "OpenAlex citation counts",
      scope: "paragraph"
    })).resolves.toMatchObject({
      status: "ok",
      scope: "paragraph",
      match_count: 1,
      matches: [{
        occurrence: 1,
        start_line: 6,
        end_line: 7,
        line_reference: "<<Knowledge/Research/Literature/demo-note:6-7>>",
        block_reference: "(((Knowledge/Research/Literature/demo-note#6-7)))"
      }]
    });
  });

  it("treats headings, list items, and frontmatter as paragraph boundaries", async () => {
    const vaultPath = await createTempVault();
    await writeNote(
      vaultPath,
      "Knowledge/Research/Literature/demo-note.md",
      [
        "---",
        "title: Demo",
        "---",
        "## Abstract",
        "The abstract mentions adaptive governance.",
        "## Citation context",
        "- Cited by: 12",
        "- Related works tracked: 3"
      ].join("\n")
    );

    await expect(locateReferenceRanges({
      vaultPath,
      notePath: "Knowledge/Research/Literature/demo-note.md",
      query: "adaptive governance",
      scope: "paragraph"
    })).resolves.toMatchObject({
      status: "ok",
      match_count: 1,
      matches: [{
        start_line: 5,
        end_line: 5,
        preview: "The abstract mentions adaptive governance."
      }]
    });
  });

  it("formats a unique paragraph match from --query", async () => {
    const vaultPath = await createTempVault();
    await writeNote(
      vaultPath,
      "Knowledge/Research/Literature/demo-note.md",
      [
        "# Demo",
        "",
        "The OpenAlex enrichment exposes citation counts and concepts.",
        "This paragraph should become the selected evidence span."
      ].join("\n")
    );

    await expect(formatReferenceRange({
      vaultPath,
      notePath: "Knowledge/Research/Literature/demo-note.md",
      kind: "line",
      query: "citation counts and concepts",
      scope: "paragraph"
    })).resolves.toMatchObject({
      status: "ok",
      kind: "line",
      start_line: 3,
      end_line: 4,
      reference: "<<Knowledge/Research/Literature/demo-note:3-4>>"
    });
  });

  it("returns an ambiguity error when --query matches multiple paragraphs", async () => {
    const vaultPath = await createTempVault();
    await writeNote(
      vaultPath,
      "Knowledge/Research/Literature/demo-note.md",
      [
        "Paragraph alpha mentions governance.",
        "",
        "Paragraph beta also mentions governance."
      ].join("\n")
    );

    await expect(formatReferenceRange({
      vaultPath,
      notePath: "Knowledge/Research/Literature/demo-note.md",
      kind: "line",
      query: "mentions governance",
      scope: "paragraph"
    })).rejects.toMatchObject<CliCommandError>({
      code: "ambiguous-match",
      details: {
        match_count: 2
      }
    });
  });

  it("returns a structured error for out-of-bounds lines", async () => {
    const vaultPath = await createTempVault();
    await writeNote(vaultPath, "Knowledge/Research/Literature/demo-note.md", "line one\nline two");

    await expect(formatReferenceRange({
      vaultPath,
      notePath: "Knowledge/Research/Literature/demo-note.md",
      kind: "line",
      startLine: "4"
    })).rejects.toMatchObject<CliCommandError>({
      code: "line-out-of-bounds"
    });
  });

  it("truncates long previews and warns", async () => {
    const vaultPath = await createTempVault();
    await writeNote(
      vaultPath,
      "Knowledge/Research/Literature/demo-note.md",
      Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join("\n")
    );

    await expect(inspectReferenceRange({
      vaultPath,
      notePath: "Knowledge/Research/Literature/demo-note.md",
      startLine: "1",
      endLine: "8",
      maxPreviewLines: "3"
    })).resolves.toMatchObject({
      preview: "line 1\nline 2\nline 3",
      preview_line_count: 3,
      selected_line_count: 8,
      warnings: ["preview_truncated"]
    });
  });
});

describe("reference CLI command routing", () => {
  it("dispatches ref locate through the top-level CLI", async () => {
    const vaultPath = await createTempVault();
    await writeNote(
      vaultPath,
      "Knowledge/Research/Literature/demo-note.md",
      "# Demo\n\nOpenAlex citation counts help rank the source.\n"
    );

    const { stdout } = await execFileAsync(process.execPath, [
      "cli/lti-research.mjs",
      "ref",
      "locate",
      "--vault",
      vaultPath,
      "--note-path",
      "Knowledge/Research/Literature/demo-note.md",
      "--query",
      "citation counts",
      "--scope",
      "paragraph"
    ], {
      cwd: repoRoot
    });

    expect(JSON.parse(stdout)).toMatchObject({
      status: "ok",
      scope: "paragraph",
      match_count: 1,
      matches: [{
        start_line: 3,
        end_line: 3
      }]
    });
  });

  it("dispatches ref format through the top-level CLI", async () => {
    const vaultPath = await createTempVault();
    await writeNote(
      vaultPath,
      "Knowledge/Research/Literature/demo-note.md",
      "# Demo\nalpha\nbeta\n"
    );

    const { stdout } = await execFileAsync(process.execPath, [
      "cli/lti-research.mjs",
      "ref",
      "format",
      "--vault",
      vaultPath,
      "--note-path",
      "Knowledge/Research/Literature/demo-note.md",
      "--kind",
      "line",
      "--start-line",
      "2",
      "--end-line",
      "3"
    ], {
      cwd: repoRoot
    });

    expect(JSON.parse(stdout)).toMatchObject({
      status: "ok",
      kind: "line",
      reference: "<<Knowledge/Research/Literature/demo-note:2-3>>"
    });
  });

  it("returns a structured CLI error for ambiguous query formatting", async () => {
    const vaultPath = await createTempVault();
    await writeNote(
      vaultPath,
      "Knowledge/Research/Literature/demo-note.md",
      [
        "alpha query target",
        "",
        "beta query target"
      ].join("\n")
    );

    await expect(execFileAsync(process.execPath, [
      "cli/lti-research.mjs",
      "ref",
      "format",
      "--vault",
      vaultPath,
      "--note-path",
      "Knowledge/Research/Literature/demo-note.md",
      "--kind",
      "line",
      "--query",
      "query target",
      "--scope",
      "paragraph"
    ], {
      cwd: repoRoot
    })).rejects.toMatchObject({
      stdout: expect.stringContaining("\"code\": \"ambiguous-match\"")
    });
  });
});
