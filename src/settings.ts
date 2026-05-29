import { App, FileSystemAdapter, PluginSettingTab } from "obsidian";

import {
  type CompanionPluginId,
  type CompanionPluginStatus,
  normalizeDelimitedList,
  type ResearchWorkbenchState
} from "./companion-plugins";
import type { LanguageSetting, UILanguage } from "./i18n";
import type LinkTagIntelligencePlugin from "./main";
import { AIService } from "./ai-service";

export type WorkflowMode = "general" | "researcher";

export const LEGACY_RELATION_KEYS = ["related", "see_also", "parent", "child", "same_as"];
export const RESEARCH_RELATION_KEYS = [
  "supports",
  "contradicts",
  "extends",
  "uses_method",
  "uses_dataset",
  "same_question",
  "evidence_for",
  "counterargument_to",
  "reviews",
  "inspired_by"
];

const RESEARCH_LITERATURE_PATH = "Knowledge/Research/Literature";
const RESEARCH_TEMPLATE_PATH = "Knowledge/Research/Templates/zotero-literature-note.md";
const RESEARCH_ATTACHMENTS_PATH = "Knowledge/Research/Attachments";
const STATIC_SMART_CONNECTIONS_EXCLUSIONS = [
  ".smart-env",
  "Archive/Imports",
  "Excalidraw",
  "note_reader"
];
const SMART_CONNECTIONS_HEADINGS = [
  "目录",
  "Contents",
  "参考文献",
  "References",
  "Acknowledgements"
];
const DEFAULT_SMART_RESULTS_LIMIT = 20;

/**
 * Resolve the speech model directory to an absolute filesystem path.
 * Model files are stored at: {vault}/.obsidian/plugins/link-tag-intelligence/models/{zh,en}/
 */
export function getSpeechModelDir(app: App, language: "zh" | "en"): string {
  const adapter = app.vault.adapter;
  const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
  const pluginDir = basePath + "/.obsidian/plugins/link-tag-intelligence/";
  const plugin = (app as any).plugins?.plugins?.["link-tag-intelligence"];
  const choice = plugin?.settings?.speechModelChoice ?? "zipformer";
  if (language === "zh") {
    return pluginDir + "models/" + (choice === "sensevoice" ? "sensevoice/" : "zh-2025/");
  }
  return pluginDir + "models/en/";
}

function normalizeConfigDir(configDir: string): string {
  return configDir
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "")
    .trim();
}

function buildSmartConnectionsExclusions(configDir: string): string[] {
  const normalizedConfigDir = normalizeConfigDir(configDir);
  return normalizedConfigDir
    ? [normalizedConfigDir, ...STATIC_SMART_CONNECTIONS_EXCLUSIONS]
    : [...STATIC_SMART_CONNECTIONS_EXCLUSIONS];
}

export const DEFAULT_TAG_FACET_MAP_TEXT = JSON.stringify(
  {
    topic: {
      "research-question": ["研究问题", "research question", "rq"],
      "literature-review": ["文献综述", "literature review"],
      "research-gap": ["研究空白", "research gap"],
      "knowledge-synthesis": ["知识综合", "synthesis"]
    },
    method: {
      experiment: ["实验", "experimental"],
      qualitative: ["定性研究", "qualitative"],
      quantitative: ["定量研究", "quantitative"],
      "case-study": ["案例研究", "case study"],
      "mixed-methods": ["混合方法", "mixed methods"]
    },
    dataset: {
      survey: ["问卷", "survey"],
      corpus: ["语料", "corpus"],
      interview: ["访谈", "interview"],
      "field-notes": ["田野笔记", "field notes"]
    },
    theory: {
      framework: ["理论框架", "framework"],
      model: ["模型", "model"],
      proposition: ["命题", "proposition"]
    },
    status: {
      "to-read": ["待读", "to read"],
      annotated: ["已批注", "annotated"],
      cited: ["已引用", "cited"]
    },
    writing_stage: {
      outline: ["提纲", "outline"],
      draft: ["草稿", "draft"],
      revision: ["修订", "revision"],
      final: ["定稿", "final"]
    },
    source_kind: {
      "literature-note": ["文献笔记", "literature note", "paper note"],
      "source-note": ["来源笔记", "source note"],
      "reading-note": ["阅读笔记", "reading note"],
      "draft-note": ["写作草稿", "draft note"]
    }
  },
  null,
  2
);

export interface AITemplate {
  id: string;
  name: string;
  prompt: string;
}

export const DEFAULT_AI_TEMPLATES: AITemplate[] = [
  {
    id: "standard-markdown",
    name: "标准 Markdown 渲染",
    prompt: "请将以下语音转录内容整理成一篇结构清晰、排版美观的 Markdown 笔记。\n要求：\n- 使用适当的标题（H1, H2, H3）划分结构\n- 使用列表（无序或有序）整理要点\n- 对关键术语或核心结论使用粗体进行强调\n- 纠正口语化的词汇、语气词和识别错误\n- 保持原文的语义和信息完整性\n\n上下文笔记内容：\n{{file:whole}}\n\n当前选中的内容：\n{{selection}}\n\n待整理的转录文本：\n{{transcription}}"
  },
  {
    id: "visual-table",
    name: "可视化数据表格",
    prompt: "请分析以下语音转录内容，将其中的数据、对比信息或结构化信息整理成一个标准的 Markdown 表格。\n要求：\n- 使用第一行作为表头，并用 `|---|---|` 格式分隔\n- 行列对齐，确保表格在 Markdown 中可正常解析\n- 如果有无法放入表格的补充信息，在表格下方以简短列表形式写出\n- 纠正识别错误\n\n上下文笔记内容：\n{{file:whole}}\n\n当前选中的内容：\n{{selection}}\n\n待整理的转录文本：\n{{transcription}}"
  },
  {
    id: "canvas-card",
    name: "Canvas 卡片节点",
    prompt: "请将以下语音转录内容转化为 Obsidian Canvas 卡片节点的 JSON 数据格式。请只返回 JSON 对象，不要包含 markdown 代码块包裹，以便能够直接复制使用。\n格式示例：\n{\n  \"nodes\": [\n    {\"id\": \"n1\", \"type\": \"text\", \"text\": \"核心主题...\", \"x\": 0, \"y\": 0, \"width\": 300, \"height\": 200},\n    {\"id\": \"n2\", \"type\": \"text\", \"text\": \"分支要点...\", \"x\": 400, \"y\": 0, \"width\": 300, \"height\": 200}\n  ],\n  \"edges\": [\n    {\"id\": \"e1\", \"fromNode\": \"n1\", \"fromSide\": \"right\", \"toNode\": \"n2\", \"toSide\": \"left\"}\n  ]\n}\n请根据转录文本的内容设计卡片节点和它们的关系，分配合理的坐标(x, y)以防重叠。\n\n上下文笔记内容：\n{{file:whole}}\n\n当前选中的内容：\n{{selection}}\n\n待整理的转录文本：\n{{transcription}}"
  },
  {
    id: "callout-summary",
    name: "Callout 重点摘要",
    prompt: "请为以下语音转录内容生成一个 Obsidian Callout 格式的精简摘要。\n要求：\n- 使用 `>[!summary] 语音转录摘要` 作为开头\n- 内部使用列表整理出核心观点（Key Takeaways）\n- 随后使用 `>[!todo] 待办事项` 列出语音中提到的行动项\n\n上下文笔记内容：\n{{file:whole}}\n\n当前选中的内容：\n{{selection}}\n\n待整理的转录文本：\n{{transcription}}"
  },
  {
    id: "action-items",
    name: "任务与行动清单",
    prompt: "请从以下语音转录内容中提取所有明确或隐含的待办事项、任务和行动项。\n要求：\n- 使用 Obsidian 待办事项语法 `- [ ] 任务内容` 格式化\n- 如果提及了截止时间或责任人，请在任务后面用括号标注，例如 `- [ ] 撰写报告 (截止: 周五) (@张三)`\n- 按优先级或时间先后顺序进行排序\n\n上下文笔记内容：\n{{file:whole}}\n\n当前选中的内容：\n{{selection}}\n\n待整理的转录文本：\n{{transcription}}"
  },
  {
    id: "mindmap-outline",
    name: "思维导图大纲",
    prompt: "请将以下语音转录内容整理成一个层次分明的多级缩进 Markdown 大纲列表。\n要求：\n- 最多使用 3 级缩进（- 节点，四个空格缩进 - 子节点）\n- 逻辑层级清晰，父节点为核心概念，子节点为缩进说明或具体细节\n- 适合直接转换为思维导图（Mindmap）\n\n上下文笔记内容：\n{{file:whole}}\n\n当前选中的内容：\n{{selection}}\n\n待整理的转录文本：\n{{transcription}}"
  },
  {
    id: "note-properties",
    name: "带属性 YAML 笔记",
    prompt: "请为以下转录内容生成一个符合 Obsidian 属性（Properties）标准的 YAML 前脑以及整理好的正文。\n格式要求：\n---\ntags:\n  - 语音转录\n  - 自动生成\nsummary: \"简短的一句话摘要\"\ndate: {{date}}\n---\n\n# 转录详细整理\n[在此写入整理后的正文]\n\n待整理的转录文本：\n{{transcription}}"
  },
  {
    id: "bilingual-translation",
    name: "中英双语对照",
    prompt: "请将以下语音转录内容进行校对，并翻译为中英双语对照格式。\n要求：\n- 对口语化表述进行精炼\n- 每一段先给出中文校对后的文本，随后给出对应的英文翻译\n- 确保翻译符合专业学术/行业术语规范\n\n上下文笔记内容：\n{{file:whole}}\n\n当前选中的内容：\n{{selection}}\n\n待整理的转录文本：\n{{transcription}}"
  }
];

export interface LinkTagIntelligenceSettings {
  language: LanguageSetting;
  workflowMode: WorkflowMode;
  relationKeys: string[];
  tagAliasMapText: string;
  tagFacetMapText: string;
  ingestionCommand: string;
  ingestionTimeoutMs: number;
  semanticBridgeEnabled: boolean;
  semanticCommand: string;
  semanticTimeoutMs: number;
  recentLinkMemorySize: number;
  recentLinkTargets: string[];
  researchLiteratureFolder: string;
  researchTemplatePath: string;
  researchAttachmentsFolder: string;
  researchOpenNoteAfterImport: boolean;
  smartConnectionsFolderExclusions: string;
  smartConnectionsHeadingExclusions: string;
  smartConnectionsResultsLimit: number;
  speechModelPath: string;
  speechHotwordsFile: string;
  speechLanguage: "zh" | "en";
  speechVadSensitivity: number;
  speechAutoStopSec: number;
  speechAutoPunctuate: boolean;
  speechDecodingMethod: "greedy_search" | "modified_beam_search";
  speechMaxUtteranceSec: number;
  speechModelChoice: "zipformer" | "sensevoice";
  speechAutoHotwords: boolean;
  speechConfusionMapText: string;
  // AI Settings
  aiProvider: "openai" | "anthropic" | "deepseek" | "minimax";
  aiModel: string;
  aiApiKey: string;
  aiBaseUrl: string;
  aiAsrSource: "local" | "cloud";
  aiLastUsedTemplateId: string;
  aiTemplates: AITemplate[];
}

export function buildDefaultSettings(configDir = ""): LinkTagIntelligenceSettings {
  return {
    language: "system",
    workflowMode: "researcher",
    relationKeys: [...RESEARCH_RELATION_KEYS],
    tagAliasMapText: JSON.stringify(
      {
        "文献笔记": ["literature-note", "paper-note", "source-note"],
        "研究问题": ["research-question", "rq"],
        "大语言模型": ["llm", "large-language-model"],
        "手冲咖啡": ["pour-over", "coffee-brewing"],
        "文献综述": ["literature-review", "lit review"],
        "研究空白": ["research gap"],
        "方法论": ["methodology", "framework"]
      },
      null,
      2
    ),
    tagFacetMapText: DEFAULT_TAG_FACET_MAP_TEXT,
    ingestionCommand: "",
    ingestionTimeoutMs: 60000,
    semanticBridgeEnabled: false,
    semanticCommand: "",
    semanticTimeoutMs: 30000,
    recentLinkMemorySize: 24,
    recentLinkTargets: [],
    researchLiteratureFolder: RESEARCH_LITERATURE_PATH,
    researchTemplatePath: RESEARCH_TEMPLATE_PATH,
    researchAttachmentsFolder: RESEARCH_ATTACHMENTS_PATH,
    researchOpenNoteAfterImport: true,
    smartConnectionsFolderExclusions: buildSmartConnectionsExclusions(configDir).join(", "),
    smartConnectionsHeadingExclusions: SMART_CONNECTIONS_HEADINGS.join(", "),
    smartConnectionsResultsLimit: DEFAULT_SMART_RESULTS_LIMIT,
    speechModelPath: "",
    speechLanguage: "zh",
    speechHotwordsFile: "",
    speechVadSensitivity: 2,
    speechAutoStopSec: 0,
    speechAutoPunctuate: true,
    speechDecodingMethod: "greedy_search",
    speechMaxUtteranceSec: 20,
    speechModelChoice: "zipformer",
    speechAutoHotwords: true,
    speechConfusionMapText: "在显价值:在险价值\n风险穗:风险矩阵\n富力业:傅里叶",
    // AI Settings defaults
    aiProvider: "openai",
    aiModel: "gpt-4o-mini",
    aiApiKey: "",
    aiBaseUrl: "https://api.openai.com/v1",
    aiAsrSource: "local",
    aiLastUsedTemplateId: "standard-markdown",
    aiTemplates: [...DEFAULT_AI_TEMPLATES]
  };
}

export const DEFAULT_SETTINGS: LinkTagIntelligenceSettings = buildDefaultSettings();

const COMPANION_META = {
  "obsidian-zotero-desktop-connector": {
    name: "Zotero Integration",
    descriptionKey: "settingsCompanionZoteroDesc" as const
  },
  "pdf-plus": {
    name: "PDF++",
    descriptionKey: "settingsCompanionPdfDesc" as const
  },
  "smart-connections": {
    name: "Smart Connections",
    descriptionKey: "settingsCompanionSmartDesc" as const
  },
  "semantic-bridge": {
    name: "Semantic bridge",
    descriptionKey: "settingsCompanionSemanticDesc" as const
  }
} satisfies Record<CompanionPluginId, { name: string; descriptionKey: Parameters<LinkTagIntelligencePlugin["t"]>[0] }>;

interface WorkbenchGuideCopy {
  localeLabel: string;
  overviewTitle: string;
  overviewDescription: string;
  lead: string;
  bridgeLabel: string;
  bridgeValue: string;
  stackTitle: string;
  stackItems: string[];
  flowTitle: string;
  flowItems: string[];
  troubleshootTitle: string;
  troubleshootBody: string;
  workflowTitle: string;
  workflowDescription: string;
}

const WORKBENCH_GUIDE: Record<UILanguage, WorkbenchGuideCopy> = {
  zh: {
    localeLabel: "中文",
    overviewTitle: "研究工作台总览",
    overviewDescription: "首页同时给出中英文研究栈说明，便于核对 CLI-first 采集、证据提取和语义召回的职责边界。",
    lead: "这个首页是研究型 Obsidian 库的操作总览。Link & Tag Intelligence 负责连接来源、证据、论点、关系键和中英文受控标签，不替代 PDF 阅读器、可选的 Zotero 适配器或外部语义检索。",
    bridgeLabel: "CLI-first 采集基线",
    bridgeValue: "优先配置一个 shell JSON ingestion CLI，用 DOI、arXiv 或 PDF 直接生成文献笔记；Zotero 只在你已有文库时作为可选适配器。",
    stackTitle: "推荐研究栈",
    stackItems: [
      "Research ingestion CLI：用 DOI、arXiv 或 PDF 输入直接创建文献笔记，并通过 stdout JSON 回传结果。",
      "PDF++：把带页码的原文证据复制到文献笔记或写作草稿里。",
      "Link & Tag Intelligence：连接来源、证据、论点、关系键和中英文受控标签。",
      "Smart Connections / 外部语义桥接：在写作或综述时补充召回，但不替代精确引用。",
      "Zotero Integration + Better BibTeX：只在你需要导入现有 Zotero 文库时使用。"
    ],
    flowTitle: "建议工作流",
    flowItems: [
      "先配置 ingestion CLI，并确认它能处理 DOI、arXiv 或 PDF 输入。",
      "在 Obsidian 中运行 CLI-first 导入，把文献笔记写入研究目录。",
      "打开 PDF，用 PDF++ 复制带页码的证据片段。",
      "回到本插件侧栏，补关系键、引用定位和中英文标签。",
      "写作或综述时，再打开 Smart Connections 或外部语义检索补充召回。",
      "只有在需要导入旧 Zotero 文库时，再使用 Zotero 适配器。"
    ],
    troubleshootTitle: "常见问题排查",
    troubleshootBody: "如果 CLI 导入失败，优先检查导入命令、占位符、网络访问和 PDF 路径。只有在你启用了 Zotero 适配器时，Zotero 桌面端和 Better BibTeX 才是必查项。",
    workflowTitle: "工作流执行顺序",
    workflowDescription: "先执行 CLI 采集，再摘录证据、补关系与标签，最后才进入语义召回。"
  },
  en: {
    localeLabel: "English",
    overviewTitle: "Research Workbench Overview",
    overviewDescription: "The home page now explains the stack in both Chinese and English so the CLI-first capture, evidence extraction, and semantic recall roles stay explicit.",
    lead: "This home page is the operating overview for a research-oriented Obsidian vault. Link & Tag Intelligence connects sources, evidence, claims, typed relations, and bilingual controlled tags. It does not replace a PDF reader, an optional Zotero adapter, or your external semantic retrieval stack.",
    bridgeLabel: "CLI-first capture baseline",
    bridgeValue: "Configure a shell JSON ingestion CLI first so DOI, arXiv, or PDF inputs can create literature notes directly. Zotero stays optional for existing libraries.",
    stackTitle: "Recommended research stack",
    stackItems: [
      "Research ingestion CLI: create literature notes directly from DOI, arXiv, or PDF input and return stdout JSON.",
      "PDF++: copy page-aware evidence into literature notes and draft notes.",
      "Link & Tag Intelligence: connect sources, evidence, claims, typed relations, and bilingual controlled tags.",
      "Smart Connections / external semantic bridge: add broader recall while drafting or synthesizing, without replacing exact references.",
      "Zotero Integration + Better BibTeX: use only when you need to import an existing Zotero library."
    ],
    flowTitle: "Suggested flow",
    flowItems: [
      "Configure the ingestion CLI first and confirm that it can handle DOI, arXiv, or PDF inputs.",
      "Run the CLI-first import inside Obsidian so literature notes land in the research folder.",
      "Open the source PDF and use PDF++ to copy page-aware evidence.",
      "Return to this plugin to add typed relations, reference context, and bilingual tags.",
      "Only then use Smart Connections or the external semantic bridge for broader recall while drafting.",
      "Use the Zotero adapter only when you need to import an existing Zotero library."
    ],
    troubleshootTitle: "Troubleshooting",
    troubleshootBody: "If CLI ingestion fails, check the command, placeholders, network access, and PDF paths first. Zotero desktop and Better BibTeX are only required when you intentionally enable the optional Zotero adapter.",
    workflowTitle: "Workflow execution order",
    workflowDescription: "Run CLI capture first, then capture evidence, add relations and tags, and only after that rely on semantic recall."
  }
};

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeJsonText(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeDelimitedSetting(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function normalizeLoadedSettings(data: unknown, configDir = ""): LinkTagIntelligenceSettings {
  const defaults = buildDefaultSettings(configDir);
  const raw = data && typeof data === "object" ? (data as Partial<LinkTagIntelligenceSettings>) : {};
  const normalized = {
    ...defaults,
    ...raw
  };

  if (Array.isArray(raw.relationKeys) && arraysEqual(raw.relationKeys.map(String), LEGACY_RELATION_KEYS)) {
    normalized.relationKeys = [...RESEARCH_RELATION_KEYS];
  }

  if (!Array.isArray(normalized.relationKeys) || normalized.relationKeys.length === 0) {
    normalized.relationKeys = [...RESEARCH_RELATION_KEYS];
  } else {
    normalized.relationKeys = normalized.relationKeys.map(String).map((item) => item.trim()).filter(Boolean);
  }

  normalized.workflowMode = normalized.workflowMode === "general" ? "general" : "researcher";
  normalized.tagAliasMapText = normalizeJsonText(normalized.tagAliasMapText, defaults.tagAliasMapText);
  normalized.tagFacetMapText = normalizeJsonText(normalized.tagFacetMapText, DEFAULT_TAG_FACET_MAP_TEXT);
  normalized.ingestionCommand = typeof normalized.ingestionCommand === "string" ? normalized.ingestionCommand : "";
  normalized.ingestionTimeoutMs = Number.isFinite(normalized.ingestionTimeoutMs) && normalized.ingestionTimeoutMs > 0
    ? normalized.ingestionTimeoutMs
    : defaults.ingestionTimeoutMs;
  normalized.semanticCommand = typeof normalized.semanticCommand === "string" ? normalized.semanticCommand : "";
  normalized.semanticTimeoutMs = Number.isFinite(normalized.semanticTimeoutMs) && normalized.semanticTimeoutMs > 0
    ? normalized.semanticTimeoutMs
    : defaults.semanticTimeoutMs;
  normalized.recentLinkMemorySize = Number.isFinite(normalized.recentLinkMemorySize) && normalized.recentLinkMemorySize > 0
    ? normalized.recentLinkMemorySize
    : defaults.recentLinkMemorySize;
  normalized.recentLinkTargets = Array.isArray(normalized.recentLinkTargets)
    ? normalized.recentLinkTargets.map(String).filter(Boolean)
    : [];
  normalized.researchLiteratureFolder = normalizeDelimitedSetting(normalized.researchLiteratureFolder, RESEARCH_LITERATURE_PATH);
  normalized.researchTemplatePath = normalizeDelimitedSetting(normalized.researchTemplatePath, RESEARCH_TEMPLATE_PATH);
  normalized.researchAttachmentsFolder = normalizeDelimitedSetting(normalized.researchAttachmentsFolder, RESEARCH_ATTACHMENTS_PATH);
  normalized.researchOpenNoteAfterImport = typeof normalized.researchOpenNoteAfterImport === "boolean"
    ? normalized.researchOpenNoteAfterImport
    : defaults.researchOpenNoteAfterImport;
  normalized.smartConnectionsFolderExclusions = normalizeDelimitedSetting(
    normalized.smartConnectionsFolderExclusions,
    defaults.smartConnectionsFolderExclusions
  );
  normalized.smartConnectionsHeadingExclusions = normalizeDelimitedSetting(
    normalized.smartConnectionsHeadingExclusions,
    defaults.smartConnectionsHeadingExclusions
  );
  normalized.smartConnectionsResultsLimit = Number.isFinite(normalized.smartConnectionsResultsLimit) && normalized.smartConnectionsResultsLimit > 0
    ? normalized.smartConnectionsResultsLimit
    : defaults.smartConnectionsResultsLimit;

  normalized.speechHotwordsFile = typeof normalized.speechHotwordsFile === "string" ? normalized.speechHotwordsFile.trim() : defaults.speechHotwordsFile;
  normalized.speechModelPath = typeof normalized.speechModelPath === "string" ? normalized.speechModelPath.trim() : defaults.speechModelPath;
  normalized.speechLanguage = normalized.speechLanguage === "en" ? "en" : "zh";
  normalized.speechVadSensitivity = Number.isFinite(normalized.speechVadSensitivity) && normalized.speechVadSensitivity >= 0 && normalized.speechVadSensitivity <= 3
    ? Math.round(normalized.speechVadSensitivity)
    : defaults.speechVadSensitivity;
  normalized.speechAutoStopSec = Number.isFinite(normalized.speechAutoStopSec)
    ? (normalized.speechAutoStopSec === 0 ? 0 : Math.max(10, Math.min(300, Math.round(normalized.speechAutoStopSec))))
    : defaults.speechAutoStopSec;
  normalized.speechAutoPunctuate = typeof normalized.speechAutoPunctuate === "boolean" ? normalized.speechAutoPunctuate : defaults.speechAutoPunctuate;
  normalized.speechDecodingMethod = normalized.speechDecodingMethod === "modified_beam_search" ? "modified_beam_search" : "greedy_search";
  normalized.speechMaxUtteranceSec = Number.isFinite(normalized.speechMaxUtteranceSec) && normalized.speechMaxUtteranceSec >= 1 && normalized.speechMaxUtteranceSec <= 60
    ? Math.round(normalized.speechMaxUtteranceSec)
    : defaults.speechMaxUtteranceSec;
  normalized.speechModelChoice = (normalized.speechModelChoice === "sensevoice") ? "sensevoice" : "zipformer";
  normalized.speechAutoHotwords = typeof normalized.speechAutoHotwords === "boolean" ? normalized.speechAutoHotwords : defaults.speechAutoHotwords;
  normalized.speechConfusionMapText = typeof normalized.speechConfusionMapText === "string" ? normalized.speechConfusionMapText : defaults.speechConfusionMapText;

  // AI settings normalization
  normalized.aiProvider = (normalized.aiProvider === "anthropic" || normalized.aiProvider === "deepseek" || normalized.aiProvider === "minimax")
    ? normalized.aiProvider
    : "openai";
  normalized.aiModel = typeof normalized.aiModel === "string" && normalized.aiModel.trim() ? normalized.aiModel.trim() : defaults.aiModel;
  normalized.aiApiKey = typeof normalized.aiApiKey === "string" ? normalized.aiApiKey : "";
  normalized.aiBaseUrl = typeof normalized.aiBaseUrl === "string" && normalized.aiBaseUrl.trim() ? normalized.aiBaseUrl.trim() : defaults.aiBaseUrl;
  normalized.aiAsrSource = normalized.aiAsrSource === "cloud" ? "cloud" : "local";
  normalized.aiLastUsedTemplateId = typeof normalized.aiLastUsedTemplateId === "string" ? normalized.aiLastUsedTemplateId : defaults.aiLastUsedTemplateId;

  if (Array.isArray(normalized.aiTemplates)) {
    const validated: AITemplate[] = [];
    for (const t of normalized.aiTemplates) {
      if (t && typeof t === "object" && typeof t.id === "string" && typeof t.name === "string" && typeof t.prompt === "string") {
        validated.push({
          id: t.id.trim(),
          name: t.name.trim(),
          prompt: t.prompt
        });
      }
    }
    normalized.aiTemplates = validated.length > 0 ? validated.slice(0, 15) : [...DEFAULT_AI_TEMPLATES];
  } else {
    normalized.aiTemplates = [...DEFAULT_AI_TEMPLATES];
  }

  return normalized;
}

type WorkbenchPage = "overview" | "workflow" | "plugins" | "taxonomy" | "speech" | "ai";

export class LinkTagIntelligenceSettingTab extends PluginSettingTab {
  plugin: LinkTagIntelligencePlugin;
  private renderToken = 0;
  private activePage: WorkbenchPage = "overview";
  private activeCompanionId: CompanionPluginId | null = null;

  constructor(app: App, plugin: LinkTagIntelligencePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("lti-settings-root");

    const shell = containerEl.createDiv({ cls: "lti-workbench" });
    shell.createDiv({
      text: this.plugin.t("loading"),
      cls: "lti-workbench-loading"
    });

    const token = ++this.renderToken;
    void this.renderWorkbench(shell, token);
  }

  private async renderWorkbench(containerEl: HTMLElement, token: number): Promise<void> {
    const state = await this.plugin.getResearchWorkbenchState();
    if (token !== this.renderToken) {
      return;
    }

    containerEl.empty();
    const nav = containerEl.createDiv({ cls: "lti-workbench-page-nav" });
    this.createPageTab(nav, "overview", this.plugin.t("settingsWorkbenchPageOverview"));
    this.createPageTab(nav, "workflow", this.plugin.t("settingsWorkbenchPageWorkflow"));
    this.createPageTab(nav, "plugins", this.plugin.t("settingsWorkbenchPagePlugins"));
    this.createPageTab(nav, "taxonomy", this.plugin.t("settingsWorkbenchPageTaxonomy"));
    this.createPageTab(nav, "speech", this.plugin.t("settingsWorkbenchPageSpeech"));
    this.createPageTab(nav, "ai", this.plugin.t("settingsWorkbenchPageAI"));

    const page = containerEl.createDiv({ cls: "lti-workbench-page" });
    switch (this.activePage) {
      case "overview":
        this.renderOverviewPage(page, state);
        break;
      case "workflow":
        this.renderWorkflowPage(page, state);
        break;
      case "plugins":
        this.renderPluginsPage(page, state);
        break;
      case "taxonomy":
        this.renderTaxonomyPage(page);
        break;
      case "speech":
        this.renderVoiceSection(page);
        break;
      case "ai":
        this.renderAiSection(page);
        break;
    }
  }

  private openPage(page: WorkbenchPage, companionId: CompanionPluginId | null = null): void {
    this.activePage = page;
    if (companionId) {
      this.activeCompanionId = companionId;
    } else if (page !== "plugins") {
      this.activeCompanionId = null;
    }
    this.display();
  }

  private createPageTab(containerEl: HTMLElement, page: WorkbenchPage, label: string): void {
    const button = containerEl.createEl("button", {
      cls: `lti-workbench-page-tab${this.activePage === page ? " is-active" : ""}`,
      text: label,
      type: "button"
    });
    button.addEventListener("click", () => {
      if (this.activePage !== page) {
        this.openPage(page);
      }
    });
  }

  private renderOverviewPage(containerEl: HTMLElement, state: ResearchWorkbenchState): void {
    this.renderHero(containerEl, state);
    this.renderOverviewGuideSection(containerEl);
    this.renderModuleSection(containerEl);
    this.renderCompanionSummarySection(containerEl, state);
  }

  private renderWorkflowPage(containerEl: HTMLElement, state: ResearchWorkbenchState): void {
    this.renderWorkflowGuideSection(containerEl);
    this.renderActionsSection(containerEl);

    const grid = containerEl.createDiv({ cls: "lti-workbench-settings-grid" });

    const preferences = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchPreferencesTitle"),
      this.plugin.t("settingsWorkbenchPreferencesDescription")
    );
    preferences.addClass("is-form");
    this.renderPreferencesDrawer(preferences);

    const paths = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchPathsTitle"),
      this.plugin.t("settingsWorkbenchPathsDescription")
    );
    paths.addClass("is-form");
    this.renderPathsDrawer(paths);

    const ingestion = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchIngestionTitle"),
      this.plugin.t("settingsWorkbenchIngestionDescription")
    );
    ingestion.addClass("is-form");
    this.renderIngestionDrawer(ingestion);

    const smart = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchRecallTitle"),
      this.plugin.t("settingsWorkbenchRecallDescription")
    );
    smart.addClass("is-form");
    this.renderSmartDrawer(smart);

    const semantic = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchSemanticTitle"),
      this.plugin.t("settingsWorkbenchSemanticDescription")
    );
    semantic.addClass("is-form");
    this.renderSemanticDrawer(semantic, state);
  }

  private renderPluginsPage(containerEl: HTMLElement, state: ResearchWorkbenchState): void {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchCompanionTitle"),
      this.plugin.t("settingsWorkbenchCompanionDescription")
    );
    const list = section.createDiv({ cls: "lti-workbench-plugin-list" });
    for (const companion of state.companions) {
      this.renderCompanionPanel(list, companion, state);
    }
  }

  private renderTaxonomyPage(containerEl: HTMLElement): void {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedTitle"),
      this.plugin.t("settingsWorkbenchAdvancedDescription")
    );
    section.addClass("is-form");
    this.renderTaxonomyDrawer(section);
  }

  private renderHero(containerEl: HTMLElement, state: ResearchWorkbenchState): void {
    const readyCompanions = state.companions.filter((item) => item.ready && !item.optional).length;
    const requiredCompanions = state.companions.filter((item) => !item.optional).length;

    const hero = containerEl.createDiv({ cls: "lti-workbench-hero" });
    const top = hero.createDiv({ cls: "lti-workbench-hero-top" });

    const copy = top.createDiv({ cls: "lti-workbench-hero-copy" });
    copy.createDiv({
      text: this.plugin.t("settingsWorkbenchEyebrow"),
      cls: "lti-workbench-eyebrow"
    });
    copy.createDiv({
      text: this.plugin.t("settingsWorkbenchTitle"),
      cls: "lti-workbench-title"
    });
    copy.createDiv({
      text: this.plugin.t("settingsWorkbenchDescription"),
      cls: "setting-item-description lti-workbench-description"
    });

    const side = top.createDiv({ cls: "lti-workbench-hero-side" });
    const buttons = side.createDiv({ cls: "lti-workbench-hero-action-grid" });
    this.createAsyncButton(buttons, this.plugin.t("settingsWorkbenchApplyAll"), async () => {
      await this.plugin.applyResearchPreset();
    });
    this.createActionButton(buttons, this.plugin.t("settingsWorkbenchRefresh"), () => this.display());
    this.createActionButton(buttons, this.plugin.t("settingsWorkbenchPageWorkflow"), () => this.openPage("workflow"));

    const prefs = side.createDiv({ cls: "lti-workbench-hero-meta-grid" });
    this.renderMetaCard(
      prefs,
      this.plugin.t("settingsLanguage"),
      this.formatLanguageLabel(this.plugin.settings.language)
    );
    this.renderMetaCard(
      prefs,
      this.plugin.t("settingsWorkflowMode"),
      this.plugin.t(this.plugin.settings.workflowMode === "researcher" ? "workflowModeResearcher" : "workflowModeGeneral")
    );

    const stats = side.createDiv({ cls: "lti-workbench-stat-strip" });
    this.renderStat(stats, this.plugin.t("settingsWorkbenchStatReady"), `${readyCompanions}/${requiredCompanions}`);
    this.renderStat(
      stats,
      this.plugin.t("settingsWorkbenchStatMode"),
      this.plugin.t(this.plugin.settings.workflowMode === "researcher" ? "workflowModeResearcher" : "workflowModeGeneral")
    );
    this.renderStat(stats, this.plugin.t("settingsWorkbenchStatIndexer"), String(state.enabledPluginIds.length));
    this.renderStat(
      stats,
      this.plugin.t("settingsWorkbenchStatSemantic"),
      state.profile.semanticEnabled ? this.plugin.t("settingsWorkbenchOn") : this.plugin.t("settingsWorkbenchOff")
    );
  }

  private currentWorkbenchGuide(): WorkbenchGuideCopy {
    return WORKBENCH_GUIDE[this.plugin.currentLanguage()];
  }

  private createCollapsibleCard(parent: HTMLElement, title: string, description?: string): HTMLDivElement {
    const details = parent.createEl("details", { cls: "lti-workbench-guide-details" });
    const summary = details.createEl("summary", { cls: "lti-workbench-guide-summary" });
    const header = summary.createDiv({ cls: "lti-workbench-guide-header" });
    header.createEl("h3", { text: title, cls: "lti-workbench-section-title" });
    if (description) {
      header.createDiv({
        text: description,
        cls: "setting-item-description lti-workbench-section-description"
      });
    }
    const inner = details.createDiv({ cls: "lti-workbench-guide-inner" });
    return inner;
  }

  private renderOverviewGuideSection(containerEl: HTMLElement): void {
    const guide = this.currentWorkbenchGuide();
    const activeLang = this.plugin.currentLanguage();
    const hintText = activeLang === "zh" 
      ? "💡 点击展开研究栈说明与核心指南" 
      : "💡 Click to expand research stack & core guides";
      
    const inner = this.createCollapsibleCard(containerEl, guide.overviewTitle, hintText);
    this.renderGuideLocaleCard(inner, activeLang);
  }

  private renderWorkflowGuideSection(containerEl: HTMLElement): void {
    const guide = this.currentWorkbenchGuide();
    const activeLang = this.plugin.currentLanguage();
    const hintText = activeLang === "zh"
      ? "💡 点击展开完整工作流执行细节与排错建议"
      : "💡 Click to expand full workflow execution details & troubleshooting";

    const inner = this.createCollapsibleCard(containerEl, guide.workflowTitle, hintText);
    inner.createDiv({
      text: guide.lead,
      cls: "setting-item-description lti-workbench-intro-lead"
    });
    this.renderGuideNoteBlock(inner, guide.bridgeLabel, guide.bridgeValue);
    this.renderGuideListBlock(inner, guide.stackTitle, guide.stackItems);
    this.renderGuideListBlock(inner, guide.flowTitle, guide.flowItems, true);
    this.renderGuideNoteBlock(inner, guide.troubleshootTitle, guide.troubleshootBody);
  }

  private renderGuideLocaleCard(containerEl: HTMLElement, language: UILanguage): void {
    const guide = WORKBENCH_GUIDE[language];
    const card = containerEl.createDiv({ cls: "lti-workbench-intro-card" });
    card.createDiv({ text: guide.localeLabel, cls: "lti-workbench-intro-locale" });
    card.createDiv({
      text: guide.lead,
      cls: "setting-item-description lti-workbench-intro-lead"
    });
    this.renderGuideNoteBlock(card, guide.bridgeLabel, guide.bridgeValue);
    this.renderGuideListBlock(card, guide.stackTitle, guide.stackItems);
    this.renderGuideListBlock(card, guide.flowTitle, guide.flowItems, true);
    this.renderGuideNoteBlock(card, guide.troubleshootTitle, guide.troubleshootBody);
  }

  private renderGuideListBlock(containerEl: HTMLElement, title: string, items: string[], ordered = false): void {
    const block = containerEl.createDiv({ cls: "lti-workbench-intro-block" });
    block.createDiv({ text: title, cls: "lti-workbench-intro-block-title" });
    const list = block.createEl(ordered ? "ol" : "ul", { cls: "lti-workbench-intro-list" });
    for (const item of items) {
      list.createEl("li", { text: item });
    }
  }

  private renderGuideNoteBlock(containerEl: HTMLElement, title: string, body: string): void {
    const note = containerEl.createDiv({ cls: "lti-workbench-intro-note" });
    note.createDiv({ text: title, cls: "lti-workbench-intro-block-title" });
    note.createDiv({
      text: body,
      cls: "setting-item-description lti-workbench-intro-note-copy"
    });
  }

  private renderActionsSection(containerEl: HTMLElement): void {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchQuickActionsTitle"),
      this.plugin.t("settingsWorkbenchQuickActionsDescription")
    );
    section.addClass("is-featured");

    const groups = section.createDiv({ cls: "lti-workbench-action-group-grid" });
    this.renderActionGroup(
      groups,
      this.plugin.t("settingsWorkbenchActionGroupCaptureTitle"),
      this.plugin.t("settingsWorkbenchActionGroupCaptureDescription"),
      [
        {
          title: this.plugin.t("settingsWorkbenchActionIngestionTitle"),
          description: this.plugin.t("settingsWorkbenchActionIngestionDescription"),
          onClick: () => this.plugin.openResearchIngestion()
        },
        {
          title: this.plugin.t("settingsWorkbenchActionZoteroTitle"),
          description: this.plugin.t("settingsWorkbenchActionZoteroDescription"),
          onClick: () => {
            void this.plugin.importZoteroNotes();
          }
        },
        {
          title: this.plugin.t("settingsWorkbenchActionPdfTitle"),
          description: this.plugin.t("settingsWorkbenchActionPdfDescription"),
          onClick: () => {
            void this.plugin.openPdfPlusSettings();
          }
        }
      ]
    );
    this.renderActionGroup(
      groups,
      this.plugin.t("settingsWorkbenchActionGroupRecallTitle"),
      this.plugin.t("settingsWorkbenchActionGroupRecallDescription"),
      [
        {
          title: this.plugin.t("settingsWorkbenchActionSmartTitle"),
          description: this.plugin.t("settingsWorkbenchActionSmartDescription"),
          onClick: () => {
            void this.plugin.openSmartConnectionsView();
          }
        },
        {
          title: this.plugin.t("settingsWorkbenchActionSemanticTitle"),
          description: this.plugin.t("settingsWorkbenchActionSemanticDescription"),
          onClick: () => this.plugin.openSemanticSearch()
        },
        {
          title: this.plugin.t("settingsWorkbenchActionPanelTitle"),
          description: this.plugin.t("settingsWorkbenchActionPanelDescription"),
          onClick: () => {
            void this.plugin.openIntelligencePanel();
          }
        }
      ]
    );
    this.renderActionGroup(
      groups,
      this.plugin.t("settingsWorkbenchActionGroupOrganizeTitle"),
      this.plugin.t("settingsWorkbenchActionGroupOrganizeDescription"),
      [
        {
          title: this.plugin.t("settingsWorkbenchActionTagsTitle"),
          description: this.plugin.t("settingsWorkbenchActionTagsDescription"),
          onClick: () => this.plugin.openTagManager()
        },
        {
          title: this.plugin.t("settingsWorkbenchActionSuggestTitle"),
          description: this.plugin.t("settingsWorkbenchActionSuggestDescription"),
          onClick: () => this.plugin.openTagSuggestion()
        }
      ]
    );
  }

  private renderModuleSection(containerEl: HTMLElement): void {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchConfigTitle"),
      this.plugin.t("settingsWorkbenchConfigDescription")
    );
    const grid = section.createDiv({ cls: "lti-workbench-module-grid" });

    const preferences = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchPreferencesTitle"),
      this.plugin.t("settingsWorkbenchPreferencesDescription")
    );
    this.renderMetricRow(preferences, this.plugin.t("settingsLanguage"), this.formatLanguageLabel(this.plugin.settings.language));
    this.renderMetricRow(
      preferences,
      this.plugin.t("settingsWorkflowMode"),
      this.plugin.t(this.plugin.settings.workflowMode === "researcher" ? "workflowModeResearcher" : "workflowModeGeneral")
    );
    this.attachModuleAction(preferences, () => this.openPage("workflow"));

    const paths = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchPathsTitle"),
      this.plugin.t("settingsWorkbenchPathsDescription")
    );
    this.renderMetricRow(paths, this.plugin.t("settingsResearchPathLiterature"), this.compactPathLabel(this.plugin.settings.researchLiteratureFolder));
    this.renderMetricRow(paths, this.plugin.t("settingsResearchPathTemplates"), this.compactPathLabel(this.plugin.settings.researchTemplatePath));
    this.renderMetricRow(paths, this.plugin.t("settingsResearchPathAttachments"), this.compactPathLabel(this.plugin.settings.researchAttachmentsFolder));
    this.attachModuleAction(paths, () => this.openPage("workflow"));

    const ingestion = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchIngestionTitle"),
      this.plugin.t("settingsWorkbenchIngestionDescription")
    );
    this.renderMetricRow(ingestion, this.plugin.t("settingsWorkbenchIngestionCommandTitle"), this.plugin.settings.ingestionCommand.trim() ? this.plugin.t("configured") : this.plugin.t("notConfigured"));
    this.renderMetricRow(ingestion, this.plugin.t("settingsWorkbenchIngestionTimeoutTitle"), String(this.plugin.settings.ingestionTimeoutMs));
    this.attachModuleAction(ingestion, () => this.openPage("workflow"));

    const smart = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchRecallTitle"),
      this.plugin.t("settingsWorkbenchRecallDescription")
    );
    this.renderMetricRow(smart, this.plugin.t("settingsWorkbenchFolderExclusionsTitle"), String(normalizeDelimitedList(this.plugin.settings.smartConnectionsFolderExclusions).length));
    this.renderMetricRow(smart, this.plugin.t("settingsWorkbenchHeadingExclusionsTitle"), String(normalizeDelimitedList(this.plugin.settings.smartConnectionsHeadingExclusions).length));
    this.renderMetricRow(smart, this.plugin.t("settingsWorkbenchResultsLimitTitle"), String(this.plugin.settings.smartConnectionsResultsLimit));
    this.attachModuleAction(smart, () => this.openPage("workflow"));

    const semantic = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchSemanticTitle"),
      this.plugin.t("settingsWorkbenchSemanticDescription")
    );
    this.renderMetricRow(semantic, this.plugin.t("settingsSemanticEnabled"), this.booleanText(this.plugin.settings.semanticBridgeEnabled));
    this.renderMetricRow(semantic, this.plugin.t("settingsSemanticCommand"), this.plugin.settings.semanticCommand.trim() ? this.plugin.t("configured") : this.plugin.t("notConfigured"));
    this.renderMetricRow(semantic, this.plugin.t("settingsSemanticTimeout"), String(this.plugin.settings.semanticTimeoutMs));
    this.attachModuleAction(semantic, () => this.openPage("workflow"));

    const taxonomy = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchAdvancedTitle"),
      this.plugin.t("settingsWorkbenchAdvancedDescription")
    );
    this.renderMetricRow(taxonomy, this.plugin.t("settingsRelationKeys"), String(this.plugin.settings.relationKeys.length));
    this.renderMetricRow(taxonomy, this.plugin.t("settingsTagAliasMap"), String(this.countAliasEntries(this.plugin.settings.tagAliasMapText)));
    this.renderMetricRow(taxonomy, this.plugin.t("settingsTagFacetMap"), String(this.plugin.getTagFacetMap({ suppressNotice: true }).size));
    this.attachModuleAction(taxonomy, () => this.openPage("taxonomy"));

    section.createDiv({
      text: this.plugin.t("settingsWorkbenchConfigHint"),
      cls: "setting-item-description lti-workbench-hint"
    });
  }

  private renderCompanionSummarySection(containerEl: HTMLElement, state: ResearchWorkbenchState): void {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchCompanionTitle"),
      this.plugin.t("settingsWorkbenchCompanionDescription")
    );
    const list = section.createDiv({ cls: "lti-workbench-summary-list" });
    for (const companion of state.companions) {
      this.renderCompanionSummaryRow(list, companion);
    }
  }

  private renderCompanionSummaryRow(containerEl: HTMLElement, companion: CompanionPluginStatus): void {
    const meta = COMPANION_META[companion.id];
    const row = containerEl.createDiv({ cls: "lti-workbench-summary-row" });
    const copy = row.createDiv({ cls: "lti-workbench-summary-copy" });
    copy.createDiv({ text: meta.name, cls: "lti-workbench-summary-title" });
    const chips = copy.createDiv({ cls: "lti-workbench-chip-row" });
    chips.createDiv({
      text: this.getStatusLabel(companion),
      cls: `lti-workbench-status-pill is-${this.getStatusTone(companion)}`
    });
    if (companion.mismatches.length > 0) {
      chips.createDiv({
        text: this.plugin.t("settingsWorkbenchMismatchCount", { count: companion.mismatches.length }),
        cls: "lti-workbench-chip"
      });
    }
    this.createActionButton(row, this.plugin.t("settingsWorkbenchPagePlugins"), () => {
      this.openPage("plugins", companion.id);
    });
  }

  private renderPreferencesDrawer(containerEl: HTMLElement): void {
    this.createSelectField(
      containerEl,
      this.plugin.t("settingsLanguage"),
      "",
      [
        { value: "system", label: "System" },
        { value: "en", label: "English" },
        { value: "zh", label: "中文" }
      ],
      this.plugin.settings.language,
      async (value) => {
        this.plugin.settings.language = value as LanguageSetting;
        await this.plugin.saveSettings();
        this.display();
      }
    );

    this.createSelectField(
      containerEl,
      this.plugin.t("settingsWorkflowMode"),
      this.plugin.t("settingsWorkflowModeDescription"),
      [
        { value: "researcher", label: this.plugin.t("workflowModeResearcher") },
        { value: "general", label: this.plugin.t("workflowModeGeneral") }
      ],
      this.plugin.settings.workflowMode,
      async (value) => {
        this.plugin.settings.workflowMode = value as WorkflowMode;
        await this.plugin.saveSettings();
        this.display();
      }
    );
  }

  private renderPathsDrawer(containerEl: HTMLElement): void {
    this.createTextField(
      containerEl,
      this.plugin.t("settingsResearchPathLiterature"),
      "",
      this.plugin.settings.researchLiteratureFolder,
      async (value) => {
        this.plugin.settings.researchLiteratureFolder = value.trim() || RESEARCH_LITERATURE_PATH;
        await this.plugin.saveSettings();
      }
    );
    this.createTextField(
      containerEl,
      this.plugin.t("settingsResearchPathTemplates"),
      "",
      this.plugin.settings.researchTemplatePath,
      async (value) => {
        this.plugin.settings.researchTemplatePath = value.trim() || RESEARCH_TEMPLATE_PATH;
        await this.plugin.saveSettings();
      }
    );
    this.createTextField(
      containerEl,
      this.plugin.t("settingsResearchPathAttachments"),
      "",
      this.plugin.settings.researchAttachmentsFolder,
      async (value) => {
        this.plugin.settings.researchAttachmentsFolder = value.trim() || RESEARCH_ATTACHMENTS_PATH;
        await this.plugin.saveSettings();
      }
    );
    this.createToggleField(
      containerEl,
      this.plugin.t("settingsWorkbenchOpenImportedTitle"),
      this.plugin.t("settingsWorkbenchOpenImportedDescription"),
      this.plugin.settings.researchOpenNoteAfterImport,
      async (value) => {
        this.plugin.settings.researchOpenNoteAfterImport = value;
        await this.plugin.saveSettings();
      }
    );
    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunIngestion"), () => {
      this.plugin.openResearchIngestion();
    });
    this.createAsyncButton(actions, this.plugin.t("settingsWorkbenchApplyCompanion"), async () => {
      await this.plugin.applyCompanionPreset("obsidian-zotero-desktop-connector");
    });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunZotero"), () => {
      void this.plugin.importZoteroNotes();
    });
  }

  private renderIngestionDrawer(containerEl: HTMLElement): void {
    this.createTextAreaField(
      containerEl,
      this.plugin.t("settingsWorkbenchIngestionCommandTitle"),
      this.plugin.t("settingsWorkbenchIngestionCommandDescription"),
      this.plugin.settings.ingestionCommand,
      async (value) => {
        this.plugin.settings.ingestionCommand = value;
        await this.plugin.saveSettings();
      },
      6,
      "node /path/to/lti-research.mjs ingest --source-type {{source_type}} --source {{source}} --vault {{vault}}"
    );
    this.createNumberField(
      containerEl,
      this.plugin.t("settingsWorkbenchIngestionTimeoutTitle"),
      "",
      String(this.plugin.settings.ingestionTimeoutMs),
      async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          this.plugin.settings.ingestionTimeoutMs = parsed;
          await this.plugin.saveSettings();
        }
      }
    );
    containerEl.createDiv({
      text: this.plugin.t("settingsWorkbenchIngestionHint"),
      cls: "setting-item-description lti-workbench-inline-note"
    });
    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunIngestion"), () => {
      this.plugin.openResearchIngestion();
    });
  }

  private renderSmartDrawer(containerEl: HTMLElement): void {
    this.createTextAreaField(
      containerEl,
      this.plugin.t("settingsWorkbenchFolderExclusionsTitle"),
      this.plugin.t("settingsWorkbenchFolderExclusionsDescription"),
      this.plugin.settings.smartConnectionsFolderExclusions,
      async (value) => {
        this.plugin.settings.smartConnectionsFolderExclusions = normalizeDelimitedList(value).join(", ");
        await this.plugin.saveSettings();
      },
      4
    );
    this.createTextAreaField(
      containerEl,
      this.plugin.t("settingsWorkbenchHeadingExclusionsTitle"),
      this.plugin.t("settingsWorkbenchHeadingExclusionsDescription"),
      this.plugin.settings.smartConnectionsHeadingExclusions,
      async (value) => {
        this.plugin.settings.smartConnectionsHeadingExclusions = normalizeDelimitedList(value).join(", ");
        await this.plugin.saveSettings();
      },
      4
    );
    this.createNumberField(
      containerEl,
      this.plugin.t("settingsWorkbenchResultsLimitTitle"),
      "",
      String(this.plugin.settings.smartConnectionsResultsLimit),
      async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          this.plugin.settings.smartConnectionsResultsLimit = parsed;
          await this.plugin.saveSettings();
        }
      }
    );
    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createAsyncButton(actions, this.plugin.t("settingsWorkbenchApplyCompanion"), async () => {
      await this.plugin.applyCompanionPreset("smart-connections");
    });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunSmart"), () => {
      void this.plugin.openSmartConnectionsView();
    });
  }

  private renderSemanticDrawer(containerEl: HTMLElement, state: ResearchWorkbenchState): void {
    this.createToggleField(
      containerEl,
      this.plugin.t("settingsSemanticEnabled"),
      this.plugin.t("settingsSemanticEnabledDescription"),
      this.plugin.settings.semanticBridgeEnabled,
      async (value) => {
        this.plugin.settings.semanticBridgeEnabled = value;
        await this.plugin.saveSettings();
        this.display();
      }
    );
    this.createTextAreaField(
      containerEl,
      this.plugin.t("settingsSemanticCommand"),
      this.plugin.t("settingsSemanticCommandDescription"),
      this.plugin.settings.semanticCommand,
      async (value) => {
        this.plugin.settings.semanticCommand = value;
        await this.plugin.saveSettings();
      },
      5,
      "python3 /path/tool.py --vault {{vault}} --query {{query}}"
    );
    this.createNumberField(
      containerEl,
      this.plugin.t("settingsSemanticTimeout"),
      "",
      String(this.plugin.settings.semanticTimeoutMs),
      async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          this.plugin.settings.semanticTimeoutMs = parsed;
          await this.plugin.saveSettings();
        }
      }
    );
    containerEl.createDiv({
      text: this.plugin.t("settingsWorkbenchCurrentExclusions", { value: state.profile.smartFolderExclusions.join(", ") }),
      cls: "setting-item-description lti-workbench-inline-note"
    });
    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createAsyncButton(actions, this.plugin.t("settingsWorkbenchApplyCompanion"), async () => {
      await this.plugin.applyCompanionPreset("semantic-bridge");
    });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunSemantic"), () => {
      this.plugin.openSemanticSearch();
    });
  }

  private renderTaxonomyDrawer(containerEl: HTMLElement): void {
    this.createAdvancedPanel(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedRelationsTitle"),
      this.plugin.t("settingsWorkbenchAdvancedRelationsDescription"),
      (contentEl) => {
        this.createTextAreaField(
          contentEl,
          this.plugin.t("settingsRelationKeys"),
          this.plugin.t("settingsRelationKeysDescription"),
          this.plugin.settings.relationKeys.join(", "),
          async (value) => {
            this.plugin.settings.relationKeys = value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
            this.display();
          },
          4,
          RESEARCH_RELATION_KEYS.join(", ")
        );
        const chips = contentEl.createDiv({ cls: "lti-workbench-key-chip-row" });
        for (const key of this.plugin.settings.relationKeys) {
          const chip = chips.createDiv({ cls: "lti-workbench-key-chip" });
          chip.createSpan({ text: key });
          chip.createSpan({ text: this.plugin.relationLabel(key), cls: "lti-workbench-key-chip-meta" });
        }
      }
    );

    this.createAdvancedPanel(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedAliasTitle"),
      this.plugin.t("settingsWorkbenchAdvancedAliasDescription"),
      (contentEl) => {
        this.createTextAreaField(
          contentEl,
          this.plugin.t("settingsTagAliasMap"),
          this.plugin.t("settingsTagAliasMapDescription"),
          this.plugin.settings.tagAliasMapText,
          async (value) => {
            this.plugin.settings.tagAliasMapText = value;
            await this.plugin.saveSettings();
          },
          10
        );
      }
    );

    this.createAdvancedPanel(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedFacetTitle"),
      this.plugin.t("settingsWorkbenchAdvancedFacetDescription"),
      (contentEl) => {
        this.createTextAreaField(
          contentEl,
          this.plugin.t("settingsTagFacetMap"),
          this.plugin.t("settingsTagFacetMapDescription"),
          this.plugin.settings.tagFacetMapText,
          async (value) => {
            this.plugin.settings.tagFacetMapText = value;
            await this.plugin.saveSettings();
          },
          14
        );
      }
    );

    this.createAdvancedPanel(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedMemoryTitle"),
      this.plugin.t("settingsWorkbenchAdvancedMemoryDescription"),
      (contentEl) => {
        this.createNumberField(
          contentEl,
          this.plugin.t("settingsRecentLinks"),
          "",
          String(this.plugin.settings.recentLinkMemorySize),
          async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
              this.plugin.settings.recentLinkMemorySize = parsed;
              this.plugin.settings.recentLinkTargets = this.plugin.settings.recentLinkTargets.slice(0, parsed);
              await this.plugin.saveSettings();
            }
          }
        );
      }
    );
  }

  private renderPluginDrawer(containerEl: HTMLElement, companion: CompanionPluginStatus, state: ResearchWorkbenchState): void {
    if (companion.configPath) {
      containerEl.createDiv({
        text: companion.configPath,
        cls: "lti-workbench-plugin-path"
      });
    }

    const facts = containerEl.createDiv({ cls: "lti-workbench-fact-list" });
    this.renderCompanionFacts(facts, companion, state);

    if (companion.mismatches.length > 0) {
      const mismatches = containerEl.createDiv({ cls: "lti-workbench-mismatch-list" });
      mismatches.createDiv({
        text: this.plugin.t("settingsWorkbenchMismatchTitle"),
        cls: "lti-workbench-subtitle"
      });
      for (const mismatch of companion.mismatches) {
        mismatches.createDiv({
          text: this.getMismatchLabel(mismatch),
          cls: "lti-workbench-mismatch-item"
        });
      }
    }

    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createAsyncButton(actions, this.plugin.t("settingsWorkbenchApplyCompanion"), async () => {
      await this.plugin.applyCompanionPreset(companion.id);
    }, !companion.installed && !companion.optional);
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchOpenSettings"), () => {
      this.plugin.openCompanionSettings(companion.id);
    }, !companion.installed && !companion.optional);
    const primary = this.getPrimaryCompanionAction(companion.id);
    if (primary) {
      this.createActionButton(actions, primary.label, primary.handler, primary.disabled);
    }
  }

  private renderCompanionPanel(containerEl: HTMLElement, companion: CompanionPluginStatus, state: ResearchWorkbenchState): void {
    const meta = COMPANION_META[companion.id];
    const panel = containerEl.createEl("details", { cls: "lti-workbench-plugin-panel" });
    panel.open = this.activeCompanionId === companion.id || companion.mismatches.length > 0;
    panel.addEventListener("toggle", () => {
      this.activeCompanionId = panel.open ? companion.id : this.activeCompanionId === companion.id ? null : this.activeCompanionId;
    });

    const summary = panel.createEl("summary", { cls: "lti-workbench-plugin-summary" });
    const copy = summary.createDiv({ cls: "lti-workbench-plugin-summary-copy" });
    copy.createDiv({ text: meta.name, cls: "lti-workbench-plugin-title" });
    copy.createDiv({
      text: this.plugin.t(meta.descriptionKey),
      cls: "setting-item-description lti-workbench-plugin-description"
    });

    const chips = summary.createDiv({ cls: "lti-workbench-chip-row" });
    chips.createDiv({
      text: this.getStatusLabel(companion),
      cls: `lti-workbench-status-pill is-${this.getStatusTone(companion)}`
    });
    if (companion.mismatches.length > 0) {
      chips.createDiv({
        text: this.plugin.t("settingsWorkbenchMismatchCount", { count: companion.mismatches.length }),
        cls: "lti-workbench-chip"
      });
    }

    const body = panel.createDiv({ cls: "lti-workbench-plugin-body" });
    this.renderPluginDrawer(body, companion, state);
  }

  private renderCompanionFacts(containerEl: HTMLElement, companion: CompanionPluginStatus, state: ResearchWorkbenchState): void {
    switch (companion.id) {
      case "obsidian-zotero-desktop-connector": {
        const guide = this.currentWorkbenchGuide();
        this.renderFactRow(containerEl, guide.bridgeLabel, guide.bridgeValue);
        this.renderFactRow(containerEl, this.plugin.t("settingsResearchPathLiterature"), this.valueOrFallback(companion.actual.literatureFolder), state.profile.literatureFolder, !companion.mismatches.includes("zotero-folder"));
        this.renderFactRow(containerEl, this.plugin.t("settingsResearchPathTemplates"), this.valueOrFallback(companion.actual.templatePath), state.profile.templatePath, !companion.mismatches.includes("zotero-template"));
        this.renderFactRow(containerEl, this.plugin.t("settingsResearchPathAttachments"), this.valueOrFallback(companion.actual.attachmentsFolder), state.profile.attachmentsFolder, !companion.mismatches.includes("zotero-attachments"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchOpenImportedTitle"), this.booleanText(companion.actual.openNoteAfterImport), this.booleanText(state.profile.openNoteAfterImport), !companion.mismatches.includes("zotero-open-note"));
        return;
      }
      case "pdf-plus":
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchDefaultDisplayTitle"), this.valueOrFallback(companion.actual.defaultDisplayFormat), "Title & page", !companion.mismatches.includes("pdf-default-display"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchCopyCommandsTitle"), this.joinList(companion.actual.copyCommandNames), "Literature quote, Evidence callout, Source link", !companion.mismatches.includes("pdf-copy-commands"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchHoverPreviewTitle"), this.valueOrFallback(companion.actual.hoverHighlightAction), "preview", !companion.mismatches.includes("pdf-hover-preview"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchBacklinksTitle"), this.booleanText(companion.actual.highlightBacklinks), this.plugin.t("settingsWorkbenchOn"), !companion.mismatches.includes("pdf-highlight-backlinks"));
        return;
      case "smart-connections":
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchFolderExclusionsTitle"), this.joinList(companion.actual.folderExclusions), state.profile.smartFolderExclusions.join(", "), !companion.mismatches.includes("smart-folder-exclusions"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchHeadingExclusionsTitle"), this.joinList(companion.actual.headingExclusions), state.profile.smartHeadingExclusions.join(", "), !companion.mismatches.includes("smart-heading-exclusions"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchLanguageTitle"), this.valueOrFallback(companion.actual.language), state.profile.language, !companion.mismatches.includes("smart-language"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchResultsLimitTitle"), this.valueOrFallback(companion.actual.resultsLimit), String(state.profile.smartResultsLimit), !companion.mismatches.includes("smart-results-limit"));
        return;
      case "semantic-bridge":
        this.renderFactRow(containerEl, this.plugin.t("settingsSemanticEnabled"), this.booleanText(companion.actual.enabled), undefined, companion.ready || !companion.enabled);
        this.renderFactRow(containerEl, this.plugin.t("settingsSemanticCommand"), this.valueOrFallback(companion.actual.command), undefined, !companion.mismatches.includes("semantic-command"));
        this.renderFactRow(containerEl, this.plugin.t("settingsSemanticTimeout"), this.valueOrFallback(companion.actual.timeoutMs), undefined, true);
    }
  }

  private createAdvancedPanel(
    containerEl: HTMLElement,
    title: string,
    description: string,
    renderContent: (contentEl: HTMLElement) => void
  ): void {
    const details = containerEl.createEl("details", { cls: "lti-workbench-advanced-panel" });
    const summary = details.createEl("summary", { cls: "lti-workbench-advanced-summary" });
    summary.createSpan({ text: title, cls: "lti-workbench-advanced-title" });
    summary.createSpan({ text: description, cls: "lti-workbench-advanced-description" });
    const content = details.createDiv({ cls: "lti-workbench-advanced-content" });
    renderContent(content);
  }

  private createSectionCard(containerEl: HTMLElement, title: string, description: string): HTMLElement {
    const card = containerEl.createDiv({ cls: "lti-workbench-section-card" });
    const header = card.createDiv({ cls: "lti-workbench-section-header" });
    header.createDiv({ text: title, cls: "lti-workbench-section-title" });
    header.createDiv({
      text: description,
      cls: "setting-item-description lti-workbench-section-description"
    });
    return card;
  }

  private createModuleCard(containerEl: HTMLElement, title: string, description: string): HTMLElement {
    const card = containerEl.createDiv({ cls: "lti-workbench-module-card" });
    card.createDiv({ text: title, cls: "lti-workbench-subtitle" });
    card.createDiv({
      text: description,
      cls: "setting-item-description lti-workbench-card-copy"
    });
    return card;
  }

  private attachModuleAction(containerEl: HTMLElement, onClick: () => void): void {
    const actions = containerEl.createDiv({ cls: "lti-workbench-card-footer" });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchDetails"), onClick);
  }

  private createFieldShell(containerEl: HTMLElement, label: string, description: string): HTMLElement {
    const field = containerEl.createDiv({ cls: "lti-workbench-field" });
    field.createDiv({ text: label, cls: "lti-workbench-field-label" });
    if (description) {
      field.createDiv({
        text: description,
        cls: "setting-item-description lti-workbench-field-description"
      });
    }
    return field;
  }

  private createTextField(
    containerEl: HTMLElement,
    label: string,
    description: string,
    value: string,
    onChange: (value: string) => Promise<void>,
    placeholder = ""
  ): void {
    const field = this.createFieldShell(containerEl, label, description);
    const input = field.createEl("input", { cls: "lti-workbench-input", type: "text" });
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener("change", () => {
      void onChange(input.value);
    });
  }

  private createNumberField(
    containerEl: HTMLElement,
    label: string,
    description: string,
    value: string,
    onChange: (value: string) => Promise<void>
  ): void {
    const field = this.createFieldShell(containerEl, label, description);
    const input = field.createEl("input", { cls: "lti-workbench-input", type: "number" });
    input.value = value;
    input.addEventListener("change", () => {
      void onChange(input.value);
    });
  }

  private createTextAreaField(
    containerEl: HTMLElement,
    label: string,
    description: string,
    value: string,
    onChange: (value: string) => Promise<void>,
    rows: number,
    placeholder = ""
  ): void {
    const field = this.createFieldShell(containerEl, label, description);
    const area = field.createEl("textarea", { cls: "lti-workbench-textarea" });
    area.rows = rows;
    area.value = value;
    area.placeholder = placeholder;
    area.addEventListener("change", () => {
      void onChange(area.value);
    });
  }

  private createSelectField(
    containerEl: HTMLElement,
    label: string,
    description: string,
    options: Array<{ value: string; label: string }>,
    value: string,
    onChange: (value: string) => Promise<void>
  ): void {
    const field = this.createFieldShell(containerEl, label, description);
    const select = field.createEl("select", { cls: "lti-workbench-select" });
    for (const option of options) {
      const el = select.createEl("option", { text: option.label });
      el.value = option.value;
      if (option.value === value) {
        el.selected = true;
      }
    }
    select.addEventListener("change", () => {
      void onChange(select.value);
    });
  }

  private createToggleField(
    containerEl: HTMLElement,
    label: string,
    description: string,
    checked: boolean,
    onChange: (value: boolean) => Promise<void>
  ): void {
    const field = this.createFieldShell(containerEl, label, description);
    const row = field.createDiv({ cls: "lti-workbench-switch-row" });
    const toggle = row.createEl("label", { cls: "lti-workbench-switch" });
    const input = toggle.createEl("input", { type: "checkbox" });
    input.checked = checked;
    toggle.createSpan({ cls: "lti-workbench-switch-slider" });
    input.addEventListener("change", () => {
      void onChange(input.checked);
    });
  }

  private renderStat(containerEl: HTMLElement, label: string, value: string): void {
    const stat = containerEl.createDiv({ cls: "lti-workbench-stat" });
    stat.createDiv({ text: label, cls: "lti-workbench-stat-label" });
    stat.createDiv({ text: value, cls: "lti-workbench-stat-value" });
  }

  private renderMetaCard(containerEl: HTMLElement, label: string, value: string): void {
    const card = containerEl.createDiv({ cls: "lti-workbench-meta-card" });
    card.createDiv({ text: label, cls: "lti-workbench-stat-label" });
    card.createDiv({ text: value, cls: "lti-workbench-meta-value" });
  }

  private renderMetricRow(containerEl: HTMLElement, label: string, value: string): void {
    const row = containerEl.createDiv({ cls: "lti-workbench-metric-row" });
    row.createDiv({ text: label, cls: "lti-workbench-metric-label" });
    row.createDiv({ text: value, cls: "lti-workbench-metric-value" });
  }

  private renderFactRow(containerEl: HTMLElement, label: string, actual: string, expected?: string, ok = true): void {
    const row = containerEl.createDiv({ cls: "lti-workbench-fact-row" });
    if (!ok) {
      row.addClass("is-alert");
    }
    row.createDiv({ text: label, cls: "lti-workbench-fact-label" });
    const values = row.createDiv({ cls: "lti-workbench-fact-values" });
    values.createDiv({ text: actual, cls: "lti-workbench-fact-actual" });
    if (expected && !ok) {
      values.createDiv({
        text: `${this.plugin.t("settingsWorkbenchExpectedPrefix")}: ${expected}`,
        cls: "lti-workbench-fact-expected"
      });
    }
  }

  private renderActionGroup(
    containerEl: HTMLElement,
    title: string,
    description: string,
    actions: Array<{ title: string; description: string; onClick: () => void }>
  ): void {
    const card = containerEl.createDiv({ cls: "lti-workbench-action-group" });
    card.createDiv({ text: title, cls: "lti-workbench-subtitle" });
    card.createDiv({
      text: description,
      cls: "setting-item-description lti-workbench-card-copy"
    });

    const list = card.createDiv({ cls: "lti-workbench-action-list" });
    for (const action of actions) {
      this.createActionListItem(list, action.title, action.description, action.onClick);
    }
  }

  private createActionListItem(
    containerEl: HTMLElement,
    title: string,
    description: string,
    onClick: () => void
  ): void {
    const button = containerEl.createEl("button", { cls: "lti-workbench-action-item", type: "button" });
    const copy = button.createDiv({ cls: "lti-workbench-action-item-copy" });
    const text = copy.createDiv({ cls: "lti-workbench-action-item-text" });
    text.createDiv({ text: title, cls: "lti-workbench-action-item-title" });
    text.createDiv({ text: description, cls: "lti-workbench-action-item-description" });
    button.addEventListener("click", onClick);
  }

  private createActionButton(containerEl: HTMLElement, label: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const button = containerEl.createEl("button", { cls: "lti-workbench-button", text: label, type: "button" });
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  }

  private createAsyncButton(containerEl: HTMLElement, label: string, onClick: () => Promise<void>, disabled = false): HTMLButtonElement {
    const button = this.createActionButton(containerEl, label, () => {
      void (async () => {
        button.disabled = true;
        button.textContent = this.plugin.t("loading");
        try {
          await onClick();
        } finally {
          this.display();
        }
      })();
    }, disabled);
    return button;
  }

  private getPrimaryCompanionAction(id: CompanionPluginId): { label: string; handler: () => void; disabled?: boolean } | null {
    switch (id) {
      case "obsidian-zotero-desktop-connector":
        return {
          label: this.plugin.t("settingsWorkbenchRunZotero"),
          handler: () => {
            void this.plugin.importZoteroNotes();
          }
        };
      case "smart-connections":
        return {
          label: this.plugin.t("settingsWorkbenchRunSmart"),
          handler: () => {
            void this.plugin.openSmartConnectionsView();
          }
        };
      case "semantic-bridge":
        return {
          label: this.plugin.t("settingsWorkbenchRunSemantic"),
          handler: () => this.plugin.openSemanticSearch()
        };
      case "pdf-plus":
        return {
          label: this.plugin.t("settingsWorkbenchRunPdf"),
          handler: () => {
            void this.plugin.openPdfPlusSettings();
          }
        };
      default:
        return null;
    }
  }

  private getStatusTone(companion: CompanionPluginStatus): "ready" | "alert" | "missing" | "optional" {
    if (companion.optional && !companion.installed) {
      return "optional";
    }
    if (!companion.installed && !companion.optional) {
      return "missing";
    }
    if (companion.ready) {
      return companion.optional ? "optional" : "ready";
    }
    return "alert";
  }

  private getStatusLabel(companion: CompanionPluginStatus): string {
    const tone = this.getStatusTone(companion);
    if (tone === "ready") {
      return this.plugin.t("settingsWorkbenchStatusReady");
    }
    if (tone === "missing") {
      return this.plugin.t("settingsWorkbenchStatusMissing");
    }
    if (tone === "optional") {
      return this.plugin.t("settingsWorkbenchStatusOptional");
    }
    return this.plugin.t("settingsWorkbenchStatusAttention");
  }

  private getMismatchLabel(code: string): string {
    const map: Record<string, string> = {
      "zotero-folder": this.plugin.t("settingsWorkbenchMismatchZoteroFolder"),
      "zotero-template": this.plugin.t("settingsWorkbenchMismatchZoteroTemplate"),
      "zotero-attachments": this.plugin.t("settingsWorkbenchMismatchZoteroAttachments"),
      "zotero-open-note": this.plugin.t("settingsWorkbenchMismatchZoteroOpen"),
      "zotero-output-template": this.plugin.t("settingsWorkbenchMismatchZoteroOutput"),
      "zotero-cite-template": this.plugin.t("settingsWorkbenchMismatchZoteroCite"),
      "pdf-display-formats": this.plugin.t("settingsWorkbenchMismatchPdfDisplayFormats"),
      "pdf-default-display": this.plugin.t("settingsWorkbenchMismatchPdfDisplayDefault"),
      "pdf-copy-commands": this.plugin.t("settingsWorkbenchMismatchPdfCopy"),
      "pdf-hover-preview": this.plugin.t("settingsWorkbenchMismatchPdfHover"),
      "pdf-highlight-backlinks": this.plugin.t("settingsWorkbenchMismatchPdfBacklinks"),
      "pdf-selection-menu": this.plugin.t("settingsWorkbenchMismatchPdfSelectionMenu"),
      "pdf-annotation-menu": this.plugin.t("settingsWorkbenchMismatchPdfAnnotationMenu"),
      "smart-language": this.plugin.t("settingsWorkbenchMismatchSmartLanguage"),
      "smart-folder-exclusions": this.plugin.t("settingsWorkbenchMismatchSmartFolders"),
      "smart-heading-exclusions": this.plugin.t("settingsWorkbenchMismatchSmartHeadings"),
      "smart-results-limit": this.plugin.t("settingsWorkbenchMismatchSmartResults"),
      "smart-render-markdown": this.plugin.t("settingsWorkbenchMismatchSmartRender"),
      "semantic-command": this.plugin.t("settingsWorkbenchMismatchSemanticCommand")
    };
    return map[code] ?? code;
  }

  private compactPathLabel(value: string): string {
    const normalized = value.trim().replace(/\\/g, "/");
    if (!normalized) {
      return this.plugin.t("notConfigured");
    }
    const segments = normalized.split("/").filter(Boolean);
    return segments.at(-1) ?? normalized;
  }

  private countAliasEntries(text: string): number {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return Object.keys(parsed).length;
    } catch {
      return 0;
    }
  }

  private formatLanguageLabel(setting: LanguageSetting): string {
    if (setting === "system") {
      return this.plugin.currentLanguage() === "zh" ? "系统" : "System";
    }
    return setting === "zh" ? "中文" : "English";
  }

  private valueOrFallback(value: unknown): string {
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    return this.plugin.t("notConfigured");
  }

  private joinList(value: unknown): string {
    return Array.isArray(value) && value.length > 0
      ? value.map(String).join(", ")
      : this.plugin.t("notConfigured");
  }

  private booleanText(value: unknown): string {
    return value === true ? this.plugin.t("settingsWorkbenchOn") : this.plugin.t("settingsWorkbenchOff");
  }

  private renderVoiceSection(containerEl: HTMLElement): void {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("speechSettingsHeading"),
      this.plugin.t("speechSettingsDescription")
    );

    // Speech Model Choice setting
    this.createSelectField(
      section,
      this.plugin.t("speechModelChoice"),
      this.plugin.t("speechModelChoiceDescription"),
      [
        { value: "zipformer", label: this.plugin.t("speechModelChoiceZipformer") },
        { value: "sensevoice", label: this.plugin.t("speechModelChoiceSensevoice") }
      ],
      this.plugin.settings.speechModelChoice,
      async (value) => {
        this.plugin.settings.speechModelChoice = value as "zipformer" | "sensevoice";
        await this.plugin.saveSettings();
      }
    );

    // Auto Hotwords toggle setting
    this.createToggleField(
      section,
      this.plugin.t("speechAutoHotwords"),
      this.plugin.t("speechAutoHotwordsDescription"),
      this.plugin.settings.speechAutoHotwords,
      async (value) => {
        this.plugin.settings.speechAutoHotwords = value;
        await this.plugin.saveSettings();
      }
    );

    // Confusion map text setting
    const confusionRow = section.createDiv({ cls: "lti-voice-field-row" });
    const confusionField = this.createFieldShell(
      confusionRow,
      this.plugin.t("speechConfusionMapText"),
      this.plugin.t("speechConfusionMapTextDescription")
    );
    const confusionInput = confusionField.createEl("textarea", {
      cls: "lti-workbench-textarea lti-voice-confusion-input",
      value: this.plugin.settings.speechConfusionMapText
    });
    confusionInput.rows = 4;
    confusionInput.placeholder = "在显价值:在险价值\n风险穗:风险矩阵";
    confusionInput.addEventListener("change", () => {
      this.plugin.settings.speechConfusionMapText = confusionInput.value;
      void this.plugin.saveSettings();
    });

    // Model file path — text input + Browse button (D-15)
    const modelRow = section.createDiv({ cls: "lti-voice-field-row" });
    const modelField = this.createFieldShell(modelRow, this.plugin.t("speechModelPath"), this.plugin.t("speechModelPathDescription"));
    const modelInputRow = modelField.createDiv({ cls: "lti-voice-input-row" });
    const modelInput = modelInputRow.createEl("input", { cls: "lti-workbench-input lti-voice-path-input", type: "text" });
    modelInput.value = this.plugin.settings.speechModelPath;
    modelInput.placeholder = "/path/to/sherpa-onnx/model";
    modelInput.addEventListener("change", () => {
      this.plugin.settings.speechModelPath = modelInput.value.trim();
      void this.plugin.saveSettings();
    });
    const browseBtn = modelInputRow.createEl("button", {
      cls: "lti-workbench-button lti-voice-browse-btn",
      text: this.plugin.t("speechBrowse"),
      type: "button"
    });
    browseBtn.addEventListener("click", () => {
      // Try Electron dialog.showOpenDialog for full path, fall back to showing vault path hint
      try {
        const desktopRequire = (globalThis as Record<string, unknown>).require as ((m: string) => Record<string, unknown>) | undefined;
        const electron = desktopRequire?.("electron");
        const dialog = electron?.remote?.dialog as { showOpenDialog?: (...args: unknown[]) => Promise<{ canceled: boolean; filePaths: string[] }> } | undefined;
        if (dialog?.showOpenDialog) {
          void dialog.showOpenDialog({ properties: ["openDirectory"] }).then((result) => {
            if (!result.canceled && result.filePaths.length > 0) {
              modelInput.value = result.filePaths[0] ?? "";
              modelInput.dispatchEvent(new Event("change"));
            }
          });
          return;
        }
      } catch {
        // Electron dialog not available — use HTML directory picker as fallback
      }
      // HTML fallback: create hidden file input + webkitdirectory
      const dirPicker = document.createElement("input");
      dirPicker.type = "file";
      dirPicker.setAttribute("webkitdirectory", "");
      dirPicker.setAttribute("directory", "");
      dirPicker.style.display = "none";
      document.body.appendChild(dirPicker);
      dirPicker.addEventListener("change", () => {
        const files = dirPicker.files;
        if (files && files.length > 0) {
          const firstPath = files[0].webkitRelativePath || files[0].name;
          const dirName = firstPath.split("/")[0] ?? "";
          if (dirName) {
            const adapter = this.plugin.app.vault.adapter;
            const vaultRoot = (adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
            modelInput.value = vaultRoot ? vaultRoot + "/" + dirName : dirName;
            modelInput.dispatchEvent(new Event("change"));
          }
        }
        document.body.removeChild(dirPicker);
      });
      dirPicker.click();
    });

    // Hotwords file path (domain-specific terminology boosting)
    const hotwordsRow = section.createDiv({ cls: "lti-voice-field-row" });
    const hotwordsField = this.createFieldShell(hotwordsRow, this.plugin.t("speechHotwordsFile"), this.plugin.t("speechHotwordsFileDescription"));
    const hotwordsInput = hotwordsField.createEl("input", { cls: "lti-workbench-input", type: "text" });
    hotwordsInput.value = this.plugin.settings.speechHotwordsFile;
    hotwordsInput.placeholder = "models/hotwords.txt";
    hotwordsInput.addEventListener("change", () => {
      this.plugin.settings.speechHotwordsFile = hotwordsInput.value.trim();
      void this.plugin.saveSettings();
    });

    // Decoding method - dropdown with greedy_search / modified_beam_search
    this.createSelectField(
      section,
      this.plugin.t("speechDecodingMethod"),
      this.plugin.t("speechDecodingMethodDescription"),
      [
        { value: "greedy_search", label: this.plugin.t("speechDecodingMethodGreedy") },
        { value: "modified_beam_search", label: this.plugin.t("speechDecodingMethodBeam") }
      ],
      this.plugin.settings.speechDecodingMethod,
      async (value) => {
        this.plugin.settings.speechDecodingMethod = value as "greedy_search" | "modified_beam_search";
        await this.plugin.saveSettings();
      }
    );

    // Language selector — dropdown with zh/en (D-16)
    this.createSelectField(
      section,
      this.plugin.t("speechLanguage"),
      "",
      [
        { value: "zh", label: this.plugin.t("speechLanguageZh") },
        { value: "en", label: this.plugin.t("speechLanguageEn") }
      ],
      this.plugin.settings.speechLanguage,
      async (value) => {
        this.plugin.settings.speechLanguage = value as "zh" | "en";
        await this.plugin.saveSettings();
      }
    );

    // VAD sensitivity — slider 0-3, default 2 (D-17)
    const vadField = this.createFieldShell(section, this.plugin.t("speechVadSensitivity"), this.plugin.t("speechVadSensitivityDescription"));
    const vadRow = vadField.createDiv({ cls: "lti-voice-slider-row" });
    const vadSlider = vadRow.createEl("input", { type: "range", cls: "lti-voice-slider" });
    vadSlider.min = "0";
    vadSlider.max = "3";
    vadSlider.step = "1";
    vadSlider.value = String(this.plugin.settings.speechVadSensitivity);
    const vadLabel = vadRow.createSpan({ cls: "lti-voice-slider-value", text: String(this.plugin.settings.speechVadSensitivity) });
    vadSlider.addEventListener("input", () => {
      const val = Number.parseInt(vadSlider.value, 10);
      vadLabel.textContent = String(val);
    });
    vadSlider.addEventListener("change", () => {
      this.plugin.settings.speechVadSensitivity = Number.parseInt(vadSlider.value, 10);
      void this.plugin.saveSettings();
    });

    // Max segment duration — slider 1-60, default 20
    const durationField = this.createFieldShell(section, this.plugin.t("speechMaxUtteranceSec"), this.plugin.t("speechMaxUtteranceSecDescription"));
    const durationRow = durationField.createDiv({ cls: "lti-voice-slider-row" });
    const durationSlider = durationRow.createEl("input", { type: "range", cls: "lti-voice-slider" });
    durationSlider.min = "1";
    durationSlider.max = "60";
    durationSlider.step = "1";
    durationSlider.value = String(this.plugin.settings.speechMaxUtteranceSec);
    const durationLabel = durationRow.createSpan({ cls: "lti-voice-slider-value", text: String(this.plugin.settings.speechMaxUtteranceSec) + "s" });
    durationSlider.addEventListener("input", () => {
      const val = Number.parseInt(durationSlider.value, 10);
      durationLabel.textContent = String(val) + "s";
    });
    durationSlider.addEventListener("change", () => {
      this.plugin.settings.speechMaxUtteranceSec = Number.parseInt(durationSlider.value, 10);
      void this.plugin.saveSettings();
    });

    // Auto-stop timeout — number input, default 60, range 10-300, 0 = disabled (D-18)
    const autoStopField = this.createFieldShell(section, this.plugin.t("speechAutoStopTimeout"), this.plugin.t("speechAutoStopTimeoutDescription"));
    const autoStopInput = autoStopField.createEl("input", { cls: "lti-workbench-input", type: "number" });
    autoStopInput.min = "0";
    autoStopInput.max = "300";
    autoStopInput.step = "10";
    autoStopInput.value = String(this.plugin.settings.speechAutoStopSec);
    autoStopInput.addEventListener("change", () => {
      const parsed = Number.parseInt(autoStopInput.value, 10);
      if (Number.isFinite(parsed)) {
        this.plugin.settings.speechAutoStopSec = Math.max(0, Math.min(300, parsed));
        autoStopInput.value = String(this.plugin.settings.speechAutoStopSec);
        void this.plugin.saveSettings();
      }
    });

    // Punctuation Prediction — toggle, default true (D-19)
    this.createToggleField(
      section,
      this.plugin.t("speechAutoPunctuate"),
      this.plugin.t("speechAutoPunctuateDescription"),
      this.plugin.settings.speechAutoPunctuate,
      async (value) => {
        this.plugin.settings.speechAutoPunctuate = value;
        await this.plugin.saveSettings();
      }
    );
  }

  private renderAiSection(containerEl: HTMLElement): void {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("aiSettingsHeading"),
      this.plugin.t("aiSettingsDescription")
    );

    // AI Provider Select
    this.createSelectField(
      section,
      this.plugin.t("aiProvider"),
      this.plugin.t("aiProviderDescription"),
      [
        { value: "openai", label: "OpenAI" },
        { value: "anthropic", label: "Anthropic" },
        { value: "deepseek", label: "DeepSeek" },
        { value: "minimax", label: "MiniMax" }
      ],
      this.plugin.settings.aiProvider,
      async (value) => {
        this.plugin.settings.aiProvider = value as "openai" | "anthropic" | "deepseek" | "minimax";
        // Auto-configure default Base URL & Model for convenience if switching
        if (value === "deepseek") {
          this.plugin.settings.aiBaseUrl = "https://api.deepseek.com";
          this.plugin.settings.aiModel = "deepseek-chat";
        } else if (value === "minimax") {
          this.plugin.settings.aiBaseUrl = "https://api.minimax.chat/v1";
          this.plugin.settings.aiModel = "abab6.5g-chat";
        } else if (value === "openai") {
          this.plugin.settings.aiBaseUrl = "https://api.openai.com/v1";
          this.plugin.settings.aiModel = "gpt-4o-mini";
        } else if (value === "anthropic") {
          this.plugin.settings.aiBaseUrl = "https://api.anthropic.com/v1";
          this.plugin.settings.aiModel = "claude-3-5-sonnet-20241022";
        }
        await this.plugin.saveSettings();
        this.display(); // re-render to update default text inputs
      }
    );

    // API Base URL Input
    const urlField = this.createFieldShell(section, this.plugin.t("aiBaseUrl"), this.plugin.t("aiBaseUrlDescription"));
    const urlInput = urlField.createEl("input", { cls: "lti-workbench-input", type: "text" });
    urlInput.value = this.plugin.settings.aiBaseUrl;
    urlInput.addEventListener("change", async () => {
      this.plugin.settings.aiBaseUrl = urlInput.value.trim();
      await this.plugin.saveSettings();
    });

    // API Key Input (masked password)
    const keyField = this.createFieldShell(section, this.plugin.t("aiApiKey"), this.plugin.t("aiApiKeyDescription"));
    const keyInput = keyField.createEl("input", { cls: "lti-workbench-input", type: "password" });
    keyInput.value = this.plugin.settings.aiApiKey;
    keyInput.placeholder = "sk-........................";
    keyInput.addEventListener("change", async () => {
      this.plugin.settings.aiApiKey = keyInput.value.trim();
      await this.plugin.saveSettings();
    });

    // AI Model Name Input
    const modelField = this.createFieldShell(section, this.plugin.t("aiModel"), this.plugin.t("aiModelDescription"));
    const modelInput = modelField.createEl("input", { cls: "lti-workbench-input", type: "text" });
    modelInput.value = this.plugin.settings.aiModel;
    modelInput.addEventListener("change", async () => {
      this.plugin.settings.aiModel = modelInput.value.trim();
      await this.plugin.saveSettings();
    });

    // ASR Source Select
    this.createSelectField(
      section,
      this.plugin.t("aiAsrSource"),
      this.plugin.t("aiAsrSourceDescription"),
      [
        { value: "local", label: this.plugin.t("aiAsrSourceLocal") },
        { value: "cloud", label: this.plugin.t("aiAsrSourceCloud") }
      ],
      this.plugin.settings.aiAsrSource,
      async (value) => {
        this.plugin.settings.aiAsrSource = value as "local" | "cloud";
        await this.plugin.saveSettings();
      }
    );

    // Test Connection Button Row
    const testRow = section.createDiv({ cls: "lti-ai-test-row" });
    const testBtn = testRow.createEl("button", {
      cls: "lti-workbench-button lti-ai-test-btn",
      text: "测试 API 连接",
      type: "button"
    });
    const testStatus = testRow.createSpan({ cls: "lti-ai-test-status" });

    testBtn.addEventListener("click", async () => {
      if (!this.plugin.settings.aiApiKey.trim()) {
        testStatus.textContent = "❌ 请先填写 API Key！";
        testStatus.className = "lti-ai-test-status is-error";
        return;
      }

      testBtn.disabled = true;
      testStatus.textContent = "⏳ 正在测试连接中...";
      testStatus.className = "lti-ai-test-status is-pending";

      try {
        const service = new AIService(this.app, this.plugin.settings);
        const reply = await service.runRefinement("Please respond only with the word 'Success'.");
        if (reply.trim()) {
          testStatus.textContent = `✅ 连接成功！模型回复: ${reply.trim().substring(0, 30)}${reply.trim().length > 30 ? "..." : ""}`;
          testStatus.className = "lti-ai-test-status is-success";
        } else {
          testStatus.textContent = "❌ 连接失败：接口返回了空文本。";
          testStatus.className = "lti-ai-test-status is-error";
        }
      } catch (err: any) {
        const errorMsg = String(err.message || err);
        let beautified = `❌ API 连接失败: ${errorMsg}`;
        
        if (errorMsg.includes("Insufficient Balance") || errorMsg.includes("402") || errorMsg.includes("insufficient_funds")) {
          beautified = "❌ API 连接失败：您的账户余额不足 (Insufficient Balance / 402)。您的 API 密钥及接口配置均正确，但需要登录您的 AI 服务商后台进行充值或绑定账单。";
        } else if (errorMsg.includes("401") || errorMsg.includes("Incorrect API key") || errorMsg.includes("invalid_api_key") || errorMsg.includes("Unauthorized")) {
          beautified = "❌ API 连接失败：API 密钥 (API Key) 无效 (401 / Unauthorized)。请检查您的 API Key 是否复制正确，或前往控制台生成新的密钥。";
        } else if (errorMsg.includes("404") || errorMsg.includes("model_not_found")) {
          beautified = "❌ API 连接失败：模型未找到 (Model Not Found / 404)。请确认您填写的“模型名称”是否完全正确，或当前密钥是否被授权了此模型权限。";
        } else if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError") || errorMsg.includes("timeout") || errorMsg.includes("ENOTFOUND")) {
          beautified = "❌ API 连接失败：网络超时或基础地址不可达。请检查网络，或确认您填写的“API 接口地址 (Base URL)”拼写是否正确，或是否需要代理环境。";
        }
        
        testStatus.textContent = beautified;
        testStatus.className = "lti-ai-test-status is-error";
      } finally {
        testBtn.disabled = false;
      }
    });

    // Prompt Templates Section
    const templatesSection = this.createSectionCard(
      containerEl,
      this.plugin.t("aiTemplatesHeading"),
      this.plugin.t("aiTemplatesDescription")
    );

    const templatesContainer = templatesSection.createDiv({ cls: "lti-ai-templates-list" });

    // Render each template
    this.plugin.settings.aiTemplates.forEach((template, index) => {
      const card = templatesContainer.createDiv({ cls: "lti-ai-template-card" });
      
      // Template Name row
      const nameRow = card.createDiv({ cls: "lti-ai-template-name-row" });
      nameRow.createSpan({ text: `${this.plugin.t("aiTemplateName")} #${index + 1}:`, cls: "lti-ai-template-label" });
      
      const nameInput = nameRow.createEl("input", { cls: "lti-workbench-input lti-ai-template-name-input", type: "text" });
      nameInput.value = template.name;
      nameInput.addEventListener("change", async () => {
        template.name = nameInput.value.trim() || `Template ${index + 1}`;
        await this.plugin.saveSettings();
      });

      // Delete Button
      const deleteBtn = nameRow.createEl("button", {
        cls: "lti-workbench-button is-danger lti-ai-template-delete-btn",
        text: "删除",
        type: "button"
      });
      deleteBtn.addEventListener("click", async () => {
        this.plugin.settings.aiTemplates.splice(index, 1);
        await this.plugin.saveSettings();
        this.display(); // Refresh settings tab
      });

      // Prompt Content Area
      const promptArea = card.createDiv({ cls: "lti-ai-template-prompt-area" });
      promptArea.createSpan({ text: this.plugin.t("aiTemplatePrompt"), cls: "lti-ai-template-label" });
      const promptTextarea = promptArea.createEl("textarea", { cls: "lti-workbench-input lti-ai-template-textarea" });
      promptTextarea.value = template.prompt;
      promptTextarea.rows = 4;
      promptTextarea.addEventListener("change", async () => {
        template.prompt = promptTextarea.value;
        await this.plugin.saveSettings();
      });
    });

    // Add Template Button (if under 15)
    if (this.plugin.settings.aiTemplates.length < 15) {
      const actionRow = templatesSection.createDiv({ cls: "lti-ai-template-actions" });
      const addBtn = actionRow.createEl("button", {
        cls: "lti-workbench-button",
        text: `+ ${this.plugin.t("aiAddTemplate")}`,
        type: "button"
      });
      addBtn.addEventListener("click", async () => {
        const newId = `custom-template-${Date.now()}`;
        this.plugin.settings.aiTemplates.push({
          id: newId,
          name: `自定义模板 ${this.plugin.settings.aiTemplates.length + 1}`,
          prompt: "请整理以下语音转录内容：\n\n待整理的转录文本：\n{{transcription}}"
        });
        await this.plugin.saveSettings();
        this.display(); // Refresh settings tab
      });
    } else {
      templatesSection.createDiv({
        cls: "lti-ai-template-max-hint",
        text: this.plugin.t("aiMaxTemplatesReached")
      });
    }
  }
}
