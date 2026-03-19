# TypeScript 代码规范

> 加载时机：SessionStart（会话开始时）
> 适用范围：Obsidian Link Tag Intelligence 项目

---

## 1. 类型定义

### 1.1 类型别名 vs 接口

| 使用 `type` | 使用 `interface` |
|-------------|------------------|
| 简单类型别名 | 对象类型定义 |
| 联合类型 | 可扩展的对象 |
| 元组类型 | 类实现 |

```typescript
// ✅ 推荐：使用 type 定义别名
type PluginSettings = {
  enabled: boolean;
  maxLinks: number;
};

type LinkDirection = 'forward' | 'backward' | 'both';

// ✅ 推荐：接口用于可扩展对象
interface MetadataCache {
  get(filePath: string): CacheItem | null;
}
```

### 1.2 空值处理

```typescript
// ✅ 使用可选链和空值合并
const name = obj?.property ?? 'default';
const value = arr?.[index];

// ✅ 类型守卫
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
```

---

## 2. 函数设计

### 2.1 函数类型

```typescript
// ✅ 类型别名
type Handler = (event: Event) => void;
type AsyncHandler = () => Promise<void>;

// ✅ 函数签名
interface Plugin {
  onLoad(): void;
  onunload(): void;
}
```

### 2.2 async/await

```typescript
// ✅ 优先使用 async/await
async function fetchData(): Promise<Data> {
  const response = await fetch(url);
  return response.json();
}

// ✅ 错误处理
try {
  await saveSettings();
} catch (error) {
  console.error('Failed to save:', error);
}
```

---

## 3. 类设计

### 3.1 命名规范

```typescript
// ✅ 类名：PascalCase
class LinkTagIntelligence { }
class MetadataCache { }

// ✅ 私有成员：camelCase 或 _prefix
class MyClass {
  private cache: Map<string, Item>;
  private _version: number;
}
```

### 3.2 访问修饰符

```typescript
class Plugin {
  // public: 默认，可省略
  public name: string;

  // protected: 子类可见
  protected app: App;

  // private: 仅本类可见
  private settings: PluginSettings;
}
```

---

## 4. Obsidian API 类型

### 4.1 常用类型

```typescript
import { App, TFile, TFolder, MetadataCache } from 'obsidian';

// 文件操作
function processFile(file: TFile): void {
  if (file.extension !== 'md') return;
  // ...
}

// MetadataCache
const cache = this.app.metadataCache.getCache(file.path);
```

### 4.2 CodeMirror 类型

```typescript
import { EditorView, StateEffect, StateField } from '@codemirror/state';
import { ViewPlugin, Decoration } from '@codemirror/view';

// 编辑器扩展
class MyExtension {
  readonly extension: StateField<State>;
}
```

---

## 5. 导入顺序

```typescript
// 1. Node.js 内置
import { promises as fs } from 'fs';
import path from 'path';

// 2. 第三方库
import { debounce } from 'lodash';

// 3. Obsidian API
import { App, Plugin, SettingTab } from 'obsidian';

// 4. 本地模块
import { LinkCache } from './cache';
import { DEFAULT_SETTINGS } from './constants';
```

---

## 6. 常量定义

```typescript
// ✅ 使用 const 定义常量
const PLUGIN_ID = 'link-tag-intelligence';
const MAX_CACHE_SIZE = 1000;

// ✅ 枚举（有限集合）
enum LinkType {
  WIKILINK = 'wikilink',
  MARKDOWN = 'markdown',
  HASHTAG = 'hashtag',
}

// ✅ 对象常量
const LINK_DIRECTIONS = {
  FORWARD: 'forward',
  BACKWARD: 'backward',
  BOTH: 'both',
} as const;
```

---

## 7. 注释规范

### 7.1 JSDoc

```typescript
/**
 * 处理链接并返回解析后的元数据
 * @param content - 笔记内容
 * @param filePath - 文件路径
 * @returns 解析后的链接数组
 */
function parseLinks(content: string, filePath: string): Link[] {
  // ...
}
```

### 7.2 行内注释

```typescript
// ✅ 解释 "为什么" 而非 "是什么"
// TODO: 优化性能 - 当前 O(n^2)
const result = items.filter(item => item.active);

// ❌ 避免无意义的注释
// 设置 name
this.name = name;
```

---

## 8. 禁止模式

| 禁止 | 原因 | 替代方案 |
|------|------|----------|
| `any` | 失去类型安全 | `unknown` + 类型守卫 |
| `var` | 函数作用域 | `const` / `let` |
| `new Array()` | 不一致 | `[]` / `Array<T>()` |
| `==` | 隐式转换 | `===` |
| `for...in` | 遍历原型链 | `for...of` / `Object.keys()` |
