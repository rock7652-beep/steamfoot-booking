import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { operationGuides } from "../lib/operation-guide";
import { coursePortalGuides } from "../lib/course-portal-guides";

const state = JSON.parse(readFileSync("docs/operation-guide-audit-state.json", "utf8"));

describe("scoped guide correction audit accounting", () => {
  it("counts unique existing articles and pending IDs without treating source review as acceptance", () => {
    expect(state.articleCount).toBe(operationGuides.length);
    expect(state.frontendArticleCount).toBe(coursePortalGuides.length);
    const pending = new Set<string>(state.interactionPendingGuideIds);
    const frontendPending = new Set<string>(state.frontendInteractionPendingGuideIds);
    expect(pending.size).toBe(state.interactionPendingGuideIds.length);
    expect(frontendPending.size).toBe(state.frontendInteractionPendingGuideIds.length);
    expect(state.backendInteractionPendingCount).toBe(pending.size);
    expect(state.totalInteractionPendingCount).toBe(pending.size + frontendPending.size);
    expect(state.totalInteractionPendingCount).toBe(174);
    for (const id of pending) expect(operationGuides.some(g => g.id === id), id).toBe(true);
    for (const id of frontendPending) expect(coursePortalGuides.some(g => g.id === id), id).toBe(true);
    for (const id of [...state.newGuideIds, ...state.updatedGuideIds]) {
      expect(pending.has(id), id).toBe(true);
      expect(operationGuides.find(g => g.id === id)?.verification).toBe("source-reviewed");
    }
    expect(state.allArticlesInteractionVerified).toBe(false);
    expect(state.allSystemCoverageComplete).toBe(false);
  });

  it("preserves the dated 171-item baseline and separates current-source corrections", () => {
    expect(state.previousBatchReview.totalInteractionPendingCount).toBe(171);
    expect(state.scopedCorrectionReview.newPendingGuideIds).toEqual(["O09", "O10", "F03"]);
    expect(state.newGuideIds).toEqual(["O09", "O10"]);
    expect(state.updatedGuideIds).toHaveLength(13);
    expect(state.scopedCorrectionReview.pullRequests).toEqual([1240, 1242, 1243]);
    expect(state.cumulativeDraftNewGuideIds).toHaveLength(22);
    expect(state.cumulativeDraftUpdatedGuideIds).toHaveLength(35);
    expect(state.scopedCorrectionReview.comparedWithCurrentMain).toEqual({ new: 22, revised: 35, unchanged: 165 });
  });
});
