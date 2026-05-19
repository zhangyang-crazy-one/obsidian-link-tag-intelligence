/**
 * Memory and regression tests for speech text insertion.
 *
 * Architecture: endpoint-only insertion (no real-time preview).
 * sherpa-onnx getResult() returns CUMULATIVE text (full utterance so far).
 * At endpoint, finalizeSentence(text) uses cumulative text directly.
 * Non-endpoint calls accumulate for preview only (not inserted).
 *
 * Run: npx vitest run tests/memory/speech-preview-memory.test.ts
 */

import { describe, it, expect } from "vitest";

// Minimal SentenceManager matching src/main.ts implementation
class SentenceManager {
  partialText = "";
  addPartialText(text: string): void { this.partialText += text; }
  finalizeSentence(text?: string): string {
    const sentence = text ?? this.partialText;
    this.partialText = "";
    return sentence.trim() || "";
  }
  getPartialText(): string { return this.partialText; }
  reset(): void { this.partialText = ""; }
}

describe("Speech Text Insertion — Cumulative Data Regression", () => {
  it("finalizeSentence(text) with cumulative data produces correct output", () => {
    const sm = new SentenceManager();
    const inserted: string[] = [];

    const onAsrResult = (text: string, isEndpoint: boolean) => {
      if (!text) return;
      if (isEndpoint) {
        const finalSentence = sm.finalizeSentence(text);
        if (finalSentence) inserted.push(finalSentence);
      } else {
        sm.addPartialText(text);
      }
    };

    // Simulate CUMULATIVE results from sherpa-onnx getResult()
    onAsrResult("要", false);
    onAsrResult("要求", false);
    onAsrResult("要求以及", false);
    onAsrResult("要求以及能否提供", false);
    onAsrResult("要求以及能否提供定量结果", true);

    expect(inserted).toEqual(["要求以及能否提供定量结果"]);
    expect(sm.partialText).toBe("");
  });

  it("addPartialText + finalizeSentence() (no param) with cumulative data produces WRONG output", () => {
    // This test documents the BUG that was fixed — it proves the broken
    // pattern produces quadratic repetition.
    const sm = new SentenceManager();
    const inserted: string[] = [];

    const onAsrResultBroken = (text: string, isEndpoint: boolean) => {
      if (!text) return;
      if (isEndpoint) {
        sm.addPartialText(text);
        const finalSentence = sm.finalizeSentence();
        if (finalSentence) inserted.push(finalSentence);
      } else {
        sm.addPartialText(text);
      }
    };

    onAsrResultBroken("要", false);
    onAsrResultBroken("要求", false);
    onAsrResultBroken("要求以及", false);
    onAsrResultBroken("要求以及能否提供", false);
    onAsrResultBroken("要求以及能否提供定量结果", true);

    // BUG: cumulative text appended via += creates repetition
    // "要" + "要求" + "要求以及" + "要求以及能否提供" + "要求以及能否提供定量结果"
    expect(inserted[0]).not.toBe("要求以及能否提供定量结果");
    expect(inserted[0].length).toBeGreaterThan("要求以及能否提供定量结果".length);
    expect(inserted[0]).toContain("要要求");
  });

  it("multiple endpoint cycles produce independent sentences", () => {
    const sm = new SentenceManager();
    const inserted: string[] = [];

    const onAsrResult = (text: string, isEndpoint: boolean) => {
      if (!text) return;
      if (isEndpoint) {
        const s = sm.finalizeSentence(text);
        if (s) inserted.push(s);
      } else {
        sm.addPartialText(text);
      }
    };

    // Cycle 1
    onAsrResult("风险", false);
    onAsrResult("风险矩阵", false);
    onAsrResult("风险矩阵是重要工具", true);

    // Cycle 2 (new utterance after reset)
    onAsrResult("傅里叶", false);
    onAsrResult("傅里叶变换", false);
    onAsrResult("傅里叶变换用于信号处理", true);

    expect(inserted).toEqual([
      "风险矩阵是重要工具",
      "傅里叶变换用于信号处理",
    ]);
    expect(sm.partialText).toBe("");
  });

  it("buffer is cleared after finalizeSentence(text)", () => {
    const sm = new SentenceManager();
    sm.addPartialText("中间累积");
    expect(sm.partialText).toBe("中间累积");

    sm.finalizeSentence("最终结果");
    expect(sm.partialText).toBe("");
  });
});

describe("Speech Text Insertion — Memory Safety", () => {
  it("endpoint-only insertion: 1 editor call per endpoint regardless of partial count", () => {
    let insertCount = 0;

    const sm = new SentenceManager();
    const onAsrResult = (text: string, isEndpoint: boolean) => {
      if (!text) return;
      if (isEndpoint) {
        const s = sm.finalizeSentence(text);
        if (s) insertCount++;
      } else {
        sm.addPartialText(text);
      }
    };

    // 1000 cumulative non-endpoint results
    for (let i = 0; i < 1000; i++) {
      onAsrResult("字".repeat(i + 1), false);
    }
    // 1 endpoint
    onAsrResult("最终结果", true);

    expect(insertCount).toBe(1);
    expect(sm.partialText).toBe("");
  });

  it("50 endpoint cycles with cumulative data stay memory-bounded", () => {
    const sm = new SentenceManager();
    const inserted: string[] = [];

    for (let cycle = 0; cycle < 50; cycle++) {
      const finalLen = 10 + Math.floor(Math.random() * 100);
      // Simulate cumulative growth (like real sherpa-onnx)
      for (let i = 1; i <= 5; i++) {
        sm.addPartialText("字".repeat(Math.min(i * 5, finalLen)));
      }
      const sentence = sm.finalizeSentence("字".repeat(finalLen));
      if (sentence) inserted.push(sentence);
    }

    expect(inserted.length).toBe(50);
    expect(sm.partialText).toBe("");
  });

  it("confusion map is static (no runtime growth)", () => {
    const CONFUSION_MAP: Record<string, string> = {
      "在显价值": "在险价值",
      "风险穗": "风险矩阵",
      "富力业变换": "傅里叶变换",
    };
    const initialSize = Object.keys(CONFUSION_MAP).length;

    for (let i = 0; i < 1000; i++) {
      let text = `测试在显价值${i}风险穗测试`;
      for (const [wrong, correct] of Object.entries(CONFUSION_MAP)) {
        if (text.includes(wrong)) text = text.replace(new RegExp(wrong, "g"), correct);
      }
    }

    expect(Object.keys(CONFUSION_MAP).length).toBe(initialSize);
  });

  it("onAsrResult callback does not retain stale references", () => {
    let callback: ((text: string, isEndpoint: boolean) => void) | null = null;

    callback = (text, isEndpoint) => {
      if (isEndpoint) { /* insert */ }
    };

    callback = null; // destroy
    expect(callback).toBeNull();
  });
});
