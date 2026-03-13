export class App {}
export class CachedMetadata {}
export class MarkdownView {}
export class WorkspaceLeaf {}
export class HoverPopover {}
export class MarkdownRenderChild {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class ItemView {}
export class Modal {}
export class SuggestModal<T = unknown> {
  protected _placeholder?: T;
}
export class Notice {}
export class TFile {
  path = "";
  basename = "";
  name = "";
}

export class FileSystemAdapter {}

export const Platform = {
  isDesktopApp: true
};

export const editorInfoField = {};

export function prepareFuzzySearch(_query: string): (input: string) => boolean {
  return (input: string) => input.length >= 0;
}

export function resolveSubpath(path: string): { path: string } {
  return { path };
}
