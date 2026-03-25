export type ViewRefreshReason = "context" | "metadata" | "mutation" | "settings";

export interface ViewRefreshRequest {
  reason: ViewRefreshReason;
  changedPaths?: string[];
  focusSectionId?: string;
  force?: boolean;
  preserveScroll?: boolean;
}

const REFRESH_REASON_PRIORITY: Record<ViewRefreshReason, number> = {
  metadata: 0,
  mutation: 1,
  context: 2,
  settings: 3
};

function dedupePaths(paths: string[] | undefined): string[] | undefined {
  if (!paths || paths.length === 0) {
    return undefined;
  }

  const unique = [...new Set(paths.filter((path) => path.length > 0))];
  return unique.length > 0 ? unique : undefined;
}

export function mergeViewRefreshRequests(
  current: ViewRefreshRequest | null,
  next: ViewRefreshRequest
): ViewRefreshRequest {
  if (!current) {
    return {
      ...next,
      changedPaths: dedupePaths(next.changedPaths)
    };
  }

  const reason = REFRESH_REASON_PRIORITY[next.reason] >= REFRESH_REASON_PRIORITY[current.reason]
    ? next.reason
    : current.reason;

  return {
    reason,
    changedPaths: dedupePaths([...(current.changedPaths ?? []), ...(next.changedPaths ?? [])]),
    focusSectionId: next.focusSectionId ?? current.focusSectionId,
    force: Boolean(current.force || next.force),
    preserveScroll: Boolean(current.preserveScroll || next.preserveScroll)
  };
}

export function shouldHandleViewRefresh(
  request: ViewRefreshRequest,
  dependencyPaths: Iterable<string>
): boolean {
  if (request.force || request.reason !== "metadata") {
    return true;
  }

  if (!request.changedPaths || request.changedPaths.length === 0) {
    return true;
  }

  const dependencies = new Set(dependencyPaths);
  if (dependencies.size === 0) {
    return true;
  }

  return request.changedPaths.some((path) => dependencies.has(path));
}
