import esbuild from "esbuild";
import process from "node:process";

const production = process.argv.includes("production");

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "@codemirror/state", "@codemirror/view"],
  format: "cjs",
  target: "es2021",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  platform: "node"
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
