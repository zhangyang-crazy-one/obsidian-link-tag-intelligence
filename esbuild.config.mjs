import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const production = process.argv.includes("production");

const context = await esbuild.context({
  // Note: PaddleOCR runs in-process via onnxruntime-node (src/paddle-ocr-service.ts),
  // so there is no separate paddle-ocr-worker entry point. This keeps memory
  // footprint minimal (single V8 heap, shared ONNX runtime cache) while still
  // isolating the heavy compute via idle-timer auto-dispose.
  entryPoints: { "main": "src/main.ts", "asr-worker": "src/asr-worker.ts", "vision-worker": "src/vision-worker.ts" },
  bundle: true,
  external: ["obsidian", "@codemirror/state", "@codemirror/view", "sherpa-onnx", "@huggingface/transformers", "onnxruntime-node"],
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

  // Copy plugin files (including asr-worker and vision-worker for child_process.fork)
  for (const f of ["main.js", "asr-worker.js", "manifest.json", "styles.css"]) {
    fs.copyFileSync(path.resolve(f), path.join(distDir, f));
  }
  // vision-worker uses CommonJS `require()` but package.json has
  // "type": "module", so the raw .js file would be misinterpreted by
  // Node 24 as ESM. Rename to .cjs to force CommonJS resolution.
  // Both the project root (where Obsidian loads from in dev) and the
  // dist/ directory (production) need the .cjs extension.
  if (fs.existsSync(path.resolve("vision-worker.js"))) {
    fs.copyFileSync(
      path.resolve("vision-worker.js"),
      path.join(distDir, "vision-worker.cjs")
    );
  }
  // Copy sherpa-onnx (JS + WASM) as runtime dependency
  fs.cpSync(
    path.resolve("node_modules/sherpa-onnx"),
    path.join(distDir, "node_modules", "sherpa-onnx"),
    { recursive: true }
  );

  // Copy local VLM + OCR runtime dependencies for vision-worker.js
  // and the in-process PaddleOCR / Kreuzberg services in main.js.
  // `external` above already tells esbuild to leave these as runtime
  // require()s, so the actual files must exist in dist/node_modules/
  // for Obsidian's Electron renderer to find them at load time.
  // Native bindings (@kreuzberg/node-*-*) are picked up automatically
  // because @kreuzberg's npm package ships them as optionalDependencies.
  const vlmDeps = [
    "@huggingface",
    "@img",
    "@kreuzberg",
    "onnxruntime-node",
    "onnxruntime-web",
    "onnxruntime-common",
    "sharp",
    "global-agent",
    "tar"
  ];
  for (const dep of vlmDeps) {
    const srcPath = path.resolve("node_modules", dep);
    if (fs.existsSync(srcPath)) {
      fs.cpSync(srcPath, path.join(distDir, "node_modules", dep), { recursive: true });
    }
  }

  // Download and bundle the Chinese transducer ASR model (~132MB INT8).
  // Uses greedy_search with dither=0.00003 — no modified_beam_search hallucination.
  const cacheModelDir = path.resolve("models", "zh-2025");
  const modelFiles = ["encoder.int8.onnx", "decoder.onnx", "joiner.int8.onnx", "tokens.txt"];
  const modelComplete = modelFiles.every((f) => fs.existsSync(path.join(cacheModelDir, f)));
  if (!modelComplete) {
    const { execSync } = await import("node:child_process");
    const modelUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2";
    const archive = path.resolve("model.tar.bz2");
    console.log("  Downloading speech model (~132MB) to cache...");
    execSync(`curl -L -o "${archive}" "${modelUrl}"`, { stdio: "inherit" });
    console.log("  Extracting...");
    fs.mkdirSync(cacheModelDir, { recursive: true });
    execSync(`tar -xjf "${archive}" --strip-components=1 -C "${cacheModelDir}"`, { stdio: "inherit" });
    // Keep only needed files
    for (const f of fs.readdirSync(cacheModelDir)) {
      const p = path.join(cacheModelDir, f);
      if (fs.statSync(p).isFile() && !modelFiles.includes(f)) {
        fs.unlinkSync(p);
      }
    }
    try { fs.rmSync(path.join(cacheModelDir, "test_wavs"), { recursive: true, force: true }); } catch {}
    fs.unlinkSync(archive);
    console.log("  Model ready in cache");
  }

  // Copy ASR model from cache to dist
  const distModelDir = path.join(distDir, "models", "zh-2025");
  fs.mkdirSync(distModelDir, { recursive: true });
  for (const f of modelFiles) {
    fs.copyFileSync(path.join(cacheModelDir, f), path.join(distModelDir, f));
  }

  // Download and bundle the Chinese punctuation model (ct-punc) (~40MB compressed).
  const cachePuncDir = path.resolve("models", "punc-zh-2024");
  const puncFiles = ["model.onnx"];
  const puncComplete = puncFiles.every((f) => fs.existsSync(path.join(cachePuncDir, f)));
  if (!puncComplete) {
    const { execSync } = await import("node:child_process");
    const puncUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/punctuation-models/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12.tar.bz2";
    const puncArchive = path.resolve("punc.tar.bz2");
    console.log("  Downloading punctuation model (~40MB) to cache...");
    execSync(`curl -L -o "${puncArchive}" "${puncUrl}"`, { stdio: "inherit" });
    console.log("  Extracting punctuation model...");
    fs.mkdirSync(cachePuncDir, { recursive: true });
    execSync(`tar -xjf "${puncArchive}" --strip-components=1 -C "${cachePuncDir}"`, { stdio: "inherit" });
    // Keep only needed files
    for (const f of fs.readdirSync(cachePuncDir)) {
      const p = path.join(cachePuncDir, f);
      if (fs.statSync(p).isFile() && !puncFiles.includes(f)) {
        fs.unlinkSync(p);
      }
    }
    fs.unlinkSync(puncArchive);
    console.log("  Punctuation model ready in cache");
  }

  // Copy Punctuation model from cache to dist
  const distPuncDir = path.join(distDir, "models", "punc-zh-2024");
  fs.mkdirSync(distPuncDir, { recursive: true });
  for (const f of puncFiles) {
    fs.copyFileSync(path.join(cachePuncDir, f), path.join(distPuncDir, f));
  }

  console.log("  dist/ ready: main.js + asr-worker.js + model + punc + sherpa-onnx");
} else {
  await context.watch();
}
