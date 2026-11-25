import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { operationGuides } from "../lib/operation-guide";
import { coursePortalGuides } from "../lib/course-portal-guides";

const state = JSON.parse(readFileSync("docs/operation-guide-audit-state.json", "utf8"));

describe("incremental guide audit accounting", () => {
  it("counts unique existing articles and pending IDs without treating source review as acceptance", () => {
    expect(state.articleCount).toBe(operationGuides.length);
    expect(state.frontendArticleCount).toBe(0);
    expect(state.frontendGuideRetirement.articleCount).toBe(coursePortalGuides.length);
    const pending = new Set<string>(state.interactionPendingGuideIds);
    const frontendPending = new Set<string>(state.frontendInteractionPendingGuideIds);
    expect(pending.size).toBe(state.interactionPendingGuideIds.length);
    expect(frontendPending.size).toBe(state.frontendInteractionPendingGuideIds.length);
    expect(state.backendInteractionPendingCount).toBe(pending.size);
    expect(state.totalInteractionPendingCount).toBe(pending.size + frontendPending.size);
    expect(state.totalInteractionPendingCount).toBe(151);
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

  it("records the current main and attributes prior acceptance without clearing new revisions", () => {
    expect(state.lastInventoriedMainCommit).toBe("480532648bbba30fae97e91207fb7514119c6223");
    expect(state.previousSuccessfulAuditCommit).toBe("9cf8f382714a914a6f908eec8e5e682df183438a");
    expect(state.priorUserAcceptance.status).toBe("user-confirmed-passed");
    expect(state.authenticatedAcceptance.guideIdsCleared).toEqual([]);
    expect(state.backendCatalogFrontendRetirement.articleCount).toBe(8);
    expect(state.frontendNewGuideIds).toEqual([]);
    const history = JSON.parse(readFileSync(state.previousAuditSnapshot, "utf8"));
    expect(history.lastInventoriedMainCommit).toBe("4f997d42f3ea03a0e8c9d697a8ed8c5496133701");
    expect(history.totalInteractionPendingCount).toBe(149);
    expect(state.interactionPendingGuideIds.filter((id: string) => !history.interactionPendingGuideIds.includes(id))).toEqual(["B01", "B02"]);
    expect(history.interactionPendingGuideIds.every((id: string) => state.interactionPendingGuideIds.includes(id))).toBe(true);
    const reconciliation = JSON.parse(readFileSync(state.acceptanceReconciliation.data, "utf8"));
    expect(reconciliation.rows.map((row: { id: string }) => row.id).sort()).toEqual([...state.interactionPendingGuideIds].sort());
    expect(reconciliation.priorGuideAcceptancePreserved).toBe(92);
    expect(reconciliation.noPerGuideLoginEvidence).toBe(59);
  });
});
