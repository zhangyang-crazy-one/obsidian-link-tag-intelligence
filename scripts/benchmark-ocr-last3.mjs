#!/usr/bin/env node
import { spawn, execFile as execFileCb } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DEFAULT_PDF = "/home/zhangyangrui/文档/xwechat_files/zhangyangrui_8a7a/msg/file/2026-06/工程经济学-第13版-中文翻译版-前10页-OCR测试.pdf";
const MODEL_ROOT = "/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/models/ocr/pp-ocrv5";
const OUT_DIR = "/tmp/lti-ocr-gongjing13-last3-benchmark";
const PADDLE_WORKER = join(ROOT, "dist", "paddle-ocr-worker.cjs");
const KREUZBERG_WORKER = join(ROOT, "dist", "kreuzberg-worker.cjs");
const TESSDATA_DIR = process.env.LTI_TESSDATA_DIR || "/tmp/lti-tessdata";

const KEY_PHRASES = [
  "本书的历史",
  "工程经济学第13版的特色",
  "电子表格模型",
  "表P-1",
  "工程经济学课程教学大纲",
  "工程经济学作品集",
  "本书的主要内容",
  "货币一时间的联系和等值计算",
  "不确定性分析",
  "多属性决策问题",
];

const CONFIGS = [
  {
    name: "default",
    detConfig: {
      dbThresh: 0.3,
      dbBoxThresh: 0.6,
      unclipRatio: 1.5,
      minSize: 3,
      nmsIouThresh: 0.3,
      maxCandidates: 1000,
      limitSideLen: 960,
      scoreMode: "fast",
      useDilation: true,
    },
  },
  {
    name: "textbook-sensitive",
    detConfig: {
      dbThresh: 0.25,
      dbBoxThresh: 0.35,
      unclipRatio: 1.8,
      minSize: 2,
      nmsIouThresh: 0.25,
      maxCandidates: 3000,
      limitSideLen: 1536,
      scoreMode: "fast",
      useDilation: true,
    },
  },
  {
    name: "textbook-highres",
    detConfig: {
      dbThresh: 0.2,
      dbBoxThresh: 0.3,
      unclipRatio: 2.0,
      minSize: 2,
      nmsIouThresh: 0.2,
      maxCandidates: 4000,
      limitSideLen: 2048,
      scoreMode: "fast",
      useDilation: true,
    },
  },
  {
    name: "less-dilation",
    detConfig: {
      dbThresh: 0.25,
      dbBoxThresh: 0.35,
      unclipRatio: 1.8,
      minSize: 2,
      nmsIouThresh: 0.25,
      maxCandidates: 3000,
      limitSideLen: 1536,
      scoreMode: "fast",
      useDilation: false,
    },
  },
];

function parseArgs(argv) {
  const args = {
    pdf: DEFAULT_PDF,
    pages: [8, 9, 10],
    dpis: [200, 240, 300],
    tiers: ["server"],
    configs: CONFIGS.map((c) => c.name),
    includeKreuzberg: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--pdf" && value) { args.pdf = value; i++; }
    else if (key === "--pages" && value) { args.pages = value.split(",").map((n) => Number(n.trim())).filter(Boolean); i++; }
    else if (key === "--dpis" && value) { args.dpis = value.split(",").map((n) => Number(n.trim())).filter(Boolean); i++; }
    else if (key === "--tiers" && value) { args.tiers = value.split(",").map((s) => s.trim()).filter(Boolean); i++; }
    else if (key === "--configs" && value) { args.configs = value.split(",").map((s) => s.trim()).filter(Boolean); i++; }
    else if (key === "--no-kreuzberg") { args.includeKreuzberg = false; }
  }
  return args;
}

async function renderPages(pdf, pages, dpis) {
  await mkdir(OUT_DIR, { recursive: true });
  const rendered = [];
  for (const dpi of dpis) {
    const dir = join(OUT_DIR, `dpi-${dpi}`);
    await mkdir(dir, { recursive: true });
    for (const page of pages) {
      const prefix = join(dir, `page-${page}`);
      await execFile("pdftoppm", ["-png", "-r", String(dpi), "-f", String(page), "-l", String(page), pdf, prefix]);
      const files = (await readdir(dir)).filter((f) => f.startsWith(`page-${page}-`) && f.endsWith(".png")).sort();
      const file = files.at(-1);
      if (!file) throw new Error(`pdftoppm produced no file for page ${page} dpi ${dpi}`);
      rendered.push({ page, dpi, path: join(dir, file) });
    }
  }
  return rendered;
}

class PaddleWorkerClient {
  constructor(workerPath) {
    const env = { ...process.env };
    const nodePath = join(ROOT, "node_modules");
    env.NODE_PATH = env.NODE_PATH ? `${nodePath}:${env.NODE_PATH}` : nodePath;
    this.child = spawn("node", [workerPath], {
      cwd: join(ROOT, "dist"),
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;
    });
    const rl = createInterface({ input: this.child.stdout });
    rl.on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", (chunk) => process.stderr.write(`[paddle-worker] ${chunk}`));
    this.child.on("exit", (code, signal) => {
      const err = new Error(`paddle worker exited code=${code} signal=${signal}`);
      this._readyReject?.(err);
      for (const job of this.pending.values()) job.reject(err);
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
    if (msg.type === "progress") return;
    if (msg.type === "result" || msg.type === "error") {
      const job = this.pending.get(msg.jobId);
      if (!job) return;
      this.pending.delete(msg.jobId);
      if (msg.type === "result") job.resolve(msg.text ?? "");
      else job.reject(new Error(msg.error));
    }
  }

  async request(payload) {
    await this.ready;
    const jobId = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(jobId, { resolve, reject });
      this.child.stdin.write(JSON.stringify({ ...payload, jobId }) + "\n");
    });
  }

  async init({ modelDir, detConfig, tier }) {
    await this.request({ type: "init", modelDir, detConfig, tier, cpuThreads: 6 });
  }

  async extract(imagePath) {
    return this.request({ type: "extract", imagePath });
  }

  stop() {
    this.child.stdin.end();
    this.child.kill("SIGTERM");
  }
}

class KreuzbergWorkerClient {
  constructor(workerPath) {
    const env = { ...process.env };
    const nodePath = join(ROOT, "node_modules");
    env.NODE_PATH = env.NODE_PATH ? `${nodePath}:${env.NODE_PATH}` : nodePath;
    this.child = spawn("node", [workerPath], {
      cwd: join(ROOT, "dist"),
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;
    });
    const rl = createInterface({ input: this.child.stdout });
    rl.on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", (chunk) => process.stderr.write(`[kreuzberg-worker] ${chunk}`));
    this.child.on("exit", (code, signal) => {
      const err = new Error(`kreuzberg worker exited code=${code} signal=${signal}`);
      this._readyReject?.(err);
      for (const job of this.pending.values()) job.reject(err);
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
    if (msg.type === "progress") return;
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
        filePath,
        tessdataPath: TESSDATA_DIR,
        jobId,
      }) + "\n");
    });
  }

  stop() {
    this.child.stdin.end();
    this.child.kill("SIGTERM");
  }
}

function scoreText(text) {
  const cjk = [...text].filter((ch) => /[\u3400-\u9fff]/u.test(ch)).length;
  const latin = [...text].filter((ch) => /[A-Za-z0-9]/.test(ch)).length;
  const phraseHits = KEY_PHRASES.filter((phrase) => text.includes(phrase));
  const replacementNoise = (text.match(/[�□]/g) ?? []).length;
  return {
    chars: text.length,
    cjk,
    latin,
    lines: text.split(/\n+/).filter((line) => line.trim()).length,
    phraseHits,
    replacementNoise,
    score: cjk + latin * 0.3 + phraseHits.length * 200 - replacementNoise * 10,
  };
}

async function runPaddleSuite(rendered, tiers, configNames) {
  if (!existsSync(PADDLE_WORKER)) {
    throw new Error(`Missing ${PADDLE_WORKER}; run npm run build first`);
  }
  const selectedConfigs = CONFIGS.filter((cfg) => configNames.includes(cfg.name));
  const rows = [];
  for (const tier of tiers) {
    const modelDir = join(MODEL_ROOT, tier);
    for (const config of selectedConfigs) {
      const client = new PaddleWorkerClient(PADDLE_WORKER);
      try {
        await client.init({ modelDir, detConfig: config.detConfig, tier });
        for (const item of rendered) {
          const t0 = Date.now();
          const text = await client.extract(item.path);
          const ms = Date.now() - t0;
          const metric = scoreText(text);
          const outPath = join(OUT_DIR, `paddle-${tier}-${config.name}-dpi${item.dpi}-page${item.page}.txt`);
          await writeFile(outPath, text, "utf8");
          rows.push({ engine: "paddle", tier, config: config.name, page: item.page, dpi: item.dpi, ms, outPath, ...metric });
          console.log(JSON.stringify(rows.at(-1)));
        }
      } finally {
        client.stop();
      }
    }
  }
  return rows;
}

async function runKreuzbergSuite(rendered) {
  if (!existsSync(KREUZBERG_WORKER)) {
    throw new Error(`Missing ${KREUZBERG_WORKER}; run npm run build first`);
  }
  const rows = [];
  const client = new KreuzbergWorkerClient(KREUZBERG_WORKER);
  try {
    for (const item of rendered) {
      const t0 = Date.now();
      const text = await client.extract(item.path);
      const ms = Date.now() - t0;
      const metric = scoreText(text);
      const outPath = join(OUT_DIR, `kreuzberg-dpi${item.dpi}-page${item.page}.txt`);
      await writeFile(outPath, text, "utf8");
      rows.push({ engine: "kreuzberg", tier: "-", config: "default", page: item.page, dpi: item.dpi, ms, outPath, ...metric });
      console.log(JSON.stringify(rows.at(-1)));
    }
  } finally {
    client.stop();
  }
  return rows;
}

function summarize(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.engine}|${row.tier}|${row.config}|dpi${row.dpi}`;
    const curr = groups.get(key) ?? {
      key,
      engine: row.engine,
      tier: row.tier,
      config: row.config,
      dpi: row.dpi,
      chars: 0,
      cjk: 0,
      latin: 0,
      lines: 0,
      score: 0,
      ms: 0,
      phraseHits: new Set(),
      pages: 0,
    };
    curr.chars += row.chars;
    curr.cjk += row.cjk;
    curr.latin += row.latin;
    curr.lines += row.lines;
    curr.score += row.score;
    curr.ms += row.ms;
    curr.pages += 1;
    for (const phrase of row.phraseHits) curr.phraseHits.add(phrase);
    groups.set(key, curr);
  }
  return [...groups.values()]
    .map((item) => ({ ...item, phraseHits: [...item.phraseHits] }))
    .sort((a, b) => b.score - a.score);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  console.error(`PDF: ${args.pdf}`);
  console.error(`Pages: ${args.pages.join(", ")} | DPI: ${args.dpis.join(", ")} | tiers: ${args.tiers.join(", ")} | configs: ${args.configs.join(", ")}`);
  const rendered = await renderPages(args.pdf, args.pages, args.dpis);
  console.error(`Rendered ${rendered.length} images into ${OUT_DIR}`);
  const rows = [
    ...(await runPaddleSuite(rendered, args.tiers, args.configs)),
    ...(args.includeKreuzberg ? await runKreuzbergSuite(rendered) : []),
  ];
  const summary = summarize(rows);
  const summaryPath = join(OUT_DIR, "summary.json");
  await writeFile(summaryPath, JSON.stringify({ source: basename(args.pdf), rows, summary }, null, 2), "utf8");
  console.error(`Summary: ${summaryPath}`);
  console.error("Top groups:");
  for (const group of summary.slice(0, 10)) {
    console.error(`${group.key} chars=${group.chars} cjk=${group.cjk} lines=${group.lines} phrases=${group.phraseHits.length} score=${group.score.toFixed(1)} ms=${group.ms}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
