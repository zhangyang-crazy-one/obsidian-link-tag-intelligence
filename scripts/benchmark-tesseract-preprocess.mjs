#!/usr/bin/env node
import { spawn, execFile as execFileCb } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const WORKER = join(ROOT, "dist", "kreuzberg-worker.cjs");
const PAGE9 = process.env.LTI_OCR_IMAGE || "/tmp/lti-ocr-gongjing13-last3-benchmark/dpi-240/page-9-09.png";
const OUT_DIR = "/tmp/lti-ocr-preprocess-page9";
const TESSDATA_DIR = process.env.LTI_TESSDATA_DIR || "/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/models/tessdata";
const TRUTH = process.env.LTI_OCR_TRUTH || join(ROOT, "tmp/ocr-ground-truth/gongjing13-page9.txt");

function normalizeForScore(text) {
  return text
    .normalize("NFKC")
    .replace(/[ \t\r\n]+/g, "")
    .replace(/[，,。.;；:：、!?！？"'“”‘’`·（）()【】\[\]《》<>〈〉\-—_•*#]/g, "")
    .replace(/嬴利/g, "赢利")
    .replace(/舍弈/g, "舍弃");
}

function levenshtein(a, b) {
  const n = a.length;
  const m = b.length;
  let prev = new Array(m + 1);
  let curr = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

async function readText(path) {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
}

class Worker {
  constructor() {
    this.child = spawn(process.execPath, [WORKER], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this.child.once("error", reject);
    });
    createInterface({ input: this.child.stdout }).on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", (chunk) => process.stderr.write(`[worker] ${chunk}`));
    this.child.on("exit", (code, signal) => {
      for (const job of this.pending.values()) job.reject(new Error(`worker exited code=${code} signal=${signal}`));
      this.pending.clear();
    });
  }
  handleLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.type === "ready") {
      this._readyResolve();
      return;
    }
    if (msg.type === "result" || msg.type === "error") {
      const job = this.pending.get(msg.jobId);
      if (!job) return;
      this.pending.delete(msg.jobId);
      if (msg.type === "result") job.resolve(msg.text ?? "");
      else job.reject(new Error(msg.error));
    }
  }
  async extract(filePath) {
    await this.ready;
    const jobId = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(jobId, { resolve, reject });
      this.child.stdin.write(JSON.stringify({ type: "extract", filePath, tessdataPath: TESSDATA_DIR, jobId }) + "\n");
    });
  }
  stop() {
    this.child.stdin.end();
    this.child.kill("SIGTERM");
  }
}

const variants = [
  { name: "raw", args: [] },
  { name: "resize150", args: ["-resize", "150%"] },
  { name: "trim", args: ["-trim", "+repage"] },
  { name: "trim-resize125", args: ["-trim", "+repage", "-resize", "125%"] },
  { name: "trim-resize150", args: ["-trim", "+repage", "-resize", "150%"] },
  { name: "trim-resize175", args: ["-trim", "+repage", "-resize", "175%"] },
  { name: "crop-content", args: ["-crop", "1320x2050+185+250", "+repage"] },
  { name: "crop-table", args: ["-crop", "1320x930+185+250", "+repage"] },
  { name: "crop-body", args: ["-crop", "1320x1040+185+1180", "+repage"] },
  { name: "crop-content-resize150", args: ["-crop", "1320x2050+185+250", "+repage", "-resize", "150%"] },
  { name: "crop-content-sharp", args: ["-crop", "1320x2050+185+250", "+repage", "-colorspace", "Gray", "-sharpen", "0x1"] },
  { name: "crop-content-threshold", args: ["-crop", "1320x2050+185+250", "+repage", "-colorspace", "Gray", "-threshold", "62%"] },
  { name: "crop-content-normalize", args: ["-crop", "1320x2050+185+250", "+repage", "-colorspace", "Gray", "-normalize", "-sharpen", "0x1"] },
  { name: "crop-content-deskew", args: ["-crop", "1320x2050+185+250", "+repage", "-colorspace", "Gray", "-deskew", "40%"] },
];

await mkdir(OUT_DIR, { recursive: true });
const truth = normalizeForScore(await readText(TRUTH));
const worker = new Worker();
const rows = [];
try {
  for (const variant of variants) {
    const image = join(OUT_DIR, `${variant.name}.png`);
    if (variant.args.length === 0) {
      await execFile("magick", [PAGE9, image]);
    } else {
      await execFile("magick", [PAGE9, ...variant.args, image]);
    }
    const start = Date.now();
    const text = await worker.extract(image);
    const ms = Date.now() - start;
    const outPath = join(OUT_DIR, `${variant.name}.txt`);
    await writeFile(outPath, text, "utf8");
    const ocr = normalizeForScore(text);
    const distance = levenshtein(truth, ocr);
    const accuracy = Math.max(0, 1 - distance / truth.length);
    const row = { name: variant.name, ms, chars: text.length, normChars: ocr.length, distance, accuracy: Number(accuracy.toFixed(4)), outPath, image };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  worker.stop();
}
await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify(rows, null, 2));
