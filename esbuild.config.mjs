import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const production = process.argv.includes("production");

const context = await esbuild.context({
  entryPoints: { "main": "src/main.ts", "asr-worker": "src/asr-worker.ts" },
  bundle: true,
  external: ["obsidian", "@codemirror/state", "@codemirror/view", "sherpa-onnx"],
  format: "cjs",
  target: "es2021",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outdir: ".",
  platform: "node"
});

if (production) {
  await context.rebuild();
  await context.dispose();

  // Build a deployable dist/ directory with main.js + sherpa-onnx dependency.
  // Obsidian Electron resolves require("sherpa-onnx") from
  // {plugin-dir}/node_modules/, so we bundle it alongside main.js.
  const distDir = path.resolve("dist");
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(distDir, "node_modules"), { recursive: true });

  // Copy plugin files (including asr-worker for child_process.fork)
  for (const f of ["main.js", "asr-worker.js", "manifest.json", "styles.css"]) {
    fs.copyFileSync(path.resolve(f), path.join(distDir, f));
  }
  // Copy sherpa-onnx (JS + WASM) as runtime dependency
  fs.cpSync(
    path.resolve("node_modules/sherpa-onnx"),
    path.join(distDir, "node_modules", "sherpa-onnx"),
    { recursive: true }
  );

  // Download and bundle the Chinese transducer ASR model (~132MB INT8).
  // Uses greedy_search with dither=0.00003 — no modified_beam_search hallucination.
  const modelDir = path.join(distDir, "models", "zh-2025");
  const modelFiles = ["encoder.int8.onnx", "decoder.onnx", "joiner.int8.onnx", "tokens.txt"];
  const modelComplete = modelFiles.every((f) => fs.existsSync(path.join(modelDir, f)));
  if (!modelComplete) {
    const { execSync } = await import("node:child_process");
    const modelUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2";
    const archive = path.join(distDir, "model.tar.bz2");
    console.log("  Downloading speech model (~132MB)...");
    execSync(`curl -L -o "${archive}" "${modelUrl}"`, { stdio: "inherit" });
    console.log("  Extracting...");
    fs.mkdirSync(modelDir, { recursive: true });
    execSync(`tar -xjf "${archive}" --strip-components=1 -C "${modelDir}"`, { stdio: "inherit" });
    // Keep only needed files
    for (const f of fs.readdirSync(modelDir)) {
      const p = path.join(modelDir, f);
      if (fs.statSync(p).isFile() && !modelFiles.includes(f)) {
        fs.unlinkSync(p);
      }
    }
    fs.rmSync(path.join(modelDir, "test_wavs"), { recursive: true, force: true });
    fs.unlinkSync(archive);
    console.log("  Model ready");
  }

  console.log("  dist/ ready: main.js + asr-worker.js + model + sherpa-onnx");
} else {
  await context.watch();
}
