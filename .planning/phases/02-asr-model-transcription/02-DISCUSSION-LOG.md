# Phase 2: ASR Model & Transcription - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 2 - ASR Model & Transcription
**Areas discussed:** ASR 模型集成与初始化, 文字转录与编辑器插入, 语言切换与自动停止, 模型下载引导流程

---

## ASR 模型集成与初始化

| Option | Description | Selected |
|--------|-------------|----------|
| 首次使用时懒加载 | Create Worker+WASM on first toggle (~2-5s delay) | ✓ |
| onload 时预加载 | Pre-create during plugin load | |
| 点击时加载+状态提示 | Create on click, show loading progress | |

**User's choice:** Lazy load on first use

| Option | Description | Selected |
|--------|-------------|----------|
| SpeechRecorder 管理 Worker | SpeechRecorder owns Worker lifecycle | ✓ |
| main.ts 直接管理 | main.ts manages Worker directly | |

**User's choice:** SpeechRecorder manages Worker

| Option | Description | Selected |
|--------|-------------|----------|
| 插件目录内加载 | Copy/link model into plugin dir, relative path | ✓ |
| Node fs 读取 | Worker uses desktopRequire for fs | |

**User's choice:** Model in plugin directory

| Option | Description | Selected |
|--------|-------------|----------|
| 红色按钮 + Notice | Red button + Notice + debug log | ✓ |
| 引导对话框 | Dialog with causes and fixes | |

**User's choice:** Red button + Notice

| Option | Description | Selected |
|--------|-------------|----------|
| sherpa-onnx WASM (npm) | Pure WASM, cross-platform | ✓ |
| sherpa-onnx-node (原生) | Native addon, multi-threaded | |

**User's choice:** WASM npm package

| Option | Description | Selected |
|--------|-------------|----------|
| SharedArrayBuffer | Zero-copy, needs COOP/COEP | ✓ |
| postMessage(chunk) | Standard postMessage | |

**User's choice:** SharedArrayBuffer

---

## 文字转录与编辑器插入

| Option | Description | Selected |
|--------|-------------|----------|
| 静默 + 标点 | 800ms silence + 。！？ hard cut | ✓ |
| 纯静默 800ms | Silence only | |
| 纯标点检测 | Punctuation only | |

**User's choice:** Silence + punctuation

| Option | Description | Selected |
|--------|-------------|----------|
| 逐句插入 + 自动空格 | replaceSelection(text + " "), sentence by sentence | ✓ |
| 逐句 replaceSelection | Sentence at a time | |
| buffer 后批量插入 | Buffer until paragraph end | |

**User's choice:** Sentence-by-sentence + auto space

| Option | Description | Selected |
|--------|-------------|----------|
| 保存+恢复光标 | Save cursor before insert, restore after | ✓ |
| 插入到当前光标 | Insert at wherever cursor is now | |
| 锁定编辑器 | Lock input during recording | |

**User's choice:** Save + restore cursor

| Option | Description | Selected |
|--------|-------------|----------|
| 后处理添加标点 | Post-process add punctuation | ✓ |
| 使用模型自带标点 | Model's built-in punctuation | |

**User's choice:** Post-processing

---

## 语言切换与自动停止

| Option | Description | Selected |
|--------|-------------|----------|
| 销毁+重建 | Destroy + rebuild Recognizer (~3-5s) | ✓ |
| 双实例切换 | Keep both instances, route switch | |

**User's choice:** Destroy + rebuild

| Option | Description | Selected |
|--------|-------------|----------|
| 使用模型内置 VAD | sherpa-onnx built-in VAD | ✓ |
| 自定义双 VAD | Custom RMS + ASR VAD | |

**User's choice:** Built-in VAD

| Option | Description | Selected |
|--------|-------------|----------|
| 按钮文字倒计时 | Button overlay countdown (e.g. "5s"), last second flashes | ✓ |
| Notice + 脉冲加速 | Notice + pulsing acceleration | |

**User's choice:** Button text countdown

| Option | Description | Selected |
|--------|-------------|----------|
| 仅设置面板 | Settings panel only | ✓ |
| 设置 + 快速切换 | Settings + long-press toolbar menu | |

**User's choice:** Settings panel only

---

## 模型下载引导流程

| Option | Description | Selected |
|--------|-------------|----------|
| HuggingFace | hf.co model repo | ✓ |
| GitHub Releases | k2-fsa/sherpa-onnx/releases | |
| 多镜像可选 | Multiple mirrors | |

**User's choice:** HuggingFace

| Option | Description | Selected |
|--------|-------------|----------|
| Notice 进度 | Obsidian Notice with percentage | ✓ |
| 下载对话框 | Dialog with progress bar, speed, ETA | |
| 仅提供链接 | Only provide download link | |

**User's choice:** Notice progress

| Option | Description | Selected |
|--------|-------------|----------|
| 自动 SHA256 校验 | Auto SHA256, retry on mismatch | ✓ |
| 只验文件大小 | Check file size only | |
| 不校验 | No verification | |

**User's choice:** Auto SHA256

| Option | Description | Selected |
|--------|-------------|----------|
| 自动重试3次 | Auto-retry 3 times, then show manual steps | ✓ |
| 立即显示手动链接 | Show manual link immediately | |

**User's choice:** Auto-retry 3 times

---

## Claude's Discretion

- SharedArrayBuffer buffer size and ring buffer strategy
- Web Worker code structure
- sha256 implementation
- Download retry backoff
- Recognizer configuration
- Chinese model: zipformer-zh-14M INT8
