# Phase 1: Audio Capture & UI Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 1 - Audio Capture & UI Foundation
**Areas discussed:** 录音状态与错误处理, 按钮外观与VU表, 键盘快捷键设计, 设置面板布局

---

## 录音状态与错误处理

| Option | Description | Selected |
|--------|-------------|----------|
| 5 状态 + 独立 error 状态 | idle → initializing → recording → processing → idle + error as 5th blocking state | ✓ |
| 4 状态 + error 覆盖层 | Error as non-blocking overlay, auto-recovery attempt | |
| 简化 4 状态，Claude 决定 | idle / recording / processing / error, implementation decides transitions | |

**User's choice:** 5-state model with independent error state
**Notes:** Error blocks operation until user confirms recovery.

| Option | Description | Selected |
|--------|-------------|----------|
| 按钮红标 + Notice | Button turns red error icon + Obsidian Notice popup | ✓ |
| 按钮红标 + 对话框 | Button red + click opens error recovery dialog | |
| 三层联动反馈 | Button + Notice + status bar | |

**User's choice:** Button red indicator + Notice
**Notes:** Notice shows specific Chinese error messages with actionable fix instructions.

| Option | Description | Selected |
|--------|-------------|----------|
| 自动检测并停止 | Auto-detect device list changes, stop recording, notify | ✓ |
| 重连 + 手动停止 | Retry reconnect for 5s of silence, user can manually stop | |

**User's choice:** Auto-detect and stop immediately

---

## 按钮外观与VU表

| Option | Description | Selected |
|--------|-------------|----------|
| 工具栏最右侧 | Rightmost position, independent from existing buttons | ✓ |
| 工具栏最左侧 | Leftmost position | |

**User's choice:** Toolbar rightmost

| Option | Description | Selected |
|--------|-------------|----------|
| 5段条 + 数值 | 5-bar level + dB numeric value | ✓ |
| 3段彩色条 | 3-bar green/yellow/red inside button | |
| pulsing 光环 | Pulsing ring around button | |

**User's choice:** 5-bar + dB numeric value

| Option | Description | Selected |
|--------|-------------|----------|
| Obsidian 内置 mic icon | Use built-in 'mic' icon for consistency | ✓ |
| 自定义 SVG icon | Custom SVG for finer control | |

**User's choice:** Obsidian built-in mic icon

| Option | Description | Selected |
|--------|-------------|----------|
| 边框呼吸 + 变色 | Border pulsing + icon color change, transparent bg | ✓ |
| 红底 + 呼吸动画 | Red background + pulsing animation | |

**User's choice:** Border pulsing + icon color change

---

## 键盘快捷键设计

| Option | Description | Selected |
|--------|-------------|----------|
| 单键 toggle | Same shortcut starts and stops | ✓ |
| 独立 start + stop | Two separate commands | |

**User's choice:** Single toggle

| Option | Description | Selected |
|--------|-------------|----------|
| Ctrl+Shift+V | Voice, unlikely to conflict | ✓ |
| Ctrl+Shift+D | Dictate | |
| Ctrl+Shift+Space | Similar to IME switching | |

**User's choice:** Ctrl+Shift+V

| Option | Description | Selected |
|--------|-------------|----------|
| 仅编辑器焦点时有效 | Only when Markdown editor focused | ✓ |
| 全局有效 | Global, any UI | |

**User's choice:** Editor focus only

| Option | Description | Selected |
|--------|-------------|----------|
| 警告不覆盖 | Log warning, don't override | ✓ |
| 自动备选 | Auto-pick alternative shortcut | |

**User's choice:** Log warning, don't override

---

## 设置面板布局

| Option | Description | Selected |
|--------|-------------|----------|
| 新增独立语音 section | New "语音 / Voice" section at top | ✓ |
| 穿插在现有 section | Mix into existing sections | |

**User's choice:** Independent voice section

| Option | Description | Selected |
|--------|-------------|----------|
| 输入框 + 浏览按钮 | Text input + Browse button (system picker) | ✓ |
| 纯输入框 + placeholder | Plain text input with path hint | |

**User's choice:** Input + Browse button

| Option | Description | Selected |
|--------|-------------|----------|
| 按依赖排序 | Model → Language → VAD → Timeout | ✓ |
| 按使用频率 | By modification frequency | |

**User's choice:** Dependency order

| Option | Description | Selected |
|--------|-------------|----------|
| 默认中等 (2)，0-3 | Default 2, range 0-3 | ✓ |
| 默认较低 (1)，1-5 | Default 1, range 1-5 | |

**User's choice:** VAD default 2, 0-3 range

| Option | Description | Selected |
|--------|-------------|----------|
| 默认60s，10-300s | Default 60, range 10-300 | ✓ |
| 默认30s，5-120s | Default 30, range 5-120 | |

**User's choice:** Auto-stop default 60s, range 10-300s

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown 下拉 | Select dropdown | ✓ |
| Radio 单选 | Radio buttons | |

**User's choice:** Language as dropdown

---

## Claude's Discretion

- VU meter color threshold values (green/yellow/red dB ranges)
- CSS animation timing and keyframe details
- AudioWorklet Blob URL CSP workaround implementation
- Settings section description text copy
- Toolbar button tooltip wording
