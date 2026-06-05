// One-off: download PaddleOCR server tier via paddle-model.ts to
// /home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/models/ocr/pp-ocrv5/server
// (mirrors what downloadPaddleModel() in main.ts does at runtime).
import { downloadPaddleTier, getPaddleTierTotalBytes } from "/home/zhangyangrui/my_programes/obsidian-link-tag-intelligence/src/paddle-model.ts";
import * as fs from "fs";
import * as path from "path";
const PLUGIN_DIR = "/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence";
const MODEL_DIR = path.join(PLUGIN_DIR, "models/ocr/pp-ocrv5/server");
fs.mkdirSync(MODEL_DIR, { recursive: true });
fs.mkdirSync(path.join(MODEL_DIR, "det"), { recursive: true });
fs.mkdirSync(path.join(MODEL_DIR, "rec"), { recursive: true });
const totalBytes = getPaddleTierTotalBytes("server");
console.log(`[server] total = ${(totalBytes/1024/1024).toFixed(0)} MB`);
const t0 = Date.now();
const result = await downloadPaddleTier(
  "server",
  async ({ role, filename }, data) => {
    const sub = role === "det" ? path.join(MODEL_DIR, "det") : path.join(MODEL_DIR, "rec");
    await fs.promises.writeFile(path.join(sub, filename), Buffer.from(data));
    console.log(`[server] wrote ${role}/${filename} (${(data.byteLength/1024/1024).toFixed(1)} MB)`);
  },
  (p) => {
    process.stdout.write(`\r[server] ${p.role}/${p.currentFile} ${(p.fileProgress.loadedBytes/1024/1024).toFixed(1)}/${(p.fileProgress.totalBytes/1024/1024).toFixed(1)} MB (${(p.fileProgress.percent*100).toFixed(0)}%)`);
  }
);
process.stdout.write("\n");
console.log(`[server] anyFailed=${result.anyFailed} elapsed=${((Date.now()-t0)/1000).toFixed(1)}s`);
for (const f of result.files) console.log(`  ${f.role}/${f.filename}: ${f.success ? "OK" : "FAIL " + f.error}`);
