import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  formatParentheticalCitation,
  inferResearchTags,
  parseSourceSpecs,
  runPaperWorkflow,
  searchArxivPapers
} from "../cli/workflow-lib.mjs";

const tempDirs: string[] = [];

async function createTempDir(prefix: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("paper workflow helpers", () => {
  it("parses explicit and inferred source specs", () => {
    expect(
      parseSourceSpecs([
        "arxiv:1706.03762",
        "10.1145/123456.7890",
        "pdf:/tmp/example.pdf",
        "https://example.com/remote-paper.pdf",
        "2403.01234v2"
      ].join("\n"))
    ).toEqual([
      { sourceType: "arxiv", source: "1706.03762" },
      { sourceType: "doi", source: "10.1145/123456.7890" },
      { sourceType: "pdf", source: "/tmp/example.pdf" },
      { sourceType: "pdf", source: "https://example.com/remote-paper.pdf" },
      { sourceType: "arxiv", source: "2403.01234v2" }
    ]);
  });

  it("formats parenthetical citations by author count", () => {
    expect(formatParentheticalCitation({ authors: [], year: "2024" })).toBe("(Unknown, 2024)");
    expect(formatParentheticalCitation({ authors: ["Jane Smith"], year: "2024" })).toBe("(Smith, 2024)");
    expect(formatParentheticalCitation({ authors: ["Jane Smith", "Alex Lee"], year: "2024" })).toBe("(Smith & Lee, 2024)");
    expect(formatParentheticalCitation({ authors: ["Jane Smith", "Alex Lee", "Sam Wu"], year: "2024" })).toBe("(Smith et al., 2024)");
  });

  it("infers governance and transformation tags from topic and metadata", () => {
    const tags = inferResearchTags("数据治理和数智转型", {
      title: "Platform governance framework for enterprise AI transformation",
      abstract: "This empirical study examines organizational capability and governance mechanisms."
    });

    expect(tags).toContain("literature-note");
    expect(tags).toContain("data-governance");
    expect(tags).toContain("digital-transformation");
    expect(tags).toContain("intelligent-transformation");
    expect(tags).toContain("platform-governance");
    expect(tags).toContain("organizational-capability");
    expect(tags).toContain("framework");
    expect(tags).toContain("empirical");
  });

  it("parses arXiv search results from atom XML", async () => {
    const xml = `
      <feed xmlns:arxiv="http://arxiv.org/schemas/atom">
        <entry>
          <id>http://arxiv.org/abs/2403.01234v2</id>
          <updated>2024-03-04T00:00:00Z</updated>
          <published>2024-03-01T00:00:00Z</published>
          <title> Data Governance Frameworks </title>
          <summary> A governance-oriented paper. </summary>
          <author><name>Jane Smith</name></author>
          <author><name>Alex Lee</name></author>
          <arxiv:primary_category term="cs.IR" />
          <link title="pdf" href="https://arxiv.org/pdf/2403.01234v2.pdf" />
        </entry>
        <entry>
          <id>http://arxiv.org/abs/2403.05678v1</id>
          <updated>2024-03-05T00:00:00Z</updated>
          <published>2024-03-02T00:00:00Z</published>
          <title> Digital Transformation Signals </title>
          <summary> A second paper. </summary>
          <author><name>Sam Wu</name></author>
          <arxiv:primary_category term="cs.CY" />
          <link title="pdf" href="https://arxiv.org/pdf/2403.05678v1.pdf" />
        </entry>
      </feed>
    `;

    const result = await searchArxivPapers("data governance", 2, async () => ({
      ok: true,
      text: async () => xml
    }));

    expect(result).toMatchObject({
      status: "ok",
      query: "data governance",
      count: 2
    });
    expect(result.results[0]).toMatchObject({
      title: "Data Governance Frameworks",
      arxiv_id: "2403.01234v2"
    });
    expect(result.results[1]).toMatchObject({
      title: "Digital Transformation Signals",
      arxiv_id: "2403.05678v1"
    });
  });

  it("creates a full paper workflow from a local PDF source", async () => {
    const root = await createTempDir("lti-paper-workflow-");
    const vaultPath = path.join(root, "vault");
    const pdfPath = path.join(root, "governance-paper.pdf");

    await fs.mkdir(vaultPath, { recursive: true });
    await fs.writeFile(pdfPath, "fake pdf bytes", "utf8");

    const result = await runPaperWorkflow({
      topic: "数据治理和数智转型",
      vault: vaultPath,
      sources: `pdf:${pdfPath}`,
      title: "数据治理与数智转型框架",
      authors: "张三, 李四",
      year: "2024",
      "download-pdf": "true"
    });

    expect(result.status).toBe("created");
    expect(result.source_count).toBe(1);
    expect(result.topic_note_path).toMatch(/^Knowledge\/Research\/Topics\/topic-[a-z0-9]+\.md$/);
    expect(result.draft_note_path).toMatch(/^Knowledge\/Research\/Drafts\/topic-[a-z0-9]+-draft\.md$/);
    expect(result.sources[0]).toMatchObject({
      source_type: "pdf",
      title: "数据治理与数智转型框架"
    });
    expect(result.sources[0].attachment_paths).toHaveLength(1);

    const draftPath = path.join(vaultPath, result.draft_note_path);
    const topicPath = path.join(vaultPath, result.topic_note_path);
    const matrixPath = path.join(vaultPath, result.matrix_note_path);
    const attachmentPath = path.join(vaultPath, result.sources[0].attachment_paths[0]);

    await expect(fs.readFile(draftPath, "utf8")).resolves.toContain("# 数据治理和数智转型 研究论文初稿");
    await expect(fs.readFile(draftPath, "utf8")).resolves.toContain("## 相关研究");
    await expect(fs.readFile(topicPath, "utf8")).resolves.toContain("generated_by: \"lti-research paper workflow\"");
    await expect(fs.readFile(matrixPath, "utf8")).resolves.toContain("| Source | Year | Method | Citations | Concepts | Core contribution | Topic tags | Link |");
    await expect(fs.access(attachmentPath)).resolves.toBeUndefined();
  });

  it("propagates OpenAlex citation metadata into the paper workflow outputs", async () => {
    const vaultPath = await createTempDir("lti-paper-openalex-");
    const fetchImpl = async (url: string) => {
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
              display_name: "Data Governance Frameworks",
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
                { display_name: "Digital transformation" },
                { display_name: "Artificial intelligence" }
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
                pdf_url: "https://example.com/paper.pdf",
                landing_page_url: "https://example.com/paper",
                source: {
                  display_name: "Journal of Test Cases"
                }
              },
              abstract_inverted_index: {
                Data: [0],
                governance: [1],
                framework: [2],
                supports: [3],
                digital: [4],
                transformation: [5]
              }
            }
          ]
        })
      };
    };

    const result = await runPaperWorkflow(
      {
        topic: "数据治理和数智转型",
        vault: vaultPath,
        sources: "doi:10.1145/123456.7890",
        "download-pdf": "false"
      },
      fetchImpl
    );

    const analysisPath = path.join(vaultPath, result.sources[0].analysis_path);
    const draftPath = path.join(vaultPath, result.draft_note_path);
    const matrixPath = path.join(vaultPath, result.matrix_note_path);

    expect(result.sources[0]).toMatchObject({
      openalex_id: "https://openalex.org/W1234567890",
      cited_by_count: 12,
      reference_count: 2,
      related_work_count: 1,
      concepts: ["Data governance", "Digital transformation", "Artificial intelligence"]
    });

    await expect(fs.readFile(analysisPath, "utf8")).resolves.toContain("## Citation context");
    await expect(fs.readFile(analysisPath, "utf8")).resolves.toContain("OpenAlex cited-by count: 12");
    await expect(fs.readFile(draftPath, "utf8")).resolves.toContain("OpenAlex 目前记录其被引 12 次、参考文献 2 篇");
    await expect(fs.readFile(matrixPath, "utf8")).resolves.toContain("| Data Governance Frameworks | 2024 | framework | 12 | Data governance, Digital transformation, Artificial intelligence |");
  });
});
