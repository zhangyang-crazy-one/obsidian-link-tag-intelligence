import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildAttachmentPath,
  buildCitationKey,
  buildLiteratureNotePath,
  buildSourceKey,
  ingestResearchSource,
  inspectIngestedNote,
  normalizeArxivId,
  normalizeDoi,
  normalizeOpenAlexWork,
  parseCliArgs,
  parseArxivEntry
} from "../cli/research-lib.mjs";

const tempDirs: string[] = [];

async function createTempDir(prefix: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("research CLI helpers", () => {
  it("normalizes DOI inputs", () => {
    expect(normalizeDoi("https://doi.org/10.1145/123456.7890")).toBe("10.1145/123456.7890");
    expect(normalizeDoi("DOI: 10.1145/123456.7890")).toBe("10.1145/123456.7890");
  });

  it("normalizes arXiv inputs", () => {
    expect(normalizeArxivId("https://arxiv.org/abs/2403.01234v2")).toBe("2403.01234v2");
    expect(normalizeArxivId("https://arxiv.org/pdf/2403.01234.pdf")).toBe("2403.01234");
  });

  it("keeps empty CLI placeholder values instead of promoting them to true", () => {
    expect(
      parseCliArgs([
        "ingest",
        "--source-type", "arxiv",
        "--source", "2012.02454v1",
        "--metadata-doi", "",
        "--metadata-arxiv", "",
        "--title", "",
        "--authors", "",
        "--year", ""
      ])
    ).toEqual({
      command: "ingest",
      flags: {
        "source-type": "arxiv",
        source: "2012.02454v1",
        "metadata-doi": "",
        "metadata-arxiv": "",
        title: "",
        authors: "",
        year: ""
      }
    });
  });

  it("builds stable citation and source keys", () => {
    expect(buildCitationKey({
      authors: ["Jane Smith", "Alex Lee"],
      year: "2024",
      title: "Coffee Extraction Dynamics"
    })).toBe("smith2024coffee");

    expect(buildSourceKey({
      source_type: "doi",
      doi: "10.1145/123456.7890"
    })).toBe("doi-10-1145-123456-7890");

    expect(buildSourceKey({
      source_type: "arxiv",
      arxiv_id: "2403.01234v2"
    })).toBe("arxiv-2403-01234v2");
  });

  it("builds literature-note and attachment paths", () => {
    const metadata = {
      source_type: "doi",
      doi: "10.1145/123456.7890"
    };

    expect(buildLiteratureNotePath({
      literatureFolder: "Knowledge/Research/Literature",
      metadata
    })).toBe("Knowledge/Research/Literature/doi-10-1145-123456-7890.md");

    expect(buildAttachmentPath({
      attachmentsFolder: "Knowledge/Research/Attachments",
      extension: ".pdf",
      metadata
    })).toBe("Knowledge/Research/Attachments/doi-10-1145-123456-7890.pdf");
  });

  it("normalizes an OpenAlex work into ingestion metadata", () => {
    const normalized = normalizeOpenAlexWork({
      authorships: [
        { author: { display_name: "Jane Smith" } },
        { author: { display_name: "Alex Lee" } }
      ],
      doi: "https://doi.org/10.1145/123456.7890",
      display_name: "Coffee Extraction Dynamics",
      publication_year: 2024,
      publication_date: "2024-01-15",
      type: "journal-article",
      id: "https://openalex.org/W1234567890",
      cited_by_count: 12,
      referenced_works: [
        "https://openalex.org/W1",
        "https://openalex.org/W2"
      ],
      related_works: [
        "https://openalex.org/W3"
      ],
      concepts: [
        { display_name: "Data governance" },
        { display_name: "Digital transformation" }
      ],
      counts_by_year: [
        { year: 2025, cited_by_count: 3 },
        { year: 2024, cited_by_count: 9 }
      ],
      best_oa_location: {
        pdf_url: "https://example.com/paper.pdf",
        landing_page_url: "https://example.com/paper"
      },
      primary_location: {
        landing_page_url: "https://example.com/paper",
        source: {
          display_name: "Journal of Test Cases"
        }
      }
    });

    expect(normalized).toMatchObject({
      source_type: "doi",
      source_id: "10.1145/123456.7890",
      entry_type: "journal-article",
      title: "Coffee Extraction Dynamics",
      authors: ["Jane Smith", "Alex Lee"],
      year: "2024",
      doi: "10.1145/123456.7890",
      pdf_url: "https://example.com/paper.pdf",
      source_url: "https://example.com/paper",
      citation_key: "smith2024coffee",
      openalex_id: "https://openalex.org/W1234567890",
      cited_by_count: 12,
      referenced_works_count: 2,
      related_works_count: 1,
      concepts: ["Data governance", "Digital transformation"],
      counts_by_year: [
        { year: 2025, cited_by_count: 3 },
        { year: 2024, cited_by_count: 9 }
      ],
      publication_date: "2024-01-15",
      primary_location_url: "https://example.com/paper",
      source_display_name: "Journal of Test Cases"
    });
  });

  it("parses an arXiv atom entry", () => {
    const parsed = parseArxivEntry(`
      <feed xmlns:arxiv="http://arxiv.org/schemas/atom">
        <entry>
          <id>http://arxiv.org/abs/2403.01234v2</id>
          <updated>2024-03-04T00:00:00Z</updated>
          <published>2024-03-01T00:00:00Z</published>
          <title> Coffee Extraction Dynamics </title>
          <summary> A study of extraction. </summary>
          <author><name>Jane Smith</name></author>
          <author><name>Alex Lee</name></author>
          <arxiv:doi>10.1145/123456.7890</arxiv:doi>
          <arxiv:primary_category term="cs.IR" />
          <link title="pdf" href="https://arxiv.org/pdf/2403.01234v2.pdf" />
        </entry>
      </feed>
    `);

    expect(parsed).toMatchObject({
      source_type: "arxiv",
      source_id: "2403.01234v2",
      entry_type: "preprint",
      title: "Coffee Extraction Dynamics",
      authors: ["Jane Smith", "Alex Lee"],
      year: "2024",
      arxiv_id: "2403.01234v2",
      doi: "10.1145/123456.7890",
      pdf_url: "https://arxiv.org/pdf/2403.01234v2.pdf",
      source_url: "https://arxiv.org/abs/2403.01234v2",
      primary_category: "cs.IR",
      citation_key: "smith2024coffee"
    });
  });

  it("writes and inspects OpenAlex citation metadata in literature notes", async () => {
    const vaultPath = await createTempDir("lti-openalex-ingest-");
    const fetchImpl = async (url: string) => {
      if (url === "https://arxiv.org/pdf/2012.02454") {
        return {
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode("fake pdf bytes").buffer
        };
      }

      if (!url.includes("api.openalex.org/works?filter=doi:10.1145%2F123456.7890")) {
        throw new Error(`unexpected-url:${url}`);
      }

      return {
        ok: true,
        json: async () => ({
          results: [
            {
              id: "https://openalex.org/W1234567890",
              doi: "https://doi.org/10.1145/123456.7890",
              display_name: "Coffee Extraction Dynamics",
              publication_year: 2024,
              publication_date: "2024-01-15",
              type: "journal-article",
              cited_by_count: 12,
              referenced_works: [
                "https://openalex.org/W1",
                "https://openalex.org/W2"
              ],
              related_works: [
                "https://openalex.org/W3"
              ],
              concepts: [
                { display_name: "Data governance" },
                { display_name: "Digital transformation" }
              ],
              counts_by_year: [
                { year: 2025, cited_by_count: 3 },
                { year: 2024, cited_by_count: 9 }
              ],
              authorships: [
                { author: { display_name: "Jane Smith" } },
                { author: { display_name: "Alex Lee" } }
              ],
              primary_location: {
                landing_page_url: "https://example.com/paper",
                source: {
                  display_name: "Journal of Test Cases"
                }
              },
              best_oa_location: {
                pdf_url: "https://arxiv.org/pdf/2012.02454",
                landing_page_url: "https://example.com/paper",
                source: {
                  display_name: "Journal of Test Cases"
                }
              }
            }
          ]
        })
      };
    };

    const result = await ingestResearchSource(
      { sourceType: "doi", source: "10.1145/123456.7890" },
      {
        vaultPath,
        literatureFolder: "Knowledge/Research/Literature",
        attachmentsFolder: "Knowledge/Research/Attachments",
        downloadPdf: "true"
      },
      fetchImpl
    );

    const inspected = await inspectIngestedNote({
      vaultPath,
      notePath: result.note_path
    });

    expect(result.attachment_paths[0]).toBe("Knowledge/Research/Attachments/doi-10-1145-123456-7890.pdf");
    expect(inspected.attachment_exists).toBe(true);
    expect(inspected.frontmatter).toMatchObject({
      openalex_id: "https://openalex.org/W1234567890",
      cited_by_count: 12,
      referenced_works_count: 2,
      related_works_count: 1,
      concepts: ["Data governance", "Digital transformation"],
      counts_by_year: [
        { year: 2025, cited_by_count: 3 },
        { year: 2024, cited_by_count: 9 }
      ],
      publication_date: "2024-01-15",
      source_display_name: "Journal of Test Cases"
    });
  });
});
