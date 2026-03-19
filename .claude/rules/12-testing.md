---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "tests/**"
---

# 测试规范

> 加载时机：SessionStart（会话开始时）
> 适用范围：Vitest 测试框架

---

## 1. 测试配置

### 1.1 Vitest 配置

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

### 1.2 运行测试

```bash
# 运行所有测试
npm test

# 监听模式
npm test -- --watch

# 指定文件
npm test -- src/tags.test.ts
```

---

## 2. 测试结构

### 2.1 命名规范

```typescript
// ✅ 测试文件：*.test.ts
tests/
├── tags.test.ts
├── links.test.ts
└── settings.test.ts

// ✅ 测试函数命名
describe('parseLinks', () => {
  it('should parse wikilinks correctly', () => { });
  it('should handle empty content', () => { });
  it('should throw on invalid input', () => { });
});
```

### 2.2 Arrange-Act-Assert

```typescript
it('should parse hashtag correctly', () => {
  // Arrange
  const content = '# obsidian';

  // Act
  const result = parseTag(content, 0);

  // Assert
  expect(result).toEqual({
    tag: 'obsidian',
    start: 0,
    end: 9,
  });
});
```

---

## 3. Mock 策略

### 3.1 Obsidian API Mock

```typescript
// tests/mocks/obsidian.ts
export const mockApp = {
  workspace: {
    getActiveFile: () => mockFile,
  },
  metadataCache: {
    getCache: () => mockCache,
  },
};

export const mockFile = {
  path: 'test.md',
  extension: 'md',
};

export const mockCache = {
  tags: { 'obsidian': 1 },
};
```

### 3.2 局部 Mock

```typescript
import { parseTag } from '../src/tags';

vi.mock('../src/i18n', () => ({
  tr: (key: string) => key,
}));

it('should parse tag correctly', () => {
  const result = parseTag('#test', 0);
  expect(result.tag).toBe('test');
});
```

---

## 4. 异步测试

### 4.1 Promise 测试

```typescript
it('should load data asynchronously', async () => {
  const result = await loadData();
  expect(result).toHaveLength(5);
});

it('should handle rejection', async () => {
  await expect(fetchData()).rejects.toThrow('Network error');
});
```

### 4.2 定时器 Mock

```typescript
vi.useFakeTimers();

it('should debounce correctly', async () => {
  const fn = vi.fn();
  const debounced = debounce(fn, 300);

  debounced();
  debounced();

  vi.advanceTimersByTime(300);

  expect(fn).toHaveBeenCalledOnce();
});
```

---

## 5. 覆盖率要求

### 5.1 覆盖率目标

| 类型 | 目标 |
|------|------|
| 语句覆盖率 | >= 80% |
| 分支覆盖率 | >= 70% |
| 函数覆盖率 | >= 90% |
| 行覆盖率 | >= 80% |

### 5.2 覆盖率命令

```bash
# 生成覆盖率报告
npm test -- --coverage

# 查看 HTML 报告
open coverage/index.html
```

---

## 6. 测试隔离

### 6.1 每个测试独立

```typescript
// ✅ 每个测试独立设置
describe('Cache', () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache();
  });

  it('should add item', () => {
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('should clear all', () => {
    cache.set('key', 'value');
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
```

### 6.2 清理

```typescript
afterEach(() => {
  vi.clearAllMocks();
});
```

---

## 7. 集成测试

### 7.1 插件生命周期

```typescript
import { LinkTagIntelligence } from '../src/main';

describe('Plugin', () => {
  let plugin: LinkTagIntelligence;

  afterEach(() => {
    plugin?.onunload();
  });

  it('should load correctly', () => {
    plugin = new LinkTagIntelligence(mockApp);
    plugin.onload();
    expect(plugin.settings).toBeDefined();
  });
});
```

---

## 8. 测试检查清单

```
□ 测试文件命名: *.test.ts
□ 使用 describe/it 块组织测试
□ 每个测试遵循 Arrange-Act-Assert
□ Mock 所有外部依赖
□ 异步测试使用 async/await
□ 测试覆盖核心功能 >= 80%
□ 所有测试通过
```
