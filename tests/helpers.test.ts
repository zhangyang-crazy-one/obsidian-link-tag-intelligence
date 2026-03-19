import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";

import { relationKeyLabel } from "../src/i18n";
import {
  collectLinkCandidates,
  getAllSupportedNoteFiles,
  appendTextToMarkdownSection,
  getBacklinkFiles,
  getCurrentNoteFile,
  getResearchSourceMetadataFromFrontmatter,
  isSupportedNotePath
} from "../src/notes";
import {
  buildReferenceContextSnippet,
  extractLegacyLineReferences,
  extractNativeBlockReferences,
  formatLegacyBlockReference,
  formatLegacyLineReference
} from "../src/references";
import { buildIngestionCommand, buildSemanticCommand, parseTagAliasMap, parseTagFacetMap, shellEscape } from "../src/shared";
import { extractTagTermCandidates, getTagStats } from "../src/tags";

function makeFile(path: string): TFile {
  const file = Object.assign(new TFile(), { path });
  file.name = path.split("/").pop() ?? path;
  file.basename = file.name.replace(/\.[^.]+$/, "");
  return file;
}

function makeApp(options: {
  files: TFile[];
  activeFile?: TFile | null;
  contents?: Record<string, string>;
  caches?: Record<string, Record<string, unknown>>;
  destinations?: Record<string, TFile>;
  resolvedLinks?: Record<string, Record<string, number>>;
}) {
  return {
    vault: {
      getMarkdownFiles: () => options.files.filter((f) => f.path.toLowerCase().endsWith(".md")),
      getFiles: () => options.files,
      cachedRead: async (file: TFile) => options.contents?.[file.path] ?? "",
      getAbstractFileByPath: (path: string) => options.files.find((file) => file.path === path) ?? null
    },
    workspace: {
      getActiveFile: () => options.activeFile ?? null,
      getActiveViewOfType: () => null
    },
    metadataCache: {
      getFirstLinkpathDest: (target: string, sourcePath = "") =>
        options.destinations?.[`${sourcePath}::${target}`]
        ?? options.destinations?.[target]
        ?? null,
      getFileCache: (file: TFile) => options.caches?.[file.path] ?? {},
      resolvedLinks: options.resolvedLinks ?? {}
    }
  } as never;
}

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

describe("parseTagFacetMap", () => {
  it("parses facet groups with canonical tags and aliases", () => {
    const map = parseTagFacetMap('{ "method": { "experiment": ["实验", "experimental"] }, "status": ["draft"] }');
    expect([...map.get("method")?.entries() ?? []]).toEqual([["experiment", ["实验", "experimental"]]]);
    expect([...map.get("status")?.entries() ?? []]).toEqual([["draft", []]]);
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

describe("buildIngestionCommand", () => {
  it("substitutes ingestion placeholders with escaped values", () => {
    const command = buildIngestionCommand(
      "tool --source-type {{source_type}} --source {{source}} --metadata-doi {{metadata_doi}} --authors {{authors}} --download-pdf {{download_pdf}}",
      {
        sourceType: "pdf",
        source: "/tmp/coffee paper.pdf",
        vaultPath: "/vault",
        filePath: "Drafts/Current.md",
        selection: "",
        literatureFolder: "Knowledge/Research/Literature",
        attachmentsFolder: "Knowledge/Research/Attachments",
        templatePath: "Knowledge/Research/Templates/literature-note.md",
        metadataDoi: "10.1000/test",
        metadataArxiv: "",
        title: "",
        authors: "Smith, Lee",
        year: "",
        downloadPdf: "true",
        openAfterImport: "true"
      }
    );

    expect(command).toContain("--source-type 'pdf'");
    expect(command).toContain("--source '/tmp/coffee paper.pdf'");
    expect(command).toContain("--metadata-doi '10.1000/test'");
    expect(command).toContain("--authors 'Smith, Lee'");
    expect(command).toContain("--download-pdf 'true'");
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

describe("supported note helpers", () => {
  it("treats Excalidraw markdown files as supported notes", () => {
    const excalidraw = makeFile("Excalidraw/测试.excalidraw.md");
    const pdf = Object.assign(new TFile(), { path: "Papers/demo.pdf", name: "demo.pdf", basename: "demo" });
    const app = makeApp({
      files: [excalidraw, pdf],
      activeFile: excalidraw
    });

    expect(isSupportedNotePath(excalidraw.path)).toBe(true);
    expect(getAllSupportedNoteFiles(app)).toEqual([excalidraw]);
    expect(getCurrentNoteFile(app)).toBe(excalidraw);
  });
});

describe("Excalidraw note support", () => {
  it("includes Excalidraw notes in link candidate collection", async () => {
    const current = makeFile("Knowledge/Research/current-note.md");
    const canvas = makeFile("Excalidraw/测试.excalidraw.md");
    const app = makeApp({
      files: [current, canvas],
      contents: {
        [current.path]: "Current note body",
        [canvas.path]: "---\ntags: [visual-note]\n---\nVisual map for data governance"
      },
      caches: {
        [current.path]: {},
        [canvas.path]: {
          frontmatter: {
            tags: ["visual-note"],
            aliases: ["治理画布"]
          },
          tags: [{ tag: "#visual-note" }]
        }
      }
    });

    const candidates = await collectLinkCandidates(
      app,
      current,
      "",
      { relationKeys: [] } as never,
      [],
      new Map()
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      title: "测试.excalidraw",
      path: "Excalidraw/测试.excalidraw.md"
    });
    expect(candidates[0].tags).toContain("visual-note");
    expect(candidates[0].aliases).toContain("治理画布");
  });

  it("detects backlinks that point to Excalidraw notes via legacy references", async () => {
    const canvas = makeFile("Excalidraw/测试.excalidraw.md");
    const source = makeFile("Knowledge/Research/source-note.md");
    const app = makeApp({
      files: [canvas, source],
      contents: {
        [canvas.path]: "Canvas body",
        [source.path]: "See <<测试.excalidraw:3>> for the visual summary."
      }
    });

    const backlinks = await getBacklinkFiles(app, canvas);
    expect(backlinks).toEqual([source]);
  });

  it("includes Excalidraw notes in vault tag statistics", () => {
    const canvas = makeFile("Excalidraw/测试.excalidraw.md");
    const app = makeApp({
      files: [canvas],
      caches: {
        [canvas.path]: {
          frontmatter: {
            tags: ["visual-note"]
          }
        }
      }
    });

    const stats = getTagStats(app, "{}");
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      tag: "visual-note",
      count: 1,
      files: [canvas]
    });
  });
});

describe("pure .excalidraw file support", () => {
  it("accepts .excalidraw extension as a supported note path", () => {
    expect(isSupportedNotePath("Excalidraw/diagram.excalidraw")).toBe(true);
    expect(isSupportedNotePath("Excalidraw/测试.excalidraw")).toBe(true);
    expect(isSupportedNotePath("demo.pdf")).toBe(false);
  });

  it("includes .excalidraw files in getAllSupportedNoteFiles", () => {
    const md = makeFile("Notes/hello.md");
    const excalidraw = makeFile("Excalidraw/diagram.excalidraw");
    Object.assign(excalidraw, { extension: "excalidraw" });
    const pdf = Object.assign(new TFile(), { path: "Papers/demo.pdf", name: "demo.pdf", basename: "demo", extension: "pdf" });
    const app = makeApp({
      files: [md, excalidraw, pdf],
      activeFile: excalidraw
    });

    const supported = getAllSupportedNoteFiles(app);
    expect(supported).toContain(md);
    expect(supported).toContain(excalidraw);
    expect(supported).not.toContain(pdf);
  });

  it("returns .excalidraw file from getCurrentNoteFile", () => {
    const excalidraw = makeFile("Excalidraw/diagram.excalidraw");
    Object.assign(excalidraw, { extension: "excalidraw" });
    const app = makeApp({
      files: [excalidraw],
      activeFile: excalidraw
    });

    expect(getCurrentNoteFile(app)).toBe(excalidraw);
  });

  it("includes .excalidraw files in link candidates with graceful degradation", async () => {
    const current = makeFile("Notes/current.md");
    const excalidraw = makeFile("Excalidraw/diagram.excalidraw");
    Object.assign(excalidraw, { extension: "excalidraw" });
    const app = makeApp({
      files: [current, excalidraw],
      contents: {
        [current.path]: "Current note",
        [excalidraw.path]: '{ "type": "excalidraw" }'
      },
      caches: {
        [current.path]: {},
        [excalidraw.path]: {}
      }
    });

    const candidates = await collectLinkCandidates(
      app,
      current,
      "",
      { relationKeys: [] } as never,
      [],
      new Map()
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      title: "diagram",
      path: "Excalidraw/diagram.excalidraw"
    });
    expect(candidates[0].tags).toEqual([]);
    expect(candidates[0].aliases).toEqual([]);
  });
});

describe("relationKeyLabel", () => {
  it("resolves researcher relation labels in Chinese", () => {
    expect(relationKeyLabel("zh", "supports")).toBe("支持");
    expect(relationKeyLabel("zh", "uses_method")).toBe("使用方法");
  });
});

describe("getResearchSourceMetadataFromFrontmatter", () => {
  it("normalizes literature-note metadata from frontmatter", () => {
    expect(
      getResearchSourceMetadataFromFrontmatter({
        citekey: "smith2024coffee",
        authors: ["Smith", "Lee"],
        year: 2024,
        source_type: "journal-article",
        page: 18,
        evidence_kind: "quote"
      })
    ).toEqual({
      citekey: "smith2024coffee",
      author: "Smith, Lee",
      year: "2024",
      sourceType: "journal-article",
      locator: "18",
      evidenceKind: "quote"
    });
  });

  it("prefers entry_type over raw source_type when both exist", () => {
    expect(
      getResearchSourceMetadataFromFrontmatter({
        citekey: "smith2024coffee",
        author: "Smith",
        year: 2024,
        source_type: "doi",
        entry_type: "journal-article"
      })
    ).toEqual({
      citekey: "smith2024coffee",
      author: "Smith",
      year: "2024",
      sourceType: "journal-article",
      locator: undefined,
      evidenceKind: undefined
    });
  });
});

describe("appendTextToMarkdownSection", () => {
  it("inserts before %% delimiter in excalidraw files", () => {
    const content = "---\ntags: [excalidraw]\n---\n# Notes\n\nSome text\n\n%%\n## Drawing\nJSON data\n%%";
    const result = appendTextToMarkdownSection(content, "[[NewLink]]", true);
    expect(result.indexOf("[[NewLink]]")).toBeLessThan(result.indexOf("\n%%\n"));
    expect(result).toContain("[[NewLink]]\n\n%%\n");
  });

  it("appends at end for non-excalidraw files", () => {
    const content = "# My Note\n\nSome content\n";
    const result = appendTextToMarkdownSection(content, "[[NewLink]]", false);
    expect(result).toBe("# My Note\n\nSome content\n[[NewLink]]\n");
  });

  it("falls back to append when excalidraw file has no %% delimiter", () => {
    const content = "---\ntags: [excalidraw]\n---\n# Notes\n";
    const result = appendTextToMarkdownSection(content, "[[NewLink]]", true);
    expect(result).toBe("---\ntags: [excalidraw]\n---\n# Notes\n[[NewLink]]\n");
  });

  it("adds newline separator when content does not end with newline", () => {
    const content = "# My Note\nSome content";
    const result = appendTextToMarkdownSection(content, "<<Target:5>>", false);
    expect(result).toBe("# My Note\nSome content\n<<Target:5>>\n");
  });

  it("handles block reference syntax in excalidraw files", () => {
    const content = "---\nexcalidraw-plugin: parsed\n---\n\n%%\n## Drawing\n%%";
    const result = appendTextToMarkdownSection(content, "(((MyNote#5-10)))", true);
    expect(result).toContain("(((MyNote#5-10)))\n\n%%\n");
  });
});
