---
name: bug-debug
version: 1.0.0
description: |
  问题排查调试指南 (Tauri/Rust/React)。

  触发场景：
  - 排查代码错误
  - 调试运行问题
  - 分析崩溃原因
  - 性能问题定位

  触发词：Bug、报错、错误、异常、调试、排查、问题、崩溃、performance、慢、tauri、rust
---

# 问题排查调试指南

> 本项目: Pixel-Client Tauri 迁移 (Rust + React)

## 常见问题分类

### 1. Tauri/Rust 相关问题

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 应用无法启动 | Rust 编译错误 | `cargo check` 检查编译错误 |
| IPC 调用失败 | 命令未注册 | 检查 `invoke_handler` |
| 状态广播失败 | 窗口未获取 | 使用 `app.get_webview_window()` |
| 打包后崩溃 | 资源路径错误 | 检查 `get_resource_path` |
| 权限被拒 | capability 未配置 | 检查 `capabilities/default.json` |

### 2. React 前端问题

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 组件不渲染 | 状态未更新 | 检查 useEffect 依赖 |
| hooks 警告 | 规则违反 | 检查 hooks 规则 |
| 类型错误 | TypeScript 配置 | 检查 tsconfig |
| 性能问题 | 过多重渲染 | 使用 useMemo/useCallback |
| Tauri API 未定义 | 未正确导入 | 检查 `@tauri-apps/api` 导入 |

### 3. Rust 编译问题

```bash
# 检查编译错误
cd src-tauri
cargo check

# 详细编译输出
cargo build --verbose

# 清理并重新构建
cargo clean
cargo build

# 更新依赖
cargo update
```

### 4. 类型同步问题

```bash
# 生成 TypeScript 绑定
cargo test

# 检查 bindings.ts 是否更新
git diff src/types/bindings.ts

# 强制重新生成
cargo test -- --nocapture
```

## 调试技巧

### 1. Rust 调试

```rust
// 在 Rust 代码中添加日志
tauri::Builder::default()
    .setup(|app| {
        println!("[Tauri] App started");
        Ok(())
    })
```

### 2. 前端调试

```typescript
// 在 React 代码中添加调试日志
console.log('[Tauri] State:', state);
console.log('[Tauri] Config:', config);

// 使用 Tauri 日志
import { getCurrentWindow } from '@tauri-apps/api/window';
const window = getCurrentWindow();
window.emit('log', { level: 'debug', message: '...' });
```

### 3. IPC 通信调试

```typescript
// 调试 invoke 调用
try {
  const result = await invokeRust('get_config');
  console.log('[IPC] Success:', result);
} catch (error) {
  console.error('[IPC] Error:', error);
}

// 调试事件监听
listen<string>('chat_chunk', (event) => {
  console.log('[Event] Received chunk:', event.payload);
});
```

### 4. 日志文件位置

| 环境 | 日志路径 |
|------|----------|
| 开发 (stdout) | 终端输出 |
| 打包 (Windows) | `%APPDATA%\Pixel Client\logs\` |
| 打包 (macOS) | `~/Library/Application Support/Pixel Client/logs/` |
| 打包 (Linux) | `~/.config/Pixel Client/logs/` |

### 5. Chrome DevTools 调试

```bash
# 启动开发模式并打开 DevTools
npm run dev

# 或手动启用
# 在前端代码中添加
import { getCurrentWindow } from '@tauri-apps/api/window';
const window = getCurrentWindow();
window.openDevTools();
```

## 常见错误排查

### 错误：Command not found

```bash
# 错误信息: "Command not found: get_config"

# 解决方案：
# 1. 检查命令是否在 invoke_handler 中注册
# 2. 检查命令是否使用 #[tauri::command] 宏
# 3. 检查命令名称是否与调用端匹配
```

### 错误：State not found

```bash
# 错误信息: "State not found"

# 解决方案：
# 1. 检查是否使用 .manage(shared_state) 注册状态
# 2. 检查命令签名中是否正确使用 State<'_, SharedState>
```

### 错误：Bincode serialization failed

```rust
// 错误信息: "bincode error"

// 解决方案：
// 1. 确保所有类型实现 Serialize/Deserialize
// 2. 检查是否有循环引用
// 3. 使用 #[derive(Serialize, Deserialize)]
```

### 错误：Zstd decompression failed

```rust
// 错误信息: "zstd error"

// 解决方案：
// 1. 检查压缩数据是否完整
// 2. 验证文件路径是否正确
// 3. 处理文件不存在的边界情况
```

## 性能问题排查

### Rust 端性能

```bash
# 启用 release 模式构建
cargo build --release

# 检查性能热点
cargo flamegraph

# 内存分析
cargo bench
```

### 前端性能

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 内存泄漏 | 未清理监听器 | useEffect 返回清理函数 |
| 卡顿 | 大文件渲染 | 使用虚拟滚动 |
| 启动慢 | 过多同步操作 | 延迟加载非关键模块 |
| IPC 频繁 | 未使用批处理 | 实现 50ms 窗口批处理 |

## 代码审查清单

在提交代码前检查：

- [ ] 所有 console.log 是否有必要
- [ ] Rust 代码是否处理了 Result/Option
- [ ] 是否正确处理了异步错误
- [ ] 是否避免了内存泄漏
- [ ] 是否有性能瓶颈
- [ ] 是否有未处理的边界情况
- [ ] ts-rs 类型是否同步更新

## 日志规范

```rust
// Rust 日志格式
eprintln!("[ERROR] Failed to save state: {}", error);

// TypeScript 日志格式
const logger = {
  info: (msg: string, data?: any) =>
    console.log(`[INFO] ${msg}`, data || ''),
  error: (msg: string, error?: any) =>
    console.error(`[ERROR] ${msg}`, error || ''),
  warn: (msg: string, data?: any) =>
    console.warn(`[WARN] ${msg}`, data || '')
};
```

## 参考文档

- [Tauri 调试指南](https://tauri.app/v2/guides/debugging/)
- [Rust 调试](https://doc.rust-lang.org/book/ch01-03-hello-cargo.html)
- [React DevTools](https://react.dev/learn/react-developer-tools)
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)

## 检查清单

- [ ] 是否提供了足够的错误上下文
- [ ] 是否区分了错误级别
- [ ] 是否避免了敏感信息泄露
- [ ] 是否有性能监控
- [ ] Rust Result 是否正确处理
- [ ] 前端是否正确处理 IPC 错误
