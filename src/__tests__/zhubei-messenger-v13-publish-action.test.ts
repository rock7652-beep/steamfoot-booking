import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(), resolveWriteStoreId: vi.fn(), findStore: vi.fn(),
  preview: vi.fn(), apply: vi.fn(), classify: vi.fn(), revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.requirePermission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: h.resolveWriteStoreId }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: h.findStore } } }));
vi.mock("@/server/services/zhubei-messenger-v13-publish", () => ({
  ZHUBEI_V13_CONFIRMATION: "PUBLISH_ZHUBEI_MESSENGER_V13",
  previewZhubeiMessengerV13Publish: h.preview,
  applyZhubeiMessengerV13Publish: h.apply,
  classifyZhubeiV13PublishFailure: h.classify,
}));

import { applyZhubeiMessengerV13PublishAction, previewZhubeiMessengerV13PublishAction } from "@/app/(dashboard)/dashboard/settings/messenger-audit/flow-v13-publish-actions";

const preview = { storeSlug: "zhubei", activeVersion: 12, targetVersion: 13, createLeadStepKey: "inquiry-create-lead", currentSelector: "MISSING", plannedSelector: "menu", willCreateNewVersion: true, willSwitchActiveVersion: true, modifiesV12: false, modifiesConversations: false, modifiesLeads: false, modifiesSubmittedAnswers: false, v12Checksum: "checksum", status: "READY" };

describe("Zhubei Messenger v13 publish action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requirePermission.mockResolvedValue({ id: "owner-1", role: "OWNER" });
    h.resolveWriteStoreId.mockResolvedValue("store-zhubei");
    h.findStore.mockResolvedValue({ id: "store-zhubei", slug: "zhubei" });
    h.preview.mockResolvedValue({ preview });
    h.apply.mockResolvedValue({ result: "PUBLISHED", preview, version: { id: "version-13", version: 13 } });
    h.classify.mockReturnValue("TRANSACTION_FAILED");
  });

  it("lets only the scoped OWNER perform a read-only preview", async () => {
    await expect(previewZhubeiMessengerV13PublishAction()).resolves.toEqual({ success: true, preview });
    expect(h.preview).toHaveBeenCalledWith("store-zhubei");
    expect(h.apply).not.toHaveBeenCalled();
  });

  it("rejects ADMIN and cross-store access before service calls", async () => {
    h.requirePermission.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    await expect(previewZhubeiMessengerV13PublishAction()).resolves.toMatchObject({ success: false });
    expect(h.preview).not.toHaveBeenCalled();
    h.requirePermission.mockResolvedValue({ id: "owner-1", role: "OWNER" });
    h.findStore.mockResolvedValue({ id: "store-other", slug: "other" });
    await expect(previewZhubeiMessengerV13PublishAction()).resolves.toMatchObject({ success: false });
    expect(h.preview).not.toHaveBeenCalled();
  });

  it("accepts no client-controlled flow input and requires the fixed confirmation before apply", async () => {
    await expect(applyZhubeiMessengerV13PublishAction("wrong")).resolves.toEqual({ success: false, error: "確認字串不正確。" });
    expect(h.apply).not.toHaveBeenCalled();
    await expect(applyZhubeiMessengerV13PublishAction("PUBLISH_ZHUBEI_MESSENGER_V13")).resolves.toMatchObject({ success: true, result: "PUBLISHED", version: { version: 13 } });
    expect(h.apply).toHaveBeenCalledWith({ storeId: "store-zhubei", actorUserId: "owner-1" });
    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard/settings/messenger-audit");
  });

  it("returns and logs only a classified safe code when apply fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.apply.mockRejectedValue(new Error("raw database failure must not reach the client"));

    await expect(applyZhubeiMessengerV13PublishAction("PUBLISH_ZHUBEI_MESSENGER_V13")).resolves.toEqual({
      success: false,
      error: "目前無法安全發布 Messenger Flow v13。",
      code: "TRANSACTION_FAILED",
    });
    expect(h.classify).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("zhubei_messenger_v13_publish_apply_failed", { code: "TRANSACTION_FAILED" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("raw database failure");
  });
});
