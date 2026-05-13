import esbuild from "esbuild";
import process from "node:process";

const production = process.argv.includes("production");

const context = await esbuild.context({
  entryPoints: { "main": "src/main.ts", "speech-worker": "src/speech-worker.ts" },
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
} else {
  await context.watch();
}
