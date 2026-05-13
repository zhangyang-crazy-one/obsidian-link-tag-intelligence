import { describe, expect, it } from "vitest";

import { SentenceManager } from "../src/main";

const createPlugin = (lang: "zh" | "en" = "zh") =>
  ({
    settings: { speechLanguage: lang },
  }) as any;

describe("SentenceManager", () => {
  describe("addPartialText", () => {
    it("accumulates multiple partial text calls", () => {
      const mgr = new SentenceManager(createPlugin());
      mgr.addPartialText("你好");
      mgr.addPartialText("世界");
      expect(mgr.getPartialText()).toBe("你好世界");
    });

    it("starts with empty buffer", () => {
      const mgr = new SentenceManager(createPlugin());
      expect(mgr.getPartialText()).toBe("");
    });
  });

  describe("finalizeSentence", () => {
    it("returns sentence and resets buffer when sentence already has punctuation (。)", () => {
      const mgr = new SentenceManager(createPlugin("zh"));
      mgr.addPartialText("你好世界。");
      const result = mgr.finalizeSentence();
      expect(result).toBe("你好世界。");
      expect(mgr.getPartialText()).toBe("");
    });

    it("appends 。 when Chinese sentence has no punctuation", () => {
      const mgr = new SentenceManager(createPlugin("zh"));
      mgr.addPartialText("你好世界");
      const result = mgr.finalizeSentence();
      expect(result).toBe("你好世界。");
      expect(mgr.getPartialText()).toBe("");
    });

    it("appends . when English sentence has no punctuation", () => {
      const mgr = new SentenceManager(createPlugin("en"));
      mgr.addPartialText("Hello world");
      const result = mgr.finalizeSentence();
      expect(result).toBe("Hello world.");
      expect(mgr.getPartialText()).toBe("");
    });

    it("preserves existing English punctuation", () => {
      const mgr = new SentenceManager(createPlugin("en"));
      mgr.addPartialText("Hello world.");
      const result = mgr.finalizeSentence();
      expect(result).toBe("Hello world.");
      expect(mgr.getPartialText()).toBe("");
    });

    it("preserves existing Chinese question mark ？", () => {
      const mgr = new SentenceManager(createPlugin("zh"));
      mgr.addPartialText("真的吗？");
      const result = mgr.finalizeSentence();
      expect(result).toBe("真的吗？");
      expect(mgr.getPartialText()).toBe("");
    });

    it("preserves existing exclamation mark ！", () => {
      const mgr = new SentenceManager(createPlugin("zh"));
      mgr.addPartialText("太好了！");
      const result = mgr.finalizeSentence();
      expect(result).toBe("太好了！");
    });

    it("preserves existing English question mark", () => {
      const mgr = new SentenceManager(createPlugin("en"));
      mgr.addPartialText("Is that true?");
      const result = mgr.finalizeSentence();
      expect(result).toBe("Is that true?");
    });

    it("returns empty string when buffer is empty after trim", () => {
      const mgr = new SentenceManager(createPlugin());
      const result = mgr.finalizeSentence();
      expect(result).toBe("");
    });

    it("accepts explicit text parameter overriding buffer", () => {
      const mgr = new SentenceManager(createPlugin("zh"));
      mgr.addPartialText("partial");
      const result = mgr.finalizeSentence("你好世界");
      expect(result).toBe("你好世界。");
      expect(mgr.getPartialText()).toBe("");
    });
  });

  describe("reset", () => {
    it("clears the internal buffer", () => {
      const mgr = new SentenceManager(createPlugin());
      mgr.addPartialText("some text");
      mgr.reset();
      expect(mgr.getPartialText()).toBe("");
    });
  });

  describe("SENTENCE_END_PUNCTUATION", () => {
    it("recognizes all Chinese and English sentence-ending punctuation", () => {
      // This is implicitly tested by the finalizeSentence tests above.
      // The key punctuation marks: 。！？.!?
      const mgrZh = new SentenceManager(createPlugin("zh"));
      const mgrEn = new SentenceManager(createPlugin("en"));

      // All these should pass through unchanged
      mgrZh.addPartialText("句子。");
      expect(mgrZh.finalizeSentence()).toBe("句子。");

      mgrZh.addPartialText("好的！");
      expect(mgrZh.finalizeSentence()).toBe("好的！");

      mgrZh.addPartialText("真的？");
      expect(mgrZh.finalizeSentence()).toBe("真的？");

      mgrEn.addPartialText("Sentence.");
      expect(mgrEn.finalizeSentence()).toBe("Sentence.");

      mgrEn.addPartialText("Great!");
      expect(mgrEn.finalizeSentence()).toBe("Great!");

      mgrEn.addPartialText("Really?");
      expect(mgrEn.finalizeSentence()).toBe("Really?");
    });
  });
});
