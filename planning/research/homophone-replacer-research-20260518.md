## Deep Research: 中文 ASR 热词后处理方案

**日期**: 2026-05-18
**Notebook**: Sherpa-ONNX Chinese ASR Accuracy Optimization Research
**Notebook ID**: 2e25a8f8-d70a-41b1-8966-f665935885f7
**Start Task ID**: 415aacf4-fa47-4c86-ab5f-50b53c4ee665
**Completed Task ID**: 38b41824-c084-4aad-b7ce-7728c8b4e8e5 (drift)
**Conversation ID**: 330c51a9-0472-42e5-8efb-0c4444cf2ec8
**Sources**: 61 discovered, 61 imported (total notebook: 176)

### Q1: 框架 — 中文 ASR 后处理方案全貌

5 类方案：
1. **Edit-Distance 校正**: FastCorrect NAR 模型, 8-14% WERR, 需 GPU
2. **Pinyin 模糊匹配**: 83% 中文 ASR 错误是音素错误, 最适合
3. **LLM 校正**: 准确但延迟高, 不适用实时 streaming
4. **Aho-Corasick 自动机**: O(n+m+z), 极快, 但精确匹配对中文无效
5. **其他**: Chinese Spelling Check 序列标注、N-gram

### Q2: 细节 — Node.js 场景最佳方案

**结论: sherpa-onnx 内置 Homophone Replacer (拼音词组匹配替换)**

- sherpa-onnx v1.11.4 起在 Node.js API 中支持 (commits #2157 WASM, #2158 node-addon)
- 使用 FST (Finite State Transducer) 实现, 零延迟
- 工作原理: ASR 输出 → 拼音检查 → 匹配规则 → 自动替换
- 不需要 modified_beam_search (与 greedy_search 兼容)
- 测试文件: test_asr_streaming_transducer_with_hr.js

### Q3: API 参数

```javascript
hr: {
  lexicon: "/path/to/lexicon.txt",      // 通用汉字→拼音映射
  rule_fsts: "/path/to/replace.fst"     // 自定义替换规则 (FST 二进制)
}
// dict_dir: 遗留字段, 留空
```

### Q4: 文件格式

- **lexicon.txt**: 每行 `词汇 拼音1 拼音2 ...`, 从 GitHub hr-files release 下载
- **replace.fst**: pynini 生成, 格式 `pynini.cross("pinyin_with_tones", "target_chinese")`

### 实现计划

1. 下载通用 lexicon.txt → 放入 models/
2. Python 脚本: 对 hotwords.txt 每个词, 用 pypinyin 获取拼音 → pynini 生成 replace.fst
3. 修改 asr-worker.ts: createOnlineRecognizer 添加 hr 参数
4. 删除 JS 层 post-processing (已被 Homophone Replacer 替代)
