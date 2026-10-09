import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { operationGuides } from "../lib/operation-guide";
import { coursePortalGuides } from "../lib/course-portal-guides";

const state = JSON.parse(readFileSync("docs/operation-guide-audit-state.json", "utf8"));

describe("incremental guide audit accounting", () => {
  it("counts unique existing articles and pending IDs without treating source review as acceptance", () => {
    expect(state.articleCount).toBe(operationGuides.length);
    expect(state.frontendArticleCount).toBe(coursePortalGuides.length);
    const pending = new Set<string>(state.interactionPendingGuideIds);
    const frontendPending = new Set<string>(state.frontendInteractionPendingGuideIds);
    expect(pending.size).toBe(state.interactionPendingGuideIds.length);
    expect(frontendPending.size).toBe(state.frontendInteractionPendingGuideIds.length);
    expect(state.backendInteractionPendingCount).toBe(pending.size);
    expect(state.totalInteractionPendingCount).toBe(pending.size + frontendPending.size);
    expect(state.totalInteractionPendingCount).toBe(155);
    expect(state.maintenanceScope).toBe("backend-only");
    expect(state.frontendInteractionPendingGuideIds).toEqual([]);
    expect(state.frontendGuideRetirement.status).toBe("retired-not-verified");
    expect([...state.frontendGuideRetirement.guideIds].sort()).toEqual(coursePortalGuides.map(g => g.id).sort());
    for (const id of pending) expect(operationGuides.some(g => g.id === id), id).toBe(true);
    for (const id of frontendPending) expect(coursePortalGuides.some(g => g.id === id), id).toBe(true);
    for (const id of [...state.newGuideIds, ...state.updatedGuideIds]) {
      expect(pending.has(id), id).toBe(true);
      expect(operationGuides.find(g => g.id === id)?.verification).toBe("source-reviewed");
    }
    expect(state.allArticlesInteractionVerified).toBe(false);
    expect(state.allSystemCoverageComplete).toBe(false);
  });

  it("records the October 9 main diff without rewriting the historical baseline", () => {
    expect(state.previousBatchReview.totalInteractionPendingCount).toBe(171);
    expect(state.scopedCorrectionReview.newPendingGuideIds).toEqual(["O09", "O10", "F03"]);
    expect(state.newGuideIds).toEqual(["C168", "I19"]);
    expect(state.updatedGuideIds).toEqual(["I05", "I18", "C101", "C118"]);
    expect(state.frontendNewGuideIds).toEqual(["CP22"]);
    expect(state.lastInventoriedMainCommit).toBe("84aca95aa5ec3ce30c56a492037acf066ad10291");
    expect(state.previousSuccessfulAuditCommit).toBe("51cab4ff29d858c9997b1ef7077112c1e47e11b0");
    expect(state.reviewedMainPullRequests).toEqual(expect.arrayContaining([1249, 1251, 1257, 1262, 1264, 1265, 1267]));
    expect(state.publishedGuidePullRequests).toContain(1184);
  });
});
