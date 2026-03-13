import { describe, expect, it } from "vitest";

import {
  buildReferenceContextSnippet,
  extractLegacyLineReferences,
  extractNativeBlockReferences,
  formatLegacyBlockReference,
  formatLegacyLineReference
} from "../src/references";
import { buildSemanticCommand, parseTagAliasMap, shellEscape } from "../src/shared";
import { extractTagTermCandidates } from "../src/tags";

describe("parseTagAliasMap", () => {
  it("parses canonical tags and aliases", () => {
    const map = parseTagAliasMap('{ "手冲咖啡": ["pour-over", "coffee"] }');
    expect(map.get("手冲咖啡")).toEqual(["pour-over", "coffee"]);
  });
});

describe("shellEscape", () => {
  it("escapes shell single quotes", () => {
    expect(shellEscape("it's ready")).toBe("'it'\\''s ready'");
  });
});

describe("buildSemanticCommand", () => {
  it("substitutes placeholders with escaped values", () => {
    const command = buildSemanticCommand("tool --query {{query}} --file {{file}}", {
      query: "coffee notes",
      vaultPath: "/vault",
      filePath: "Life/Note.md",
      selection: ""
    });
    expect(command).toContain("--query 'coffee notes'");
    expect(command).toContain("--file 'Life/Note.md'");
  });
});

describe("legacy line references", () => {
  it("formats single-line references", () => {
    expect(formatLegacyLineReference("MyNote", 12)).toBe("<<MyNote:12>>");
  });

  it("formats block references with legacy paren syntax", () => {
    expect(formatLegacyBlockReference("MyNote", 12, 15)).toBe("(((MyNote#12-15)))");
  });

  it("extracts line ranges from legacy syntax", () => {
    const references = extractLegacyLineReferences("alpha (((MyNote#12-15))) beta <<Other:9>>");
    expect(references).toHaveLength(2);
    expect(references[0]).toMatchObject({ kind: "block", target: "MyNote", startLine: 12, endLine: 15 });
    expect(references[1]).toMatchObject({ kind: "line", target: "Other", startLine: 9 });
  });

  it("extracts native block references", () => {
    const references = extractNativeBlockReferences("alpha [[MyNote#^abc123|quoted]] beta");
    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({ target: "MyNote", blockId: "abc123", alias: "quoted" });
  });

  it("builds a compact source context snippet", () => {
    const content = "prefix words before (((MyNote#12))) suffix words after";
    const start = content.indexOf("(((");
    const end = start + "(((MyNote#12)))".length;
    expect(buildReferenceContextSnippet(content, start, end, 10)).toContain("(((MyNote#12)))");
  });
});

describe("extractTagTermCandidates", () => {
  it("extracts stronger Chinese and mixed-language tag terms", () => {
    const candidates = extractTagTermCandidates("手冲咖啡萃取动力学与感官美学，适合 V60 与聪明杯。");
    expect(candidates).toContain("手冲咖啡");
    expect(candidates).toContain("萃取动力学");
    expect(candidates).toContain("V60");
    expect(candidates).toContain("聪明杯");
  });
});
