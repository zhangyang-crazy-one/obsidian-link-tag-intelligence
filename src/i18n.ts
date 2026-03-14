export type UILanguage = "en" | "zh";
export type LanguageSetting = "system" | UILanguage;

type TranslationKey =
  | "pluginName"
  | "viewTitle"
  | "openPanel"
  | "insertLink"
  | "insertBlockRef"
  | "insertLineRef"
  | "quickLink"
  | "addRelation"
  | "manageTags"
  | "suggestTags"
  | "semanticSearch"
  | "currentNote"
  | "outgoingLinks"
  | "backlinks"
  | "outgoingReferences"
  | "incomingReferences"
  | "relations"
  | "tags"
  | "unlinkedMentions"
  | "semanticBridge"
  | "notConfigured"
  | "configured"
  | "noActiveNote"
  | "emptyList"
  | "path"
  | "aliases"
  | "sharedTags"
  | "reason"
  | "searchTags"
  | "rename"
  | "merge"
  | "delete"
  | "cancel"
  | "apply"
  | "loading"
  | "query"
  | "selectionAlias"
  | "insertLinkPlaceholder"
  | "insertLinkEmpty"
  | "createdFrontmatterTag"
  | "tagsUpdated"
  | "tagSuggestionsReady"
  | "semanticDesktopOnly"
  | "semanticMissingCommand"
  | "semanticFailed"
  | "semanticNoResults"
  | "semanticOpen"
  | "semanticInsert"
  | "semanticScore"
  | "promptRenameTag"
  | "promptMergeInto"
  | "promptRelationKey"
  | "savedRelation"
  | "insertedLink"
  | "invalidAliasMap"
  | "invalidFacetMap"
  | "settingsWorkflowMode"
  | "settingsWorkflowModeDescription"
  | "workflowModeResearcher"
  | "workflowModeGeneral"
  | "settingsLanguage"
  | "settingsRelationKeys"
  | "settingsRelationKeysDescription"
  | "settingsRelationKeysPreview"
  | "settingsTagAliasMap"
  | "settingsTagAliasMapDescription"
  | "settingsTagFacetMap"
  | "settingsTagFacetMapDescription"
  | "settingsSemanticEnabled"
  | "settingsSemanticEnabledDescription"
  | "settingsSemanticCommand"
  | "settingsSemanticCommandDescription"
  | "settingsSemanticTimeout"
  | "settingsRecentLinks"
  | "settingsResearchGuideTitle"
  | "settingsResearchGuideDescription"
  | "settingsResearchGuideStep1"
  | "settingsResearchGuideStep2"
  | "settingsResearchGuideStep3"
  | "settingsCompanionPluginsTitle"
  | "settingsCompanionZoteroDesc"
  | "settingsCompanionPdfDesc"
  | "settingsCompanionSmartDesc"
  | "settingsCompanionSemanticDesc"
  | "settingsSemanticResearchHint"
  | "mentionsExplanation"
  | "selected"
  | "notSelected"
  | "modalTagSuggestionsDescription"
  | "modalRelationDescription"
  | "modalManageTagsDescription"
  | "modalSemanticDescription"
  | "tagSuggestionAlias"
  | "tagSuggestionFacet"
  | "tagSuggestionKnown"
  | "tagSuggestionKeyword"
  | "tagSuggestionSource"
  | "tagSuggestionFacetLabel"
  | "tagSuggestionMatches"
  | "tagSuggestionSummary"
  | "tagSuggestionPrimaryGroup"
  | "tagSuggestionSecondaryGroup"
  | "tagSuggestionEvidence"
  | "tagSuggestionSourceTitle"
  | "tagSuggestionSourceAlias"
  | "tagSuggestionSourceHeading"
  | "tagSuggestionSourceReference"
  | "tagSuggestionSourceContext"
  | "tagSuggestionSourceBody"
  | "tagSuggestionSourcePath"
  | "tagSuggestionSourceFacet"
  | "tagSuggestionSourceVault"
  | "tagFacetUnclassified"
  | "modalBlockRefDescription"
  | "modalLineRefDescription"
  | "referenceExistingBlocks"
  | "referenceCreateBlockFromLines"
  | "referenceCreateLineFromLines"
  | "referenceStartLine"
  | "referenceEndLine"
  | "referenceNoPreview"
  | "referenceTypeBlock"
  | "referenceTypeLine"
  | "pickBlockRefTarget"
  | "pickLineRefTarget"
  | "blockRefInserted"
  | "lineRefInserted";

const TRANSLATIONS: Record<UILanguage, Record<TranslationKey, string>> = {
  en: {
    pluginName: "Link & Tag Intelligence",
    viewTitle: "Link & Tag Intelligence",
    openPanel: "Open Link & Tag Intelligence panel",
    insertLink: "Insert link with preview",
    insertBlockRef: "Insert block reference",
    insertLineRef: "Insert line reference",
    quickLink: "Quick link selected text",
    addRelation: "Add relation to current note",
    manageTags: "Manage vault tags",
    suggestTags: "Suggest tags for current note",
    semanticSearch: "Semantic search via external command",
    currentNote: "Current note",
    outgoingLinks: "Outgoing links",
    backlinks: "Backlinks",
    outgoingReferences: "Exact outgoing refs",
    incomingReferences: "Exact incoming refs",
    relations: "Relations",
    tags: "Tags",
    unlinkedMentions: "Unlinked mentions",
    semanticBridge: "Semantic bridge",
    notConfigured: "Not configured",
    configured: "Configured",
    noActiveNote: "Open a markdown note to use this view.",
    emptyList: "Nothing to show.",
    path: "Path",
    aliases: "Aliases",
    sharedTags: "Shared tags",
    reason: "Reason",
    searchTags: "Search tags",
    rename: "Rename",
    merge: "Merge",
    delete: "Delete",
    cancel: "Cancel",
    apply: "Apply",
    loading: "Loading...",
    query: "Query",
    selectionAlias: "Selection alias",
    insertLinkPlaceholder: "Search notes, aliases, paths, and tags",
    insertLinkEmpty: "No matching note candidates.",
    createdFrontmatterTag: "Added tags to frontmatter.",
    tagsUpdated: "Tags updated.",
    tagSuggestionsReady: "Suggested tags are ready.",
    semanticDesktopOnly: "Semantic bridge is desktop-only.",
    semanticMissingCommand: "Semantic command is not configured.",
    semanticFailed: "Semantic search failed: {message}",
    semanticNoResults: "Semantic search returned no results.",
    semanticOpen: "Open",
    semanticInsert: "Insert link",
    semanticScore: "Score",
    promptRenameTag: "Rename tag",
    promptMergeInto: "Merge into tag",
    promptRelationKey: "Select relation key",
    savedRelation: "Saved relation {relation}.",
    insertedLink: "Inserted link to {title}.",
    invalidAliasMap: "Tag alias map is invalid JSON. Falling back to empty map.",
    invalidFacetMap: "Tag facet map is invalid JSON. Falling back to empty map.",
    settingsWorkflowMode: "Workflow mode",
    settingsWorkflowModeDescription: "Choose the default guidance and presets for this vault.",
    workflowModeResearcher: "Researcher",
    workflowModeGeneral: "General knowledge base",
    settingsLanguage: "Plugin language",
    settingsRelationKeys: "Relation keys",
    settingsRelationKeysDescription: "Comma-separated frontmatter keys for typed note relations. Research defaults work well for literature review and drafting.",
    settingsRelationKeysPreview: "Research default preview",
    settingsTagAliasMap: "Tag alias map JSON",
    settingsTagAliasMapDescription: "JSON object from canonical tag to aliases. Used for bilingual matching, not automatic rewrites.",
    settingsTagFacetMap: "Research tag facet map JSON",
    settingsTagFacetMapDescription: "JSON object from facet name to canonical tags and aliases. Used to boost topic / method / dataset / writing-stage tags.",
    settingsSemanticEnabled: "Enable semantic bridge",
    settingsSemanticEnabledDescription: "Keep disabled if you only use native links and companion plugins. Enable when you have an external research search CLI.",
    settingsSemanticCommand: "Semantic command",
    settingsSemanticCommandDescription: "Desktop-only shell command. Supported placeholders: {{query}} {{vault}} {{file}} {{selection}}. Prefer returning citekey / author / year / page / source_type / evidence_kind.",
    settingsSemanticTimeout: "Semantic timeout (ms)",
    settingsRecentLinks: "Recent link memory size",
    settingsResearchGuideTitle: "Research workflow guide",
    settingsResearchGuideDescription: "This mode is designed for literature notes, evidence gathering, synthesis, and drafting. Keep exact references, typed relations, and controlled tags aligned.",
    settingsResearchGuideStep1: "Use Zotero Integration or PDF++ to capture source material and page-level annotations.",
    settingsResearchGuideStep2: "Use typed relations like supports / contradicts / extends to connect notes and claims.",
    settingsResearchGuideStep3: "Maintain controlled topic, method, dataset, status, and writing-stage tags to keep recommendation quality high.",
    settingsCompanionPluginsTitle: "Recommended companion plugins",
    settingsCompanionZoteroDesc: "Bring in citekeys, literature-note metadata, and source annotations.",
    settingsCompanionPdfDesc: "Work with PDF highlights, page jumps, and annotation-heavy reading workflows.",
    settingsCompanionSmartDesc: "Add embeddings-based semantic recall without duplicating this plugin's link and tag layer.",
    settingsCompanionSemanticDesc: "Use your own research-aware retrieval command when you want citation-grounded semantic results.",
    settingsSemanticResearchHint: "Recommended semantic result fields: citekey, author, year, page, source_type, evidence_kind, suggested_tags, suggested_relations.",
    mentionsExplanation: "Notes that mention this note title or aliases without already linking to it.",
    selected: "Selected",
    notSelected: "Not selected",
    modalTagSuggestionsDescription: "Suggestions are ranked from aliases, research facets, existing vault tags, source paths, and recurring keywords.",
    modalRelationDescription: "Choose a typed relation to write into frontmatter.",
    modalManageTagsDescription: "Rename, merge, or delete native tags across the vault.",
    modalSemanticDescription: "Run your external semantic command against the current note context.",
    tagSuggestionAlias: "Alias match",
    tagSuggestionFacet: "Research facet",
    tagSuggestionKnown: "Existing vault tag",
    tagSuggestionKeyword: "Keyword candidate",
    tagSuggestionSource: "Source path",
    tagSuggestionFacetLabel: "Facet: {facet}",
    tagSuggestionMatches: "Matched: {matches}",
    tagSuggestionSummary: "Primary recommendations are higher-confidence research tags. Secondary candidates are looser context hints.",
    tagSuggestionPrimaryGroup: "Primary recommendations",
    tagSuggestionSecondaryGroup: "Secondary candidates",
    tagSuggestionEvidence: "Evidence: {sources}",
    tagSuggestionSourceTitle: "Title",
    tagSuggestionSourceAlias: "Alias",
    tagSuggestionSourceHeading: "Heading",
    tagSuggestionSourceReference: "Reference",
    tagSuggestionSourceContext: "Linked context",
    tagSuggestionSourceBody: "Body",
    tagSuggestionSourcePath: "Path",
    tagSuggestionSourceFacet: "Facet map",
    tagSuggestionSourceVault: "Vault tag",
    tagFacetUnclassified: "Other tags",
    modalBlockRefDescription: "Choose a line range and insert a legacy block reference compatible with your prior note system.",
    modalLineRefDescription: "Choose a line range and insert a direct line reference.",
    referenceExistingBlocks: "Existing block IDs",
    referenceCreateBlockFromLines: "Choose block range",
    referenceCreateLineFromLines: "Choose line range",
    referenceStartLine: "Start line",
    referenceEndLine: "End line",
    referenceNoPreview: "No preview available.",
    referenceTypeBlock: "Block ref",
    referenceTypeLine: "Line ref",
    pickBlockRefTarget: "Choose a note for block reference",
    pickLineRefTarget: "Choose a note for line reference",
    blockRefInserted: "Inserted block reference to {title}.",
    lineRefInserted: "Inserted line reference to {title}."
  },
  zh: {
    pluginName: "链接与标签智能",
    viewTitle: "链接与标签智能",
    openPanel: "打开链接与标签智能面板",
    insertLink: "带预览插入链接",
    insertBlockRef: "插入块引用",
    insertLineRef: "插入行引用",
    quickLink: "将选中文本快速链接",
    addRelation: "为当前笔记添加关系",
    manageTags: "管理整个库的标签",
    suggestTags: "为当前笔记推荐标签",
    semanticSearch: "通过外部命令进行语义检索",
    currentNote: "当前笔记",
    outgoingLinks: "出链",
    backlinks: "反链",
    outgoingReferences: "精确出链",
    incomingReferences: "精确反链",
    relations: "关系",
    tags: "标签",
    unlinkedMentions: "未链接提及",
    semanticBridge: "语义桥接",
    notConfigured: "未配置",
    configured: "已配置",
    noActiveNote: "请先打开一个 Markdown 笔记。",
    emptyList: "没有内容。",
    path: "路径",
    aliases: "别名",
    sharedTags: "共享标签",
    reason: "命中原因",
    searchTags: "搜索标签",
    rename: "重命名",
    merge: "合并",
    delete: "删除",
    cancel: "取消",
    apply: "应用",
    loading: "加载中...",
    query: "查询",
    selectionAlias: "选中文本别名",
    insertLinkPlaceholder: "搜索笔记、别名、路径与标签",
    insertLinkEmpty: "没有匹配的笔记候选。",
    createdFrontmatterTag: "已把标签写入 frontmatter。",
    tagsUpdated: "标签已更新。",
    tagSuggestionsReady: "标签建议已生成。",
    semanticDesktopOnly: "语义桥接仅支持桌面端。",
    semanticMissingCommand: "尚未配置语义命令。",
    semanticFailed: "语义检索失败：{message}",
    semanticNoResults: "语义检索没有返回结果。",
    semanticOpen: "打开",
    semanticInsert: "插入链接",
    semanticScore: "得分",
    promptRenameTag: "重命名标签",
    promptMergeInto: "合并到标签",
    promptRelationKey: "选择关系键",
    savedRelation: "已保存关系 {relation}。",
    insertedLink: "已插入指向 {title} 的链接。",
    invalidAliasMap: "标签别名映射不是合法 JSON，已回退为空映射。",
    invalidFacetMap: "标签分面映射不是合法 JSON，已回退为空映射。",
    settingsWorkflowMode: "工作流模式",
    settingsWorkflowModeDescription: "为当前库选择默认提示和预设。",
    workflowModeResearcher: "研究员",
    workflowModeGeneral: "通用知识库",
    settingsLanguage: "插件语言",
    settingsRelationKeys: "关系键",
    settingsRelationKeysDescription: "使用逗号分隔的 frontmatter 关系键。研究默认关系更适合文献综述、证据整理和写作。",
    settingsRelationKeysPreview: "研究默认关系预览",
    settingsTagAliasMap: "标签别名映射 JSON",
    settingsTagAliasMapDescription: "从规范标签到别名的 JSON 对象，用于中英文匹配，不会自动改写已有标签。",
    settingsTagFacetMap: "研究标签分面映射 JSON",
    settingsTagFacetMapDescription: "从分面名到规范标签及别名的 JSON 对象，用于优先识别 topic / method / dataset / writing-stage 等研究标签。",
    settingsSemanticEnabled: "启用语义桥接",
    settingsSemanticEnabledDescription: "如果你只使用原生链接和搭配插件，可以关闭。若有外部研究检索 CLI，再开启。",
    settingsSemanticCommand: "语义命令",
    settingsSemanticCommandDescription: "仅桌面端的 shell 命令。支持占位符：{{query}} {{vault}} {{file}} {{selection}}。建议返回 citekey / author / year / page / source_type / evidence_kind。",
    settingsSemanticTimeout: "语义超时（毫秒）",
    settingsRecentLinks: "最近链接记忆长度",
    settingsResearchGuideTitle: "研究工作流指南",
    settingsResearchGuideDescription: "该模式面向文献笔记、证据采集、综合整理与论文写作。尽量让精确引用、关系类型与受控标签保持一致。",
    settingsResearchGuideStep1: "用 Zotero Integration 或 PDF++ 采集文献元数据、页码定位和批注内容。",
    settingsResearchGuideStep2: "用 supports / contradicts / extends 等关系连接文献、观点和证据。",
    settingsResearchGuideStep3: "维护 topic、method、dataset、status、writing-stage 等受控标签，能显著提升推荐质量。",
    settingsCompanionPluginsTitle: "推荐搭配插件",
    settingsCompanionZoteroDesc: "导入 citekey、文献笔记元数据和来源批注。",
    settingsCompanionPdfDesc: "处理 PDF 高亮、页码跳转和重标注阅读流程。",
    settingsCompanionSmartDesc: "提供 embedding 语义召回，同时不与本插件的链接与标签层重复。",
    settingsCompanionSemanticDesc: "当你需要可控的研究检索协议时，使用自己的研究型外部命令。",
    settingsSemanticResearchHint: "推荐语义结果字段：citekey、author、year、page、source_type、evidence_kind、suggested_tags、suggested_relations。",
    mentionsExplanation: "列出提及当前笔记标题或别名、但尚未建立链接的笔记。",
    selected: "已选",
    notSelected: "未选",
    modalTagSuggestionsDescription: "建议会优先参考别名、研究分面、现有 vault 标签、正文关键词与引用语境，尽量避免目录路径噪声。",
    modalRelationDescription: "选择要写入 frontmatter 的关系类型。",
    modalManageTagsDescription: "对整个库的原生标签进行重命名、合并或删除。",
    modalSemanticDescription: "基于当前笔记上下文执行你的外部语义命令。",
    tagSuggestionAlias: "别名命中",
    tagSuggestionFacet: "研究分面",
    tagSuggestionKnown: "已有标签",
    tagSuggestionKeyword: "关键词候选",
    tagSuggestionSource: "来源路径",
    tagSuggestionFacetLabel: "分面：{facet}",
    tagSuggestionMatches: "命中：{matches}",
    tagSuggestionSummary: "主推荐是更高置信度的研究标签，补充候选用于提供语境线索，优先勾选主推荐。",
    tagSuggestionPrimaryGroup: "主推荐",
    tagSuggestionSecondaryGroup: "补充候选",
    tagSuggestionEvidence: "依据：{sources}",
    tagSuggestionSourceTitle: "标题",
    tagSuggestionSourceAlias: "别名",
    tagSuggestionSourceHeading: "小节",
    tagSuggestionSourceReference: "引用",
    tagSuggestionSourceContext: "关联语境",
    tagSuggestionSourceBody: "正文",
    tagSuggestionSourcePath: "路径",
    tagSuggestionSourceFacet: "分面词表",
    tagSuggestionSourceVault: "现有标签",
    tagFacetUnclassified: "其他标签",
    modalBlockRefDescription: "选择行段，插入与你旧笔记系统兼容的块引用。",
    modalLineRefDescription: "选择行号范围，插入直接定位的行引用。",
    referenceExistingBlocks: "现有块 ID",
    referenceCreateBlockFromLines: "选择块范围",
    referenceCreateLineFromLines: "选择行号范围",
    referenceStartLine: "起始行",
    referenceEndLine: "结束行",
    referenceNoPreview: "没有可预览内容。",
    referenceTypeBlock: "块引用",
    referenceTypeLine: "行号引用",
    pickBlockRefTarget: "选择块引用目标笔记",
    pickLineRefTarget: "选择行引用目标笔记",
    blockRefInserted: "已插入指向 {title} 的块引用。",
    lineRefInserted: "已插入指向 {title} 的行引用。"
  }
};

const RELATION_KEY_LABELS: Record<string, Record<UILanguage, string>> = {
  related: {
    en: "Related",
    zh: "相关"
  },
  see_also: {
    en: "See also",
    zh: "另见"
  },
  parent: {
    en: "Parent",
    zh: "上位"
  },
  child: {
    en: "Child",
    zh: "下位"
  },
  same_as: {
    en: "Same as",
    zh: "同义 / 等同"
  },
  supports: {
    en: "Supports",
    zh: "支持"
  },
  contradicts: {
    en: "Contradicts",
    zh: "反驳"
  },
  extends: {
    en: "Extends",
    zh: "扩展"
  },
  uses_method: {
    en: "Uses method",
    zh: "使用方法"
  },
  uses_dataset: {
    en: "Uses dataset",
    zh: "使用数据集"
  },
  same_question: {
    en: "Same question",
    zh: "同一研究问题"
  },
  evidence_for: {
    en: "Evidence for",
    zh: "为其提供证据"
  },
  counterargument_to: {
    en: "Counterargument to",
    zh: "反论证于"
  },
  reviews: {
    en: "Reviews",
    zh: "综述"
  },
  inspired_by: {
    en: "Inspired by",
    zh: "受其启发"
  }
};

export function resolveLanguage(setting: LanguageSetting, locale?: string): UILanguage {
  if (setting === "en" || setting === "zh") {
    return setting;
  }
  const detected = (locale ?? globalThis.navigator?.language ?? "en").toLowerCase();
  return detected.startsWith("zh") ? "zh" : "en";
}

export function tr(language: UILanguage, key: TranslationKey, vars?: Record<string, string | number>): string {
  let value = TRANSLATIONS[language][key];
  if (!vars) {
    return value;
  }
  for (const [name, replacement] of Object.entries(vars)) {
    value = value.replace(`{${name}}`, String(replacement));
  }
  return value;
}

export function relationKeyLabel(language: UILanguage, key: string): string {
  return RELATION_KEY_LABELS[key]?.[language] ?? key;
}
