# Obsidian Link Tag Intelligence — 语音转文字功能

## What This Is

在现有的 Obsidian Link Tag Intelligence 插件中新增**本地中文语音实时转文字**功能。用户通过快捷键或侧边栏按钮触发，语音被实时识别为文字，逐句插入当前打开笔记的光标位置。语音识别完全在本地运行，不依赖云服务，不引入除 Obsidian 和本插件之外的任何框架。

## Core Value

无需离开键盘即可通过语音将中文内容输入 Obsidian 笔记，本地运行保障隐私和离线可用。

## Requirements

### Validated

- ✓ 侧边栏面板视图 (`LinkTagIntelligenceView`) — 现有
- ✓ 标签管理和智能建议 — 现有
- ✓ 链接插入和引用解析 — 现有
- ✓ 研究源摄入（DOI/arXiv/PDF） — 现有
- ✓ CodeMirror 6 编辑器集成 — 现有
- ✓ 中英双语 i18n 系统 — 现有
- ✓ 插件设置系统 — 现有
- ✓ 调试日志系统 — 现有
- ✓ **SPEECH-01**: 用户可通过快捷键开始/停止语音识别 — Phase 1
- ✓ **SPEECH-02**: 侧边栏工具栏显示录音按钮，带有收音状态动画 — Phase 1
- ✓ **SPEECH-04**: 按钮显示录音状态（5 状态模型） — Phase 1
- ✓ **SPEECH-05**: VU 电平表（5 段 + dB 数值） — Phase 1
- ✓ **SPEECH-09**: 所有语音 UI 文本中英双语 — Phase 1
- ✓ **SPEECH-10**: 设置面板语音配置（模型路径/语言/VAD/超时） — Phase 1

### Active

- [ ] **SPEECH-03**: 识别到的中文语音文字逐句实时插入编辑器光标位置
- [ ] **SPEECH-06**: 用户可在中文和英文识别之间切换
- [ ] **SPEECH-07**: 语音识别完全本地运行，无网络请求
- [ ] **SPEECH-08**: 可配置的静音超时后自动停止识别
- [ ] **SPEECH-11**: 首次使用引导帮助用户下载模型文件

### Out of Scope

- 云端语音识别 API（百度/讯飞/阿里云等） — 用户要求本地运行
- 视频/音频文件转录 — 仅实时麦克风输入
- 多说话人分离（diarization） — v1 仅单人语音
- 移动端 Obsidian 支持 — 本地模型在移动端运行受限
- 独立的桌面应用或服务 — 不引入任何额外框架

## Context

**项目定位**：在现有 `obsidian-link-tag-intelligence` 插件（v0.1.38）中增加语音模块。插件已有成熟的架构：Plugin 核心类 → 领域模块 → UI 层（侧边栏/模态框/编辑器扩展）。

**技术环境**：
- 运行时：Obsidian Desktop（Electron + Node.js）
- 语言：TypeScript 5.8.2（strict mode）
- 构建：esbuild（platform: node, target: ES2021）
- 编辑器：CodeMirror 6
- 测试：Vitest 2.1.8

**现有架构要点**：
- 单 `LinkTagIntelligencePlugin` 类（`src/main.ts`, 1282 行）注册所有命令/事件/扩展
- 侧边栏 `LinkTagIntelligenceView`（`src/view.ts`, 1050 行）使用 snapshot-based 渲染
- 外部集成模块 `ingestion.ts`/`semantic.ts` 使用 `child_process.exec`（Electron desktopRequire）
- 所有用户字符串走 i18n 系统（`src/i18n.ts`, 1054 行，en + zh）
- CSS 使用 `lti-` 前缀 BEM 风格 + CSS 自定义属性

**语音模型约束**：
- 必须在 Electron 渲染进程或 Node 进程内运行
- 模型文件不宜过大（目标 < 200MB）
- 中文识别质量需优于 Web Speech API
- 延迟要求：逐句实时（< 2s 端到端延迟可接受）

## Constraints

- **无额外框架**：不引入独立的 Python 服务、Docker 容器、或任何外部进程
- **本地运行**：语音数据不离开用户设备
- **Obsidian 合规**：遵循 Obsidian 开发者政策（不混淆代码、不擅自联网）
- **性能**：语音识别不显著影响 Obsidian 编辑器响应（< 100ms 主线程阻塞）
- **兼容性**：与现有插件功能共存，不破坏现有特性
- **模型体积**：模型文件尽可能小，优先 < 200MB

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 识别模型方案 | 用户要求准确度高于 whisper 但资源占用与 Vosk 相近 — 需调研 | — 待调研 |
| 触发方式：快捷键为主 + 按钮为辅 | 用户偏好键盘操作，按钮作为视觉状态指示 | ✓ 已决定 |
| 按钮位置：侧边栏工具栏 | 与现有 lti-toolbar 风格统一 | ✓ 已决定 |
| 输入模式：逐句实时插入 | 延迟最低，体验最直接 | ✓ 已决定 |
| 视觉反馈：收音状态 + 音量指示 | 用户需要知道是否在收音和音频状态 | ✓ 已决定 |
| 语言：中英可切换 | 主要面向中文，但保留英文能力 | ✓ 已决定 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-13 after Phase 1 completion*
