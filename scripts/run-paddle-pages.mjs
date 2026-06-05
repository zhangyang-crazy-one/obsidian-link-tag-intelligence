#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const WORKER = join(ROOT, "dist", "paddle-ocr-worker.cjs");
const MODEL_DIR = "/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/models/ocr/pp-ocrv5/server";
const OUT_DIR = "/tmp/lti-ocr-paddle-pages";
const IMAGES = [
  [8, "/tmp/lti-ocr-gongjing13-last3-benchmark/dpi-240/page-8-08.png"],
  [9, "/tmp/lti-ocr-gongjing13-last3-benchmark/dpi-240/page-9-09.png"],
  [10, "/tmp/lti-ocr-gongjing13-last3-benchmark/dpi-240/page-10-10.png"],
];
const detConfig = {
  dbThresh: 0.2,
  dbBoxThresh: 0.3,
  unclipRatio: 2.0,
  minSize: 2,
  nmsIouThresh: 0.2,
  maxCandidates: 4000,
  limitSideLen: 2048,
  scoreMode: "fast",
  useDilation: true,
};

class Worker {
  constructor() {
    this.child = spawn(process.execPath, [WORKER], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this.child.once("error", reject);
    });
    createInterface({ input: this.child.stdout }).on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", (chunk) => process.stderr.write(`[paddle-worker] ${chunk}`));
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
      this.child.stdin.write(JSON.stringify({
        type: "extract",
        jobId,
        imagePath: filePath,
      }) + "\n");
    });
  }
  async init() {
    await this.ready;
    const jobId = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(jobId, { resolve, reject });
      this.child.stdin.write(JSON.stringify({
        type: "init",
        jobId,
        modelDir: MODEL_DIR,
        tier: "server",
        detConfig,
        cpuThreads: 0,
      }) + "\n");
    });
  }
  stop() {
    this.child.stdin.end();
    this.child.kill("SIGTERM");
  }
}

await mkdir(OUT_DIR, { recursive: true });
const worker = new Worker();
try {
  await worker.init();
  for (const [page, image] of IMAGES) {
    const start = Date.now();
    const text = await worker.extract(image);
    const ms = Date.now() - start;
    const outPath = join(OUT_DIR, `page-${page}.txt`);
    await writeFile(outPath, text, "utf8");
    console.log(JSON.stringify({ page, chars: text.length, ms, outPath }));
  }
} finally {
  worker.stop();
}
