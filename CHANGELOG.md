# Changelog / 更新日志

All notable changes to this project will be documented in this file.
本项目的所有重要更新都会记录在此文件中。

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
