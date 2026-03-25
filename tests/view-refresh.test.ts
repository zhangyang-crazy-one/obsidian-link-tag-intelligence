import { describe, expect, it } from "vitest";

import {
  mergeViewRefreshRequests,
  shouldHandleViewRefresh,
  type ViewRefreshRequest
} from "../src/view-refresh";

describe("mergeViewRefreshRequests", () => {
  it("keeps the higher-priority reason and merges paths", () => {
    const current: ViewRefreshRequest = {
      reason: "metadata",
      changedPaths: ["Knowledge/A.md"],
      preserveScroll: true
    };

    const merged = mergeViewRefreshRequests(current, {
      reason: "context",
      changedPaths: ["Knowledge/B.md", "Knowledge/A.md"],
      focusSectionId: "tags"
    });

    expect(merged).toEqual({
      reason: "context",
      changedPaths: ["Knowledge/A.md", "Knowledge/B.md"],
      focusSectionId: "tags",
      force: false,
      preserveScroll: true
    });
  });

  it("returns the normalized next request when no current request exists", () => {
    const merged = mergeViewRefreshRequests(null, {
      reason: "mutation",
      changedPaths: ["", "Knowledge/A.md", "Knowledge/A.md"],
      force: true
    });

    expect(merged).toEqual({
      reason: "mutation",
      changedPaths: ["Knowledge/A.md"],
      force: true
    });
  });
});

describe("shouldHandleViewRefresh", () => {
  it("always accepts forced or non-metadata refreshes", () => {
    expect(shouldHandleViewRefresh({ reason: "context" }, [])).toBe(true);
    expect(shouldHandleViewRefresh({ reason: "metadata", force: true }, [])).toBe(true);
  });

  it("filters metadata refreshes by dependency path membership", () => {
    const dependencies = ["Knowledge/A.md", "Knowledge/B.md"];

    expect(
      shouldHandleViewRefresh(
        { reason: "metadata", changedPaths: ["Knowledge/C.md"] },
        dependencies
      )
    ).toBe(false);

    expect(
      shouldHandleViewRefresh(
        { reason: "metadata", changedPaths: ["Knowledge/C.md", "Knowledge/B.md"] },
        dependencies
      )
    ).toBe(true);
  });
});
