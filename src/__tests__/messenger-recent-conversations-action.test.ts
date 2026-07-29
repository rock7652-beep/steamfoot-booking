import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(), resolveWriteStoreId: vi.fn(), findStore: vi.fn(),
  findManyFlows: vi.fn(), findManyConversations: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("zod", () => ({ z: { string: () => ({ trim: () => ({ min: () => ({ max: () => ({ parse: (value: unknown) => value }) }) }) }) } }));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.requirePermission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: h.resolveWriteStoreId }));
vi.mock("@/lib/db", () => ({ prisma: {
  store: { findUnique: h.findStore },
  storeDigitalButlerFlow: { findMany: h.findManyFlows },
  digitalButlerConversation: { findMany: h.findManyConversations },
} }));

import { listRecentMessengerConversationsAction } from "@/app/(dashboard)/dashboard/settings/messenger-audit/conversation-actions";

function conversation(id: string, updatedAt: string, overrides: Partial<{ flowId: string; flowVersionId: string; version: number; status: string }> = {}) {
  return { id, status: overrides.status ?? "WAITING_INPUT", currentStepKey: "phone", updatedAt: new Date(updatedAt), flowId: overrides.flowId ?? "flow-1", flowVersionId: overrides.flowVersionId ?? "version-1", flowVersion: { version: overrides.version ?? 1 } };
}

describe("recent Messenger conversations action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requirePermission.mockResolvedValue({ id: "owner-1", role: "OWNER" });
    h.resolveWriteStoreId.mockResolvedValue("store-zhubei");
    h.findStore.mockResolvedValue({ id: "store-zhubei", slug: "zhubei" });
    h.findManyFlows.mockResolvedValue([{ id: "flow-1", currentPublishedVersionId: "version-1" }]);
    h.findManyConversations.mockResolvedValue([conversation("conversation-new", "2026-07-29T02:00:00.000Z"), conversation("conversation-old", "2026-07-29T01:00:00.000Z", { flowVersionId: "version-old", version: 3 })]);
  });

  it("returns only the latest 20 scoped Messenger rows ordered by updatedAt and compares active versions in one flow query", async () => {
    await expect(listRecentMessengerConversationsAction()).resolves.toEqual({ success: true, conversations: [
      expect.objectContaining({ id: "conversation-new", flowVersion: 1, usesCurrentActiveVersion: true }),
      expect.objectContaining({ id: "conversation-old", flowVersion: 3, usesCurrentActiveVersion: false }),
    ] });
    expect(h.findManyConversations).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store-zhubei", provider: "MESSENGER" }, orderBy: { updatedAt: "desc" }, take: 20,
    }));
    expect(h.findManyFlows).toHaveBeenCalledTimes(1);
  });

  it("never selects sender identity, answers, leads, or message content", async () => {
    await listRecentMessengerConversationsAction();
    const select = h.findManyConversations.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("senderIdCiphertext");
    expect(select).not.toHaveProperty("senderIdHash");
    expect(select).not.toHaveProperty("answers");
    expect(select).not.toHaveProperty("leads");
    expect(select).not.toHaveProperty("executionLogs");
  });

  it("rejects non-owner roles before querying", async () => {
    h.requirePermission.mockResolvedValue({ id: "partner-1", role: "PARTNER" });
    await expect(listRecentMessengerConversationsAction()).resolves.toEqual({ success: false, error: "暫時無法載入 Messenger 對話，請稍後再試。" });
    expect(h.findManyConversations).not.toHaveBeenCalled();
  });

  it("rejects a non-zhubei scoped store before querying", async () => {
    h.findStore.mockResolvedValue({ id: "store-other", slug: "taichung" });
    await expect(listRecentMessengerConversationsAction()).resolves.toEqual({ success: false, error: "暫時無法載入 Messenger 對話，請稍後再試。" });
    expect(h.findManyConversations).not.toHaveBeenCalled();
  });
});
