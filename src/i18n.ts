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
  | "settingsResearchGuideEyebrow"
  | "settingsResearchGuideTitle"
  | "settingsResearchGuideDescription"
  | "settingsResearchLayoutTitle"
  | "settingsResearchLayoutDescription"
  | "settingsResearchPathLiterature"
  | "settingsResearchPathTemplates"
  | "settingsResearchPathAttachments"
  | "settingsResearchWorkflowTitle"
  | "settingsResearchWorkflowDescription"
  | "settingsResearchWorkflowStep1Title"
  | "settingsResearchWorkflowStep1Body"
  | "settingsResearchWorkflowStep2Title"
  | "settingsResearchWorkflowStep2Body"
  | "settingsResearchWorkflowStep3Title"
  | "settingsResearchWorkflowStep3Body"
  | "settingsResearchWorkflowStep4Title"
  | "settingsResearchWorkflowStep4Body"
  | "settingsResearchGuideStep1"
  | "settingsResearchGuideStep2"
  | "settingsResearchGuideStep3"
  | "settingsCompanionPluginsTitle"
  | "settingsCompanionActionLabel"
  | "settingsCompanionZoteroDesc"
  | "settingsCompanionZoteroSetup"
  | "settingsCompanionZoteroAction"
  | "settingsCompanionPdfDesc"
  | "settingsCompanionPdfSetup"
  | "settingsCompanionPdfAction"
  | "settingsCompanionSmartDesc"
  | "settingsCompanionSmartSetup"
  | "settingsCompanionSmartAction"
  | "settingsCompanionSemanticDesc"
  | "settingsCompanionSemanticSetup"
  | "settingsCompanionSemanticAction"
  | "settingsSemanticResearchHint"
  | "settingsWorkbenchEyebrow"
  | "settingsWorkbenchTitle"
  | "settingsWorkbenchDescription"
  | "settingsWorkbenchPreferencesTitle"
  | "settingsWorkbenchPreferencesDescription"
  | "settingsWorkbenchStatReady"
  | "settingsWorkbenchStatMode"
  | "settingsWorkbenchStatIndexer"
  | "settingsWorkbenchStatSemantic"
  | "settingsWorkbenchPageOverview"
  | "settingsWorkbenchPagePlugins"
  | "settingsWorkbenchPageWorkflow"
  | "settingsWorkbenchPageTaxonomy"
  | "settingsWorkbenchOn"
  | "settingsWorkbenchOff"
  | "settingsWorkbenchDetails"
  | "settingsWorkbenchClose"
  | "settingsWorkbenchDrawerEmptyTitle"
  | "settingsWorkbenchDrawerEmptyDescription"
  | "settingsWorkbenchApplyAll"
  | "settingsWorkbenchRefresh"
  | "settingsWorkbenchQuickActionsTitle"
  | "settingsWorkbenchQuickActionsDescription"
  | "settingsWorkbenchActionGroupCaptureTitle"
  | "settingsWorkbenchActionGroupCaptureDescription"
  | "settingsWorkbenchActionGroupRecallTitle"
  | "settingsWorkbenchActionGroupRecallDescription"
  | "settingsWorkbenchActionGroupOrganizeTitle"
  | "settingsWorkbenchActionGroupOrganizeDescription"
  | "settingsWorkbenchActionZoteroTitle"
  | "settingsWorkbenchActionZoteroDescription"
  | "settingsWorkbenchActionSmartTitle"
  | "settingsWorkbenchActionSmartDescription"
  | "settingsWorkbenchActionPanelTitle"
  | "settingsWorkbenchActionPanelDescription"
  | "settingsWorkbenchActionPdfTitle"
  | "settingsWorkbenchActionPdfDescription"
  | "settingsWorkbenchActionTagsTitle"
  | "settingsWorkbenchActionTagsDescription"
  | "settingsWorkbenchActionSuggestTitle"
  | "settingsWorkbenchActionSuggestDescription"
  | "settingsWorkbenchActionSemanticTitle"
  | "settingsWorkbenchActionSemanticDescription"
  | "settingsWorkbenchCompanionTitle"
  | "settingsWorkbenchCompanionDescription"
  | "settingsWorkbenchInstalled"
  | "settingsWorkbenchEnabled"
  | "settingsWorkbenchYes"
  | "settingsWorkbenchNo"
  | "settingsWorkbenchMismatchCount"
  | "settingsWorkbenchMismatchTitle"
  | "settingsWorkbenchApplyCompanion"
  | "settingsWorkbenchOpenSettings"
  | "settingsWorkbenchConfigTitle"
  | "settingsWorkbenchConfigDescription"
  | "settingsWorkbenchPathsTitle"
  | "settingsWorkbenchPathsDescription"
  | "settingsWorkbenchOpenImportedTitle"
  | "settingsWorkbenchOpenImportedDescription"
  | "settingsWorkbenchRecallTitle"
  | "settingsWorkbenchRecallDescription"
  | "settingsWorkbenchFolderExclusionsTitle"
  | "settingsWorkbenchFolderExclusionsDescription"
  | "settingsWorkbenchHeadingExclusionsTitle"
  | "settingsWorkbenchHeadingExclusionsDescription"
  | "settingsWorkbenchResultsLimitTitle"
  | "settingsWorkbenchSemanticTitle"
  | "settingsWorkbenchSemanticDescription"
  | "settingsWorkbenchConfigHint"
  | "settingsWorkbenchCurrentExclusions"
  | "settingsWorkbenchAdvancedTitle"
  | "settingsWorkbenchAdvancedDescription"
  | "settingsWorkbenchAdvancedRelationsTitle"
  | "settingsWorkbenchAdvancedRelationsDescription"
  | "settingsWorkbenchAdvancedAliasTitle"
  | "settingsWorkbenchAdvancedAliasDescription"
  | "settingsWorkbenchAdvancedFacetTitle"
  | "settingsWorkbenchAdvancedFacetDescription"
  | "settingsWorkbenchAdvancedMemoryTitle"
  | "settingsWorkbenchAdvancedMemoryDescription"
  | "settingsWorkbenchDefaultDisplayTitle"
  | "settingsWorkbenchCopyCommandsTitle"
  | "settingsWorkbenchHoverPreviewTitle"
  | "settingsWorkbenchBacklinksTitle"
  | "settingsWorkbenchLanguageTitle"
  | "settingsWorkbenchExpectedPrefix"
  | "settingsWorkbenchRunZotero"
  | "settingsWorkbenchRunSmart"
  | "settingsWorkbenchRunSemantic"
  | "settingsWorkbenchRunPdf"
  | "settingsWorkbenchStatusReady"
  | "settingsWorkbenchStatusMissing"
  | "settingsWorkbenchStatusOptional"
  | "settingsWorkbenchStatusAttention"
  | "settingsWorkbenchMismatchZoteroFolder"
  | "settingsWorkbenchMismatchZoteroTemplate"
  | "settingsWorkbenchMismatchZoteroAttachments"
  | "settingsWorkbenchMismatchZoteroOpen"
  | "settingsWorkbenchMismatchZoteroOutput"
  | "settingsWorkbenchMismatchZoteroCite"
  | "settingsWorkbenchMismatchPdfDisplayFormats"
  | "settingsWorkbenchMismatchPdfDisplayDefault"
  | "settingsWorkbenchMismatchPdfCopy"
  | "settingsWorkbenchMismatchPdfHover"
  | "settingsWorkbenchMismatchPdfBacklinks"
  | "settingsWorkbenchMismatchPdfSelectionMenu"
  | "settingsWorkbenchMismatchPdfAnnotationMenu"
  | "settingsWorkbenchMismatchSmartLanguage"
  | "settingsWorkbenchMismatchSmartFolders"
  | "settingsWorkbenchMismatchSmartHeadings"
  | "settingsWorkbenchMismatchSmartResults"
  | "settingsWorkbenchMismatchSmartRender"
  | "settingsWorkbenchMismatchSemanticCommand"
  | "settingsWorkbenchPresetApplied"
  | "settingsWorkbenchCompanionApplied"
  | "settingsWorkbenchPluginMissing"
  | "settingsWorkbenchSettingsUnavailable"
  | "settingsWorkbenchCommandUnavailable"
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
    settingsResearchGuideEyebrow: "Research stack",
    settingsResearchGuideTitle: "Research workflow guide",
    settingsResearchGuideDescription: "This mode is designed for literature notes, evidence gathering, synthesis, and drafting. Keep exact references, typed relations, and controlled tags aligned.",
    settingsResearchLayoutTitle: "Vault layout",
    settingsResearchLayoutDescription: "Keep the workflow within a shallow 3-level structure so Zotero imports, templates, and attachments stay predictable across plugins and CLI tools.",
    settingsResearchPathLiterature: "Literature notes",
    settingsResearchPathTemplates: "Template",
    settingsResearchPathAttachments: "Annotation assets",
    settingsResearchWorkflowTitle: "Working sequence",
    settingsResearchWorkflowDescription: "A practical loop for capture, page-aware reading, argument linking, and drafting.",
    settingsResearchWorkflowStep1Title: "Import source notes",
    settingsResearchWorkflowStep1Body: "Use Zotero Integration to create one structured literature note per citekey.",
    settingsResearchWorkflowStep2Title: "Quote with page context",
    settingsResearchWorkflowStep2Body: "Use PDF++ copy actions to move exact page evidence into literature notes or draft notes.",
    settingsResearchWorkflowStep3Title: "Link claims and tags",
    settingsResearchWorkflowStep3Body: "Use typed relations and controlled bilingual tags to connect source notes, evidence, and arguments.",
    settingsResearchWorkflowStep4Title: "Retrieve while drafting",
    settingsResearchWorkflowStep4Body: "Use Smart Connections for local semantic recall, and enable the external semantic bridge only when you have a research CLI ready.",
    settingsResearchGuideStep1: "Use Zotero Integration or PDF++ to capture source material and page-level annotations.",
    settingsResearchGuideStep2: "Use typed relations like supports / contradicts / extends to connect notes and claims.",
    settingsResearchGuideStep3: "Maintain controlled topic, method, dataset, status, and writing-stage tags to keep recommendation quality high.",
    settingsCompanionPluginsTitle: "Recommended companion plugins",
    settingsCompanionActionLabel: "What to click",
    settingsCompanionZoteroDesc: "Bring in citekeys, literature-note metadata, and source annotations.",
    settingsCompanionZoteroSetup: "Configured to write notes into {literaturePath}, use template {templatePath}, and save exported images under {attachmentsPath}.",
    settingsCompanionZoteroAction: "Command palette -> Zotero Integration: Import notes",
    settingsCompanionPdfDesc: "Work with PDF highlights, page jumps, and annotation-heavy reading workflows.",
    settingsCompanionPdfSetup: "Configured for page-aware quote and cite-callout copy commands, with bibliography hover kept active for citation-heavy reading.",
    settingsCompanionPdfAction: "Open a PDF -> select text -> choose a PDF++ copy format",
    settingsCompanionSmartDesc: "Add embeddings-based semantic recall without duplicating this plugin's link and tag layer.",
    settingsCompanionSmartSetup: "Configured to keep system and archive folders out of the index: {exclusions}. Keep the local embedding model unless you intentionally re-index.",
    settingsCompanionSmartAction: "Open Smart Connections and wait for the first local index to finish",
    settingsCompanionSemanticDesc: "Use your own research-aware retrieval command when you want citation-grounded semantic results.",
    settingsCompanionSemanticSetup: "Optional. Only enable after your external command can return JSON fields like citekey, author, year, page, suggested_tags, and suggested_relations.",
    settingsCompanionSemanticAction: "Paste the command below, then enable Semantic bridge",
    settingsSemanticResearchHint: "Recommended semantic result fields: citekey, author, year, page, source_type, evidence_kind, suggested_tags, suggested_relations.",
    settingsWorkbenchEyebrow: "Research workbench",
    settingsWorkbenchTitle: "Research workflow control center",
    settingsWorkbenchDescription: "Inspect companion plugins, sync critical research settings, and launch the next reading or writing step from one place.",
    settingsWorkbenchPreferencesTitle: "Workbench preferences",
    settingsWorkbenchPreferencesDescription: "Keep language and default mode in the detail drawer, not on the dashboard.",
    settingsWorkbenchStatReady: "Ready companions",
    settingsWorkbenchStatMode: "Workflow mode",
    settingsWorkbenchStatIndexer: "Detected plugins",
    settingsWorkbenchStatSemantic: "Semantic bridge",
    settingsWorkbenchPageOverview: "Overview",
    settingsWorkbenchPagePlugins: "Plugins",
    settingsWorkbenchPageWorkflow: "Workflow",
    settingsWorkbenchPageTaxonomy: "Taxonomy",
    settingsWorkbenchOn: "On",
    settingsWorkbenchOff: "Off",
    settingsWorkbenchDetails: "Details",
    settingsWorkbenchClose: "Close",
    settingsWorkbenchDrawerEmptyTitle: "Choose a module",
    settingsWorkbenchDrawerEmptyDescription: "Open a dashboard card, workflow module, or plugin row to inspect and edit the detailed configuration here.",
    settingsWorkbenchApplyAll: "Sync preset",
    settingsWorkbenchRefresh: "Refresh",
    settingsWorkbenchQuickActionsTitle: "Workflow entry points",
    settingsWorkbenchQuickActionsDescription: "Group high-frequency actions by capture, recall, and organization so the workbench stays readable.",
    settingsWorkbenchActionGroupCaptureTitle: "Capture & import",
    settingsWorkbenchActionGroupCaptureDescription: "Keep literature import and PDF reading tools together.",
    settingsWorkbenchActionGroupRecallTitle: "Recall & retrieval",
    settingsWorkbenchActionGroupRecallDescription: "Open semantic views and current-note intelligence without leaving the workbench.",
    settingsWorkbenchActionGroupOrganizeTitle: "Tags & structure",
    settingsWorkbenchActionGroupOrganizeDescription: "Clean native tags and keep controlled suggestions aligned while drafting.",
    settingsWorkbenchActionZoteroTitle: "Import Zotero notes",
    settingsWorkbenchActionZoteroDescription: "Run the import command directly.",
    settingsWorkbenchActionSmartTitle: "Open Smart Connections",
    settingsWorkbenchActionSmartDescription: "Jump into local semantic recall.",
    settingsWorkbenchActionPanelTitle: "Open intelligence panel",
    settingsWorkbenchActionPanelDescription: "Open links, references, and current-note context.",
    settingsWorkbenchActionPdfTitle: "Check PDF++",
    settingsWorkbenchActionPdfDescription: "Verify copy formats and reading behavior.",
    settingsWorkbenchActionTagsTitle: "Manage vault tags",
    settingsWorkbenchActionTagsDescription: "Clean native tags in place.",
    settingsWorkbenchActionSuggestTitle: "Suggest tags for note",
    settingsWorkbenchActionSuggestDescription: "Generate bilingual controlled-tag suggestions.",
    settingsWorkbenchActionSemanticTitle: "Run semantic search",
    settingsWorkbenchActionSemanticDescription: "Launch the external citation-aware retrieval bridge.",
    settingsWorkbenchCompanionTitle: "Companion stack",
    settingsWorkbenchCompanionDescription: "Each row shows install state and whether the plugin is aligned with this vault's research preset.",
    settingsWorkbenchInstalled: "Installed",
    settingsWorkbenchEnabled: "Enabled",
    settingsWorkbenchYes: "Yes",
    settingsWorkbenchNo: "No",
    settingsWorkbenchMismatchCount: "{count} issues",
    settingsWorkbenchMismatchTitle: "Needs attention",
    settingsWorkbenchApplyCompanion: "Apply preset",
    settingsWorkbenchOpenSettings: "Open settings",
    settingsWorkbenchConfigTitle: "Workflow configuration",
    settingsWorkbenchConfigDescription: "Edit the research-critical defaults that control imports, local indexing, and the optional semantic bridge.",
    settingsWorkbenchPathsTitle: "Workspace paths",
    settingsWorkbenchPathsDescription: "Keep note, template, and attachment paths stable so imports and citations remain predictable.",
    settingsWorkbenchOpenImportedTitle: "Open imported note",
    settingsWorkbenchOpenImportedDescription: "When enabled, Zotero imports should open the latest created note immediately.",
    settingsWorkbenchRecallTitle: "Semantic recall scope",
    settingsWorkbenchRecallDescription: "Define what Smart Connections should skip and how many results it should return.",
    settingsWorkbenchFolderExclusionsTitle: "Folder exclusions",
    settingsWorkbenchFolderExclusionsDescription: "Comma or newline separated folders excluded from the semantic index.",
    settingsWorkbenchHeadingExclusionsTitle: "Heading exclusions",
    settingsWorkbenchHeadingExclusionsDescription: "Comma or newline separated headings that should not be embedded.",
    settingsWorkbenchResultsLimitTitle: "Semantic results limit",
    settingsWorkbenchSemanticTitle: "External semantic bridge",
    settingsWorkbenchSemanticDescription: "Keep this optional and enable it only when your research CLI returns structured citation fields.",
    settingsWorkbenchConfigHint: "Edit here, then sync the preset or apply the matching companion preset.",
    settingsWorkbenchCurrentExclusions: "Current normalized exclusions: {value}",
    settingsWorkbenchAdvancedTitle: "Advanced taxonomy",
    settingsWorkbenchAdvancedDescription: "Keep the dashboard clean and expand these panels only when relation keys or JSON vocabularies need tuning.",
    settingsWorkbenchAdvancedRelationsTitle: "Typed relations",
    settingsWorkbenchAdvancedRelationsDescription: "Frontmatter keys for argument and evidence links.",
    settingsWorkbenchAdvancedAliasTitle: "Tag alias map",
    settingsWorkbenchAdvancedAliasDescription: "Canonical tags and bilingual aliases.",
    settingsWorkbenchAdvancedFacetTitle: "Facet vocabulary",
    settingsWorkbenchAdvancedFacetDescription: "Topic, method, dataset, status, and writing-stage facets.",
    settingsWorkbenchAdvancedMemoryTitle: "Recent link memory",
    settingsWorkbenchAdvancedMemoryDescription: "How many recent targets should stay in quick recall.",
    settingsWorkbenchDefaultDisplayTitle: "Default display",
    settingsWorkbenchCopyCommandsTitle: "Research copy formats",
    settingsWorkbenchHoverPreviewTitle: "Hover preview action",
    settingsWorkbenchBacklinksTitle: "Backlink highlighting",
    settingsWorkbenchLanguageTitle: "Index language",
    settingsWorkbenchExpectedPrefix: "Expected",
    settingsWorkbenchRunZotero: "Run import",
    settingsWorkbenchRunSmart: "Open view",
    settingsWorkbenchRunSemantic: "Run search",
    settingsWorkbenchRunPdf: "Inspect PDF++",
    settingsWorkbenchStatusReady: "Ready",
    settingsWorkbenchStatusMissing: "Missing",
    settingsWorkbenchStatusOptional: "Optional",
    settingsWorkbenchStatusAttention: "Needs sync",
    settingsWorkbenchMismatchZoteroFolder: "Literature-note folder does not match the workspace path.",
    settingsWorkbenchMismatchZoteroTemplate: "Zotero export template path is not aligned.",
    settingsWorkbenchMismatchZoteroAttachments: "Zotero image export folder does not match the workspace attachments path.",
    settingsWorkbenchMismatchZoteroOpen: "Zotero import open-note behavior differs from this workbench setting.",
    settingsWorkbenchMismatchZoteroOutput: "Zotero output path template is not using the expected citekey layout.",
    settingsWorkbenchMismatchZoteroCite: "Zotero cite template is not the expected literature-note link format.",
    settingsWorkbenchMismatchPdfDisplayFormats: "Required PDF display formats are missing.",
    settingsWorkbenchMismatchPdfDisplayDefault: "PDF++ default display is not set to “Title & page”.",
    settingsWorkbenchMismatchPdfCopy: "Required research copy commands are missing.",
    settingsWorkbenchMismatchPdfHover: "PDF++ hover action should be set to preview.",
    settingsWorkbenchMismatchPdfBacklinks: "PDF++ backlink highlighting should stay enabled.",
    settingsWorkbenchMismatchPdfSelectionMenu: "PDF++ selection menu should expose copy-format and display controls.",
    settingsWorkbenchMismatchPdfAnnotationMenu: "PDF++ annotation menu should expose copy-format and display controls.",
    settingsWorkbenchMismatchSmartLanguage: "Smart Connections language does not match the workbench language.",
    settingsWorkbenchMismatchSmartFolders: "Smart Connections folder exclusions are out of sync.",
    settingsWorkbenchMismatchSmartHeadings: "Smart Connections heading exclusions are out of sync.",
    settingsWorkbenchMismatchSmartResults: "Smart Connections results limit is not aligned.",
    settingsWorkbenchMismatchSmartRender: "Smart Connections should keep markdown rendering enabled in results.",
    settingsWorkbenchMismatchSemanticCommand: "Semantic bridge is enabled but the command is empty.",
    settingsWorkbenchPresetApplied: "Research preset synced to installed companion plugins.",
    settingsWorkbenchCompanionApplied: "Applied the recommended configuration for {name}.",
    settingsWorkbenchPluginMissing: "That companion plugin is not installed in the current vault.",
    settingsWorkbenchSettingsUnavailable: "Obsidian settings could not be opened programmatically.",
    settingsWorkbenchCommandUnavailable: "The companion command is not available in this vault.",
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
    settingsResearchGuideEyebrow: "研究栈",
    settingsResearchGuideTitle: "研究工作流指南",
    settingsResearchGuideDescription: "该模式面向文献笔记、证据采集、综合整理与论文写作。尽量让精确引用、关系类型与受控标签保持一致。",
    settingsResearchLayoutTitle: "目录布局",
    settingsResearchLayoutDescription: "保持 3 层以内的浅层结构，让 Zotero 导入、模板和批注附件路径在插件与 CLI 之间长期稳定。",
    settingsResearchPathLiterature: "文献笔记",
    settingsResearchPathTemplates: "模板",
    settingsResearchPathAttachments: "批注附件",
    settingsResearchWorkflowTitle: "工作顺序",
    settingsResearchWorkflowDescription: "围绕采集、带页码阅读、论证连接和写作检索的一条实用闭环。",
    settingsResearchWorkflowStep1Title: "导入来源笔记",
    settingsResearchWorkflowStep1Body: "用 Zotero Integration 以 citekey 为单位生成结构化文献笔记。",
    settingsResearchWorkflowStep2Title: "复制带页码证据",
    settingsResearchWorkflowStep2Body: "用 PDF++ 的复制动作把精确页码证据带入文献笔记或草稿笔记。",
    settingsResearchWorkflowStep3Title: "补关系与标签",
    settingsResearchWorkflowStep3Body: "用关系键和中英文受控标签连接来源、证据与论点。",
    settingsResearchWorkflowStep4Title: "写作时再检索",
    settingsResearchWorkflowStep4Body: "用 Smart Connections 做本地语义召回；只有在研究 CLI 准备好后再启用外部语义桥接。",
    settingsResearchGuideStep1: "用 Zotero Integration 或 PDF++ 采集文献元数据、页码定位和批注内容。",
    settingsResearchGuideStep2: "用 supports / contradicts / extends 等关系连接文献、观点和证据。",
    settingsResearchGuideStep3: "维护 topic、method、dataset、status、writing-stage 等受控标签，能显著提升推荐质量。",
    settingsCompanionPluginsTitle: "推荐搭配插件",
    settingsCompanionActionLabel: "在 Obsidian 里点击",
    settingsCompanionZoteroDesc: "导入 citekey、文献笔记元数据和来源批注。",
    settingsCompanionZoteroSetup: "已配置为把笔记写入 {literaturePath}，使用模板 {templatePath}，并把导出的批注图片存到 {attachmentsPath}。",
    settingsCompanionZoteroAction: "命令面板 -> Zotero Integration: Import notes",
    settingsCompanionPdfDesc: "处理 PDF 高亮、页码跳转和重标注阅读流程。",
    settingsCompanionPdfSetup: "已配置为适合研究摘录的页码引用与 cite callout 复制动作，并保留引文悬停预览。",
    settingsCompanionPdfAction: "打开 PDF -> 选中文本 -> 选择 PDF++ 复制格式",
    settingsCompanionSmartDesc: "提供 embedding 语义召回，同时不与本插件的链接与标签层重复。",
    settingsCompanionSmartSetup: "已配置为把系统目录和归档目录排除出索引：{exclusions}。本地 embedding 模型保持默认，避免误触发整库重建。",
    settingsCompanionSmartAction: "打开 Smart Connections，并等待第一次本地索引完成",
    settingsCompanionSemanticDesc: "当你需要可控的研究检索协议时，使用自己的研究型外部命令。",
    settingsCompanionSemanticSetup: "这是可选项。只有当外部命令能返回 citekey、author、year、page、suggested_tags、suggested_relations 等 JSON 字段时再开启。",
    settingsCompanionSemanticAction: "先填入命令，再启用语义桥接",
    settingsSemanticResearchHint: "推荐语义结果字段：citekey、author、year、page、source_type、evidence_kind、suggested_tags、suggested_relations。",
    settingsWorkbenchEyebrow: "研究工作台",
    settingsWorkbenchTitle: "研究工作流控制中心",
    settingsWorkbenchDescription: "在一个页面内查看 companion 状态、同步关键研究配置，并直接开始下一步导入、检索或整理。",
    settingsWorkbenchPreferencesTitle: "工作台偏好",
    settingsWorkbenchPreferencesDescription: "把语言和默认模式收进右侧详情区，不再占首页空间。",
    settingsWorkbenchStatReady: "已就绪插件",
    settingsWorkbenchStatMode: "工作模式",
    settingsWorkbenchStatIndexer: "已检测插件",
    settingsWorkbenchStatSemantic: "语义桥接",
    settingsWorkbenchPageOverview: "总览",
    settingsWorkbenchPagePlugins: "插件",
    settingsWorkbenchPageWorkflow: "工作流",
    settingsWorkbenchPageTaxonomy: "词表",
    settingsWorkbenchOn: "开启",
    settingsWorkbenchOff: "关闭",
    settingsWorkbenchDetails: "详情",
    settingsWorkbenchClose: "关闭",
    settingsWorkbenchDrawerEmptyTitle: "选择一个模块",
    settingsWorkbenchDrawerEmptyDescription: "点击左侧的摘要卡、工作流模块或插件行，就会在这里打开对应详情与编辑项。",
    settingsWorkbenchApplyAll: "同步预设",
    settingsWorkbenchRefresh: "刷新",
    settingsWorkbenchQuickActionsTitle: "工作流入口",
    settingsWorkbenchQuickActionsDescription: "按采集、召回、整理分组展示高频动作，避免首页继续被长按钮挤满。",
    settingsWorkbenchActionGroupCaptureTitle: "采集与导入",
    settingsWorkbenchActionGroupCaptureDescription: "把文献导入与 PDF 阅读工具放在一起。",
    settingsWorkbenchActionGroupRecallTitle: "检索与召回",
    settingsWorkbenchActionGroupRecallDescription: "集中打开语义检索、上下文侧栏和召回视图。",
    settingsWorkbenchActionGroupOrganizeTitle: "标签与结构",
    settingsWorkbenchActionGroupOrganizeDescription: "在整理笔记时同步维护原生标签和受控标签建议。",
    settingsWorkbenchActionZoteroTitle: "导入 Zotero 笔记",
    settingsWorkbenchActionZoteroDescription: "直接执行导入命令。",
    settingsWorkbenchActionSmartTitle: "打开 Smart Connections",
    settingsWorkbenchActionSmartDescription: "直接进入本地语义召回视图。",
    settingsWorkbenchActionPanelTitle: "打开智能侧栏",
    settingsWorkbenchActionPanelDescription: "打开链接、引用与当前笔记上下文侧栏。",
    settingsWorkbenchActionPdfTitle: "检查 PDF++",
    settingsWorkbenchActionPdfDescription: "确认复制格式和阅读行为。",
    settingsWorkbenchActionTagsTitle: "管理原生标签",
    settingsWorkbenchActionTagsDescription: "就地清理和整理 Obsidian 标签。",
    settingsWorkbenchActionSuggestTitle: "推荐当前笔记标签",
    settingsWorkbenchActionSuggestDescription: "生成中英文受控标签推荐。",
    settingsWorkbenchActionSemanticTitle: "运行语义检索",
    settingsWorkbenchActionSemanticDescription: "启动外部带引文语境的检索桥接。",
    settingsWorkbenchCompanionTitle: "研究插件栈",
    settingsWorkbenchCompanionDescription: "每一行显示插件是否可用，以及是否已与当前研究预设保持一致。",
    settingsWorkbenchInstalled: "已安装",
    settingsWorkbenchEnabled: "已启用",
    settingsWorkbenchYes: "是",
    settingsWorkbenchNo: "否",
    settingsWorkbenchMismatchCount: "{count} 项待同步",
    settingsWorkbenchMismatchTitle: "需要处理",
    settingsWorkbenchApplyCompanion: "应用预设",
    settingsWorkbenchOpenSettings: "打开设置",
    settingsWorkbenchConfigTitle: "工作流配置",
    settingsWorkbenchConfigDescription: "这里维护导入、索引和外部语义桥接最关键的研究默认值。",
    settingsWorkbenchPathsTitle: "研究路径",
    settingsWorkbenchPathsDescription: "保持笔记、模板和附件路径稳定，导入和引用才会长期可预测。",
    settingsWorkbenchOpenImportedTitle: "导入后打开笔记",
    settingsWorkbenchOpenImportedDescription: "开启后，Zotero 导入会自动打开最新生成的文献笔记。",
    settingsWorkbenchRecallTitle: "语义召回范围",
    settingsWorkbenchRecallDescription: "控制 Smart Connections 跳过哪些内容，以及单次返回多少结果。",
    settingsWorkbenchFolderExclusionsTitle: "排除文件夹",
    settingsWorkbenchFolderExclusionsDescription: "用逗号或换行分隔，需要排除出语义索引的文件夹。",
    settingsWorkbenchHeadingExclusionsTitle: "排除标题",
    settingsWorkbenchHeadingExclusionsDescription: "用逗号或换行分隔，不需要进入 embedding 的标题。",
    settingsWorkbenchResultsLimitTitle: "语义结果上限",
    settingsWorkbenchSemanticTitle: "外部语义桥接",
    settingsWorkbenchSemanticDescription: "这是可选层。只有研究 CLI 能返回结构化引文字段时再开启。",
    settingsWorkbenchConfigHint: "在这里修改后，同步总预设，或对单个 companion 应用对应预设。",
    settingsWorkbenchCurrentExclusions: "当前标准化排除项：{value}",
    settingsWorkbenchAdvancedTitle: "高级词表",
    settingsWorkbenchAdvancedDescription: "默认保持首页清爽；只有在需要调整关系键或大段 JSON 词表时，再展开这些面板。",
    settingsWorkbenchAdvancedRelationsTitle: "关系类型",
    settingsWorkbenchAdvancedRelationsDescription: "用于论点、证据和来源之间的 frontmatter 关系键。",
    settingsWorkbenchAdvancedAliasTitle: "标签别名映射",
    settingsWorkbenchAdvancedAliasDescription: "维护规范标签与中英文别名。",
    settingsWorkbenchAdvancedFacetTitle: "标签分面词表",
    settingsWorkbenchAdvancedFacetDescription: "维护 topic、method、dataset、status、writing-stage 等研究分面。",
    settingsWorkbenchAdvancedMemoryTitle: "近期链接记忆",
    settingsWorkbenchAdvancedMemoryDescription: "控制快速召回中保留多少个最近目标。",
    settingsWorkbenchDefaultDisplayTitle: "默认显示格式",
    settingsWorkbenchCopyCommandsTitle: "研究复制格式",
    settingsWorkbenchHoverPreviewTitle: "悬停预览动作",
    settingsWorkbenchBacklinksTitle: "反链高亮",
    settingsWorkbenchLanguageTitle: "索引语言",
    settingsWorkbenchExpectedPrefix: "期望值",
    settingsWorkbenchRunZotero: "执行导入",
    settingsWorkbenchRunSmart: "打开视图",
    settingsWorkbenchRunSemantic: "执行检索",
    settingsWorkbenchRunPdf: "检查 PDF++",
    settingsWorkbenchStatusReady: "已就绪",
    settingsWorkbenchStatusMissing: "未安装",
    settingsWorkbenchStatusOptional: "可选",
    settingsWorkbenchStatusAttention: "待同步",
    settingsWorkbenchMismatchZoteroFolder: "文献笔记目录与工作台路径不一致。",
    settingsWorkbenchMismatchZoteroTemplate: "Zotero 导出模板路径未对齐。",
    settingsWorkbenchMismatchZoteroAttachments: "Zotero 图片导出目录与工作台附件路径不一致。",
    settingsWorkbenchMismatchZoteroOpen: "Zotero 导入后打开笔记的行为与当前设置不同。",
    settingsWorkbenchMismatchZoteroOutput: "Zotero 输出路径模板没有使用预期的 citekey 布局。",
    settingsWorkbenchMismatchZoteroCite: "Zotero 引文模板不是预期的文献笔记链接格式。",
    settingsWorkbenchMismatchPdfDisplayFormats: "缺少研究工作流需要的 PDF 显示格式。",
    settingsWorkbenchMismatchPdfDisplayDefault: "PDF++ 默认显示格式应为“Title & page”。",
    settingsWorkbenchMismatchPdfCopy: "缺少研究摘录所需的复制命令。",
    settingsWorkbenchMismatchPdfHover: "PDF++ 悬停动作应设置为 preview。",
    settingsWorkbenchMismatchPdfBacklinks: "PDF++ 应保持反链高亮开启。",
    settingsWorkbenchMismatchPdfSelectionMenu: "PDF++ 选中文本菜单应包含 copy-format 和 display。",
    settingsWorkbenchMismatchPdfAnnotationMenu: "PDF++ 批注菜单应包含 copy-format 和 display。",
    settingsWorkbenchMismatchSmartLanguage: "Smart Connections 的语言设置与工作台不一致。",
    settingsWorkbenchMismatchSmartFolders: "Smart Connections 的文件夹排除项未同步。",
    settingsWorkbenchMismatchSmartHeadings: "Smart Connections 的标题排除项未同步。",
    settingsWorkbenchMismatchSmartResults: "Smart Connections 的结果上限未对齐。",
    settingsWorkbenchMismatchSmartRender: "Smart Connections 应保持结果中的 Markdown 渲染开启。",
    settingsWorkbenchMismatchSemanticCommand: "语义桥接已开启，但命令仍为空。",
    settingsWorkbenchPresetApplied: "已将研究预设同步到已安装的 companion 插件。",
    settingsWorkbenchCompanionApplied: "已为 {name} 应用推荐配置。",
    settingsWorkbenchPluginMissing: "当前 vault 中没有安装这个 companion 插件。",
    settingsWorkbenchSettingsUnavailable: "无法通过程序方式打开 Obsidian 设置页。",
    settingsWorkbenchCommandUnavailable: "当前 vault 中没有找到可执行的 companion 命令。",
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
