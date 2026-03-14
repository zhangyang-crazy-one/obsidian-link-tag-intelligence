import { describe, expect, it } from "vitest";

import {
  buildRecommendedPdfConfig,
  buildRecommendedSmartConnectionsConfig,
  buildRecommendedZoteroConfig,
  diffPdfConfig,
  diffSmartConnectionsConfig,
  diffZoteroConfig,
  normalizeDelimitedList,
  upsertNamedEntries,
  type ResearchWorkbenchProfile
} from "../src/companion-plugins";

const profile: ResearchWorkbenchProfile = {
  language: "zh",
  literatureFolder: "Knowledge/Research/Literature",
  templatePath: "Knowledge/Research/Templates/zotero-literature-note.md",
  attachmentsFolder: "Knowledge/Research/Attachments",
  openNoteAfterImport: true,
  smartFolderExclusions: [".obsidian", ".smart-env", "Archive/Imports"],
  smartHeadingExclusions: ["目录", "Contents", "References"],
  smartResultsLimit: 20,
  semanticEnabled: false,
  semanticCommand: "",
  semanticTimeoutMs: 30000
};

describe("normalizeDelimitedList", () => {
  it("normalizes commas, newlines, and duplicates", () => {
    expect(normalizeDelimitedList("Archive/Imports, .obsidian\n.smart-env, archive/imports")).toEqual([
      "Archive/Imports",
      ".obsidian",
      ".smart-env"
    ]);
  });
});

describe("diffZoteroConfig", () => {
  it("accepts the recommended config", () => {
    expect(diffZoteroConfig(buildRecommendedZoteroConfig(profile), profile)).toEqual([]);
  });
});

describe("diffPdfConfig", () => {
  it("accepts the recommended config", () => {
    expect(diffPdfConfig(buildRecommendedPdfConfig())).toEqual([]);
  });
});

describe("diffSmartConnectionsConfig", () => {
  it("accepts the recommended config", () => {
    expect(diffSmartConnectionsConfig(buildRecommendedSmartConnectionsConfig(profile), profile)).toEqual([]);
  });
});

describe("upsertNamedEntries", () => {
  it("puts required entries first and preserves custom extras", () => {
    const merged = upsertNamedEntries(
      [
        { name: "Custom", template: "c" },
        { name: "Page", template: "old" }
      ],
      [
        { name: "Title & page", template: "a" },
        { name: "Page", template: "b" }
      ]
    );

    expect(merged).toEqual([
      { name: "Title & page", template: "a" },
      { name: "Page", template: "b" },
      { name: "Custom", template: "c" }
    ]);
  });
});
