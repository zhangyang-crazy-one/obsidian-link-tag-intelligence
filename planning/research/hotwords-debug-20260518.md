## 调研日志: 热词加载报错排查

**日期**: 2026-05-18
**Notebook**: Sherpa-ONNX Chinese ASR Accuracy Optimization Research
**Notebook ID**: 2e25a8f8-d70a-41b1-8966-f665935885f7
**Conversation ID**: 30036441-9c27-4d29-a7c0-9daf5ac65e14

### Q1: 热词加载常见失败原因

- 热词仅在 `modified_beam_search` 下生效，`greedy_search` 完全不支持
- BPE 模型需提供 `bpe.vocab` + `modelingUnit=bpe`
- 热词格式: 每行一个自然词，BPE 自动编码，不需要手动分词
- 编码必须是 UTF-8
- 已知 bug: `modified_beam_search` 在静音时输出随机文字 (#845) / 20% 空输出 (#3267)

### Q2: 静默失败与调试

- **sherpa-onnx C++ API 对热词加载静默失败** — Python API 会抛 ValueError，但 Node.js API 不会
- **`debug: 1`** 可以启用内部调试日志输出到 stdout
- 当前 `asr-worker.ts` 中 `debug: 0` — 完全看不到热词加载状态
- 确认当前模型是 transducer（非 CTC），支持热词

### 结论

根因：`debug: 0` 导致热词加载错误被静默吞掉。需改为 `debug: 1` 并检查 stderr 输出。
