# Requirements: Obsidian Link Tag Intelligence — 语音转文字

**Defined:** 2026-05-12
**Core Value:** 无需离开键盘即可通过语音将中文内容输入 Obsidian 笔记，本地运行保障隐私和离线可用。

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Speech Recognition

- [ ] **SPEECH-01**: 用户可通过键盘快捷键开始/停止语音识别（toggle 模式）
- [ ] **SPEECH-02**: 用户可通过侧边栏工具栏按钮开始/停止语音识别（与现有 lti-toolbar 风格统一）
- [ ] **SPEECH-03**: 识别的中文语音文字逐句实时插入编辑器光标位置
- [ ] **SPEECH-04**: 工具栏按钮显示录音状态（idle / initializing / recording / processing）
- [ ] **SPEECH-05**: 录音过程中显示音频电平指示器（VU meter）
- [ ] **SPEECH-06**: 用户可在中文和英文识别模式之间切换
- [ ] **SPEECH-07**: 语音识别完全本地运行（sherpa-onnx WASM，无网络请求）
- [ ] **SPEECH-08**: 可配置的静音超时后自动停止识别
- [ ] **SPEECH-09**: 所有语音相关 UI 文本支持中英双语

### Model & Settings

- [ ] **SPEECH-10**: 插件设置面板包含：模型路径、语言选择、VAD 灵敏度、自动停止超时
- [ ] **SPEECH-11**: 首次使用引导帮助用户下载模型文件

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

- **SPEECH-V2-01**: 录音文件保存和回放
- **SPEECH-V2-02**: 移动端 Obsidian 支持
- **SPEECH-V2-03**: 语音指令格式化（如"换行"、"加粗"）
- **SPEECH-V2-04**: 语音识别结果与现有标签/链接智能联动
- **SPEECH-V2-05**: 可选 LLM 后处理润色文本

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 语音格式化指令（"换行"、"加粗"等） | 本地模型误触发率过高；使用键盘格式化更可靠 |
| 音频文件保存与回放 | 隐私风险；vault 存储膨胀；文本转录已足够 |
| 云端 API 降级方案 | 破坏隐私/离线核心价值主张 |
| 多说话人分离（diarization） | 需不同模型架构（500MB+），个人笔记场景不需要 |
| 移动端 Obsidian 支持 | 本地模型在移动端性能受限；桌面端优先 |
| LLM 后处理润色 | 增加延迟 + 需额外模型或 API |
| 实时翻译（中英互译） | 叠加翻译模型会增加延迟和复杂度；语言切换已满足需求 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SPEECH-01 | — | Pending |
| SPEECH-02 | — | Pending |
| SPEECH-03 | — | Pending |
| SPEECH-04 | — | Pending |
| SPEECH-05 | — | Pending |
| SPEECH-06 | — | Pending |
| SPEECH-07 | — | Pending |
| SPEECH-08 | — | Pending |
| SPEECH-09 | — | Pending |
| SPEECH-10 | — | Pending |
| SPEECH-11 | — | Pending |

**Coverage:**
- v1 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11 ⚠️

---
*Requirements defined: 2026-05-12*
*Last updated: 2026-05-12 after initial definition*
