export class CliCommandError extends Error {
  code: string;
  details?: Record<string, unknown>;
}

export function inspectReferenceRange(options?: Record<string, unknown>): Promise<Record<string, unknown>>;
export function locateReferenceRanges(options?: Record<string, unknown>): Promise<Record<string, unknown>>;
export function formatReferenceRange(options?: Record<string, unknown>): Promise<Record<string, unknown>>;
