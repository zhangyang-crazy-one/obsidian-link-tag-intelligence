import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production runtime dependency packaging", () => {
  it("copies native runtime dependency closures into dist", () => {
    const source = readFileSync("esbuild.config.mjs", "utf8");
    expect(source).toContain("function copyPackageClosure");
    expect(source).toContain("pkg.dependencies");
    expect(source).toContain("pkg.optionalDependencies");
    expect(source).toContain('"@kreuzberg/node"');
    expect(source).toContain('"onnxruntime-node"');
    expect(source).toContain('"sharp"');
    expect(source).not.toContain('const ocrDeps = [');
  });
});
