#!/usr/bin/env node
import { readFile } from "node:fs/promises";

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
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

function lcsLength(a, b) {
  const m = b.length;
  let prev = new Array(m + 1).fill(0);
  let curr = new Array(m + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const ca = a.charCodeAt(i - 1);
    curr[0] = 0;
    for (let j = 1; j <= m; j++) {
      curr[j] = ca === b.charCodeAt(j - 1)
        ? prev[j - 1] + 1
        : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

const [truthPath, ocrPath] = process.argv.slice(2);
if (!truthPath || !ocrPath) {
  console.error("Usage: node scripts/score-ocr-text.mjs <ground-truth.txt> <ocr-output.txt>");
  process.exit(2);
}

const truthRaw = await readFile(truthPath, "utf8");
const ocrRaw = await readFile(ocrPath, "utf8");
const truth = normalizeForScore(truthRaw);
const ocr = normalizeForScore(ocrRaw);
const distance = levenshtein(truth, ocr);
const cer = truth.length === 0 ? 0 : distance / truth.length;
const accuracy = Math.max(0, 1 - cer);
const lcs = lcsLength(truth, ocr);
const recall = truth.length === 0 ? 0 : lcs / truth.length;
const precision = ocr.length === 0 ? 0 : lcs / ocr.length;

console.log(JSON.stringify({
  truthChars: truth.length,
  ocrChars: ocr.length,
  distance,
  cer: Number(cer.toFixed(4)),
  accuracy: Number(accuracy.toFixed(4)),
  lcs,
  recall: Number(recall.toFixed(4)),
  precision: Number(precision.toFixed(4)),
}, null, 2));
