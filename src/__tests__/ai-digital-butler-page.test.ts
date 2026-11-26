import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, it, expect, vi } from "vitest";
import { DEFAULT_AI_SETTING } from "@/server/ai/contracts";
const m = vi.hoisted(() => ({ user: vi.fn(), permission: vi.fn(), scope: vi.fn(), deterministic: vi.fn(), ai: vi.fn(), flows: vi.fn(), store: vi.fn(), repository: vi.fn(), panel: vi.fn(), editor: vi.fn(), handoffList: vi.fn(), handoffPanel: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.scope }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: m.deterministic, getStoreFeaturePresentation: m.ai }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: m.store } } }));
vi.mock("@/server/ai/database", () => ({ aiButlerRepository: m.repository, aiButlerDatabase: vi.fn() }));
vi.mock("../../scripts/ai-digital-butler-preview-scope.mjs", () => ({ claimsAiPreview: () => true, assertAiPreview: vi.fn() }));
vi.mock("@/server/services/digital-butler", () => ({ DigitalButlerService: class { listFlows = m.flows; } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/settings/settings-navigation", () => ({ SettingsReturnLink: ({ children }: { children: ReactNode }) => h("a", null, children) }));
vi.mock("@/components/desktop", () => ({ PageShell: ({ children }: { children: ReactNode }) => h("main", null, children), PageHeader: () => null }));
vi.mock("../app/(dashboard)/dashboard/settings/digital-butler/flow-editor", () => ({ DigitalButlerFlowEditor: m.editor }));
vi.mock("../app/(dashboard)/dashboard/settings/digital-butler/ai-panel", () => ({ AiButlerPanel: m.panel }));
vi.mock("@/server/ai/routing-repository", () => ({ AiRoutingRepository: class { globalStopped = async () => true; } }));
vi.mock("../app/(dashboard)/dashboard/settings/digital-butler/ai-routing-panel", () => ({ AiRoutingPanel: () => h("div", null, "ROUTING_PANEL") }));
vi.mock("@/server/ai/handoff-repository", () => ({ aiHandoffViewKey: () => "v".repeat(64), AiHandoffRepository: class { list = m.handoffList; } }));
vi.mock("../app/(dashboard)/dashboard/settings/digital-butler/ai-handoff-panel", () => ({ AiHandoffPanel: m.handoffPanel }));
vi.mock("@/server/ai/knowledge-repository", () => ({ AiKnowledgeRepository: class { read = async () => ({ draft: { introduction: "", faqs: [], prohibitedTerms: [], references: { hours: false, services: false, prices: false } }, published: null, revision: 0, publishedVersion: 0, publishedAt: null }); } }));
vi.mock("../app/(dashboard)/dashboard/settings/digital-butler/ai-knowledge-panel", () => ({ AiKnowledgePanel: () => h("div", null, "KNOWLEDGE_PANEL") }));
import Page from "../app/(dashboard)/dashboard/settings/digital-butler/page";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("AI_IDENTITY_SECRET", "s".repeat(40));
  m.user.mockResolvedValue({ id: "synthetic-owner", role: "OWNER" }); m.permission.mockResolvedValue(true); m.scope.mockResolvedValue("ai-preview-steamfoot");
  m.deterministic.mockResolvedValue(false); m.ai.mockResolvedValue("ENABLED"); m.flows.mockResolvedValue([]);
  m.store.mockResolvedValue({ name: "合成店", slug: "ai-preview-steamfoot", industryModule: "STEAMFOOT" });
  m.repository.mockReturnValue({ setting: async () => ({ setting: DEFAULT_AI_SETTING, revision: 0 }), usage: async () => ({ requests: "0", reservedMicros: "0", budgetMicros: 1000000, alerts: [] }), conversationState: async () => ({ handoff: true }) });
  m.panel.mockImplementation(() => h("div", null, "AI_PANEL")); m.editor.mockImplementation(() => h("div", null, "DETERMINISTIC_EDITOR"));
  m.handoffList.mockResolvedValue({ rows: [], total: 0, nextCursor: null }); m.handoffPanel.mockImplementation(() => h("div", null, "HANDOFF_PANEL"));
});
it("AI-only grant mounts the existing settings page without querying or mounting deterministic flows", async () => {
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain("AI_PANEL"); expect(html).toContain("KNOWLEDGE_PANEL"); expect(html).toContain("ROUTING_PANEL"); expect(html).toContain("HANDOFF_PANEL"); expect(html).not.toContain("DETERMINISTIC_EDITOR"); expect(m.flows).not.toHaveBeenCalled();
  expect(m.panel.mock.calls[0][0].initialHandoff).toBe(true);
});
it("the existing Butler still works with AI off, without touching AI persistence", async () => {
  m.deterministic.mockResolvedValue(true); m.ai.mockResolvedValue("HIDDEN");
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain("DETERMINISTIC_EDITOR"); expect(html).not.toContain("AI_PANEL"); expect(m.repository).not.toHaveBeenCalled();
});
it("direct routes require both staff permission and at least one independent entitlement", async () => {
  m.permission.mockResolvedValueOnce(false); await expect(Page()).rejects.toThrow("NOT_FOUND");
  m.ai.mockResolvedValue("LOCKED"); await expect(Page()).rejects.toThrow("NOT_FOUND");
  expect(m.repository).not.toHaveBeenCalled(); expect(m.flows).not.toHaveBeenCalled();
});
it("handoff read errors render an unavailable queue instead of zero pending", async () => {
  m.handoffList.mockRejectedValue(new Error("PRIVATE_QUERY_ERROR"));
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain("HANDOFF_PANEL"); expect(m.handoffPanel.mock.calls[0][0].page).toBe(null);
  expect(html).not.toContain("PRIVATE_QUERY_ERROR");
});
it("valid pagination remains bound to this store and malformed cursors do not query", async () => {
  await Page({ searchParams: Promise.resolve({ aiQueueAfter: "a".repeat(64) }) });
  expect(m.handoffList).toHaveBeenCalledWith("ai-preview-steamfoot", "a".repeat(64));
  m.handoffList.mockClear();
  await Page({ searchParams: Promise.resolve({ aiQueueAfter: "foreign-input" }) });
  expect(m.handoffList).not.toHaveBeenCalled();
});
