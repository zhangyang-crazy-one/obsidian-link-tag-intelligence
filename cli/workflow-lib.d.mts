export function formatParentheticalCitation(metadata: Record<string, unknown>): string;
export function parseSourceSpecs(text: string, defaultSourceType?: string): Array<Record<string, unknown>>;
export function searchArxivPapers(query: string, maxResults?: number, fetchImpl?: any): Promise<any>;
export function inferResearchTags(topic: string, metadata: Record<string, unknown>): string[];
export function runPaperWorkflow(flags?: Record<string, unknown>, fetchImpl?: any): Promise<any>;
