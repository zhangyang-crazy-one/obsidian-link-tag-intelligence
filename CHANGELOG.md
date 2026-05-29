# Changelog / 更新日志

All notable changes to this project will be documented in this file.
本项目的所有重要更新都会记录在此文件中。

---

## [0.2.8] - 2026-05-29

### Added / 新特性
- **Self-Contained Punctuation Bypass for SenseVoice / SenseVoice 智能免除冗余标点模型**:
  - Implemented smart conditional branches in both the main process and the background ASR worker to skip downloading, verifying, and initializing the 280MB CT-transformer punctuation model when SenseVoice is active (which natively yields high-quality punctuation).
  - Saves approximately 280MB of active runtime memory and accelerates worker process initialization time to near-zero (instantaneous startup).
  - 引入前后端双侧条件分支，当使用自带标点的 SenseVoice 语音模型时，完全跳过外置 280MB 标点模型 (`punc-zh-2024`) 的自检、下载、加载与推理逻辑。
  - 大幅提升了后台语音工作进程的初始化启动速度（实现接近 0ms 瞬间秒开），并节省了约 280MB 的白白消耗的运行内存。

### Fixed / 修复与优化
- **SenseVoice Model Archive Filename / 修复 SenseVoice 模型自动下载 404 错误**:
  - Corrected a typo in the download package name from `sense-voice-small-...` to `sherpa-onnx-sense-voice-...` matching the actual release asset in sherpa-onnx releases, resolving the automated download failure.
  - 修正了 SenseVoice 自动下载流中的压缩包文件名拼写错误，对应官方发布资产文件名，解决首次启用自动下载时报 404 错误的问题。

---

## [0.2.7] - 2026-05-28

### Added / 新特性
- **Custom-Rendered Selection Dropdown / 全新 CSS 高颜值自定义下拉菜单**:
  - Replaced the native HTML select element in the sidebar ASR view with an elegant, absolute-positioned custom dropdown menu popup.
  - Features custom Vercel-like animations, rounded corners, clean border-radii, and dynamic, stroke-color-inheriting SVG chevrons (`stroke="currentColor"`) that automatically align with light and dark themes.
  - 将侧边栏原本的原生 select 下拉菜单彻底替换为纯 CSS 自定义的高颜值绝对定位悬浮菜单组件。
  - 支持 Vercel 式精致阴影、平滑淡入动效、自定义圆角、以及动态继承主色调（使用 `stroke="currentColor"`）的悬浮高亮与激活状态，彻底告别各操作系统原生 option 选项框的简陋外观。

### Fixed / 修复与优化
- **Current Note Card Squeezing & Height Collapsing / 修复当前笔记卡片重叠与文字高度塌陷**:
  - Restructured the current note card and item headers to vertical block flow positioning, ensuring note title buttons wrap naturally over multiple lines without text overlapping.
  - Placed the file path neatly below the title using a dashed line separator and spacious padding.
  - 将当前笔记卡片及标题头部容器重构为标准垂直块级流式布局，完美支持长标题自然多行折行并计算出真实高度，彻底解决路径与标题文本重叠塌陷的 Bug。
- **Rotated Chevron bullet indicator Clutter / 修复旋转箭头与圆点重叠杂乱**:
  - Suppressed all list-item or menu pseudo-element indicator bullets on collapsible header toggles to keep layouts clean and professional.
  - 对折叠菜单的 toggle 及其旋转箭头元素强制屏蔽了所有可能被外部主题样式继承注入的 `::before` / `::after` 伪元素小圆点，彻底解决 `●v` 重叠的视觉污染。

---

## [0.2.6] - 2026-05-28

### Added / 新特性
- **Near-Real-Time Transcription Support / 支持更实时的语音输出**:
  - Decreased the minimum limit of the max segment duration setting from 5 seconds to **1 second**.
  - Allows sentences to be finalized and inserted into the editor almost in real-time (every 1-2 seconds) while keeping punctuation restoration active.
  - 将单句最大分段时长的下限从 5 秒调低至 **1 秒**。
  - 支持说话时以极短的间隔（例如 1-2 秒）快速向编辑器插入已断句并进行标点还原后的文字，实现更加实时的文字上屏效果。

---

## [0.2.5] - 2026-05-28

### Added / 新特性
- **ASR Max Segment Duration Configuration / 语音最大单句分段时长配置**:
  - Replaced the hardcoded 20-second segment limit with a beautiful, customizable slider in Settings → Voice.
  - Allows users to control how long they can speak continuously before the speech engine forces a sentence boundary and outputs the punctuation-restored transcription. Range: 5 to 60 seconds.
  - 将原本硬编码的 20 秒单句断句时长限制，重构为在“设置 → 语音”中可配的美观滑动条。
  - 用户可以自由调节连续说话的最长分句间隔时长，超时即强制断句并追加标点预测输出。范围支持 5 至 60 秒。

---

## [0.2.4] - 2026-05-28

### Fixed / 修复与优化
- **ASR Worker Spawn & Restart Race Condition / 修复语音识别启停竞态死锁**:
  - Resolved a race condition where stopping and immediately restarting voice recording caused the previous worker process's termination exit event to corrupt the new process's initialization state.
  - Implemented process identity checks in child event listeners to prevent cross-process state leakage.
  - 修复了在录音结束并立即重新启动时，上一个后台 Worker 进程的退出事件与新启动进程的初始化状态发生竞态冲突，导致初始化卡死或报错的 Bug。
  - 在子进程事件监听中引入了进程实例身份校验，防止跨进程状态泄露。

---

## [0.2.3] - 2026-05-28

### Added / 新特性
- **Offline Chinese Punctuation Restoration / 离线中文标点恢复**:
  - Integrated Alibaba's `ct-punc` transformer model inside the background ASR process.
  - Automatically predicts and restores punctuation marks (commas, periods, question marks) at sentence endpoints.
  - Runs 100% inside the background worker thread, ensuring strictly 0% Main Thread (UI thread) CPU overhead.
  - 在后台 ASR 进程中集成了阿里 `ct-punc` 标点还原模型，自动预测并添加标点符号，且 100% 运行在后台 Worker 进程中，主线程（UI 线程）CPU 开销保持为 0%。
- **Dynamic ASR Search Method Selection / 语音搜索解码方式切换**:
  - Added a dropdown selector under Settings → Voice to switch between **Greedy Search** (Fast, standard) and **Modified Beam Search** (Supports hotwords biasing).
  - Users can now switch back to Greedy Search to ensure standard recognition when hotwords biasing fails to match.
  - 在“设置 → 语音”中新增了解码方式切换菜单，支持在 **Greedy Search (快速、标准)** 和 **Modified Beam Search (支持热词文件纠偏)** 之间动态切换，避免因热词未匹配导致的不识别问题。
- **Windows Unicode Path Compatibility / Windows 中文用户名路径兼容性**:
  - Refactored ASR child process spawning, model paths, and hotwords file paths to use 100% relative and ASCII-only paths.
  - Bypasses `cmd.exe` codepage issues and native C++ file stream opening errors on Windows with Chinese usernames (e.g. `C:\Users\张三\`).
  - 重构了子进程启动及所有传递给底层 C++ 引擎的路径（模型、热词等），全部改用 ASCII 相对路径，彻底解决 Windows 系统下因中文用户名路径导致的初始化崩溃或无法加载文件的问题。

### Fixed / 修复与优化
- **Persistent Model Cache on Build / 编译打包模型本地持久化缓存**:
  - Restructured `esbuild.config.mjs` to download and extract models directly into a project-level persistent directory.
  - Reduces subsequent build times from over a minute to less than 1 second.
  - 重构了编译脚本，下载的模型直接解压并在本地持久化缓存，每次编译不再重复下载上百兆的模型，编译打包耗时从 1 分钟以上缩短至 1 秒内。
