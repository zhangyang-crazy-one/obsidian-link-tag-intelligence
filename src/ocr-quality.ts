export type PdfTextQualityReport = {
  usable: boolean;
  reason: "empty" | "too-short" | "too-few-meaningful-chars" | "ok";
  trimmedChars: number;
  meaningfulChars: number;
  requiredChars: number;
  requiredMeaningfulChars: number;
  pageCount: number;
};

function countMeaningfulPdfChars(text: string): number {
  let count = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isMeaningful =
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5A) ||
      (code >= 0x61 && code <= 0x7A) ||
      (code >= 0x3400 && code <= 0x9FFF) ||
      (code >= 0xFF10 && code <= 0xFF19) ||
      (code >= 0xFF21 && code <= 0xFF3A) ||
      (code >= 0xFF41 && code <= 0xFF5A);
    if (isMeaningful) count++;
  }
  return count;
}

export function assessPdfTextExtraction(text: string, pageCount: number): PdfTextQualityReport {
  const pages = Math.max(1, Math.floor(Number.isFinite(pageCount) ? pageCount : 1));
  const trimmed = text.trim();
  const trimmedChars = trimmed.length;
  const meaningfulChars = countMeaningfulPdfChars(trimmed);
  const requiredChars = pages <= 2 ? 120 : Math.max(500, pages * 80);
  const requiredMeaningfulChars = pages <= 2 ? 60 : Math.max(250, pages * 40);

  if (trimmedChars === 0) {
    return { usable: false, reason: "empty", trimmedChars, meaningfulChars, requiredChars, requiredMeaningfulChars, pageCount: pages };
  }
  if (trimmedChars < requiredChars) {
    return { usable: false, reason: "too-short", trimmedChars, meaningfulChars, requiredChars, requiredMeaningfulChars, pageCount: pages };
  }
  if (meaningfulChars < requiredMeaningfulChars) {
    return { usable: false, reason: "too-few-meaningful-chars", trimmedChars, meaningfulChars, requiredChars, requiredMeaningfulChars, pageCount: pages };
  }
  return { usable: true, reason: "ok", trimmedChars, meaningfulChars, requiredChars, requiredMeaningfulChars, pageCount: pages };
}
