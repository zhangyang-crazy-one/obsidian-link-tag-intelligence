# Greedy Search 中文识别优化方案

> notebook_id: 2e25a8f8-d70a-41b1-8966-f665935885f7
> conversation_id: 31aaece2-3dd9-4f3a-b50e-fd565e1fcd3a
> 日期: 2026-05-19

## 背景

modified_beam_search 存在幻觉 bug (GitHub #845, #3267)，必须使用 greedy_search。
greedy_search 不支持 hotwords 功能。需要通过其他方式提升识别准确率。

## 三轮 NotebookLM 查询结论

### 查询1: 核心优化技术

- **blank_penalty**: 推荐值 1.5-2.0，减少删除错误。值太大会在安静音频上产生插入错误
- **hotwords**: 仅支持 modified_beam_search，greedy_search 无法使用
- **temperature**: 对标准 streaming transducer 无效，仅用于 Whisper 等生成模型
- **endpoint 规则**: rule3 设为 300s(5分钟)以避免强制截断长句

### 查询2: 实现参数细节

- **blank_penalty 对 greedy_search 有效**: `logits[:, 0] -= blank_penalty`
- **dither=0.00003 是必须的**: 防止 log-mel filterbank 数值边界问题导致空输出
- **modelingUnit**: 不是调优参数，必须与模型训练时匹配（zh-2025 用 bpe）

### 查询3: 幻觉减少和后处理

- **VAD 预处理**: 300ms pre-speech padding ring buffer，防止噪音触发幻觉
- **HomophoneReplacer (FST)**: sherpa-onnx 内置，需要 lexicon.txt + replace.fst
- **PYGEC (拼音引导 LLM 纠错)**: 提取拼音 + 中文字符一起输入 LLM 纠错
- **FastCorrect**: 非自回归纠错模型，中文 50%+ 错误是同音字

## 可执行方案（按优先级）

### P0: 已实施
- [x] greedy_search + dither=0.00003
- [x] 端点纠错（CONFUSION_MAP）
- [x] BPE modelingUnit + bpeVocab
- [x] 激进 endpoint 规则（rule1=0.8s, rule2=0.3s）

### P1: 近期可实施
- [ ] **blank_penalty=1.5** 加入 greedy_search 配置（减少删除错误）
- [ ] VAD pre-speech padding (300ms ring buffer)

### P2: 中期优化
- [ ] HomophoneReplacer FST（Node.js WASM 可能崩溃，需验证）
- [ ] 扩展 CONFUSION_MAP 覆盖更多同音字

### P3: 长期方向
- [ ] PYGEC 拼音引导 LLM 纠错（延迟较高）
- [ ] FastCorrect 非自回归纠错模型

## 来源

- Deep research task: 3b021cd5-8033-4346-ae81-57981656aa8b (60 sources found, not imported)
- 18 sources cited in conversation queries
