import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ permission: vi.fn(), activeStore: vi.fn(), feature: vi.fn(), store: vi.fn(), updateStore: vi.fn(), botInfo: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: h.activeStore }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: h.feature }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: h.store, update: h.updateStore } } }));
vi.mock("@/lib/line", () => ({ getLineBotInfo: h.botInfo }));
import { checkTaichungLineBotHealth } from "@/server/actions/line-health";

describe("Taichung OA token health check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.permission.mockResolvedValue({ role: "OWNER", storeId: "taichung-store" });
    h.activeStore.mockResolvedValue("taichung-store");
    h.feature.mockResolvedValue(undefined);
    h.store.mockResolvedValue({ slug: "taichung", lineDestination: "Ustored-bot-id" });
    h.botInfo.mockResolvedValue({ ok: true, data: { displayName: "台中通知", basicId: "@096ulbei", userId: "Ustored-bot-id" } });
  });

  it("passes only when Bot Info matches the stored Taichung destination", async () => {
    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({ success: true, data: { status: "PASS", code: "BOT_IDENTITY_MATCH", matchesTaichungStore: true, basicId: "@096ulbei", repairedDestination: false } });
    expect(h.store).toHaveBeenCalledWith({ where: { id: "taichung-store" }, select: { slug: true, lineDestination: true } });
    expect(h.botInfo).toHaveBeenCalledWith("taichung-store");
    const { getLineConfigForStore, resolveLineStoreSlug } = await import("@/lib/line-config");
    expect(resolveLineStoreSlug("taichung-store")).toBe("taichung");
    expect(getLineConfigForStore("taichung-store").expectedBasicId).toBe("@096ulbei");
    expect(h.updateStore).not.toHaveBeenCalled();
  });

  it("fails closed for an unexpected Basic ID without exposing its user ID", async () => {
    h.botInfo.mockResolvedValue({ ok: true, data: { displayName: "其他 OA", basicId: "@other", userId: "Uwrong-bot-id" } });
    const response = await checkTaichungLineBotHealth();
    expect(response).toMatchObject({ success: true, data: { status: "FAIL", code: "BOT_BASIC_ID_MISMATCH", matchesTaichungStore: false, repairedDestination: false } });
    expect(JSON.stringify(response)).not.toContain("Uwrong-bot-id");
    expect(JSON.stringify(response)).not.toContain("Ustored-bot-id");
    expect(h.updateStore).not.toHaveBeenCalled();
  });

  it("repairs a stale destination only after the approved Basic ID matches", async () => {
    h.store.mockResolvedValue({ slug: "taichung", lineDestination: "Uold-bot-id" });
    h.botInfo.mockResolvedValue({ ok: true, data: { displayName: "暖沐蒸足", basicId: "@096ulbei", userId: "Unew-bot-id" } });

    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({
      success: true,
      data: {
        status: "PASS",
        code: "BOT_DESTINATION_REPAIRED",
        matchesTaichungStore: true,
        repairedDestination: true,
      },
    });
    expect(h.updateStore).toHaveBeenCalledWith({
      where: { id: "taichung-store" },
      data: { lineDestination: "Unew-bot-id" },
    });
  });

  it("does not call LINE when the canonical store is not Taichung", async () => {
    h.activeStore.mockResolvedValue("store-zhubei");
    h.store.mockResolvedValue({ slug: "zhubei", lineDestination: "Uzhubei-bot-id" });
    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({ success: false });
    expect(h.botInfo).not.toHaveBeenCalled();
  });

  it("fails closed when no concrete active store is selected", async () => {
    h.activeStore.mockResolvedValue(null);
    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({ success: false });
    expect(h.store).not.toHaveBeenCalled();
    expect(h.botInfo).not.toHaveBeenCalled();
  });

  it("does not query the store or LINE when the reminder feature is unavailable", async () => {
    h.feature.mockRejectedValue(new Error("feature unavailable"));
    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({ success: false });
    expect(h.feature).toHaveBeenCalledWith("taichung-store", "line_reminder");
    expect(h.store).not.toHaveBeenCalled();
    expect(h.botInfo).not.toHaveBeenCalled();
  });

  it("does not call LINE for a PARTNER even if a permission check succeeds", async () => {
    h.permission.mockResolvedValue({ role: "PARTNER", storeId: "taichung-store" });
    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({ success: false });
    expect(h.activeStore).not.toHaveBeenCalled();
    expect(h.botInfo).not.toHaveBeenCalled();
  });

  it("does not query the store or LINE when the action permission is denied", async () => {
    h.permission.mockRejectedValue(new Error("forbidden"));
    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({ success: false });
    expect(h.activeStore).not.toHaveBeenCalled();
    expect(h.store).not.toHaveBeenCalled();
    expect(h.botInfo).not.toHaveBeenCalled();
  });

  it("repairs a missing store destination when the approved bot is verified", async () => {
    h.store.mockResolvedValue({ slug: "taichung", lineDestination: null });
    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({ success: true, data: { status: "PASS", code: "BOT_DESTINATION_REPAIRED", repairedDestination: true } });
    expect(h.updateStore).toHaveBeenCalledWith({
      where: { id: "taichung-store" },
      data: { lineDestination: "Ustored-bot-id" },
    });
  });

  it("fails closed when the token check is unavailable", async () => {
    h.store.mockResolvedValue({ slug: "taichung", lineDestination: "Ustored-bot-id" });
    h.botInfo.mockResolvedValue({ ok: false, code: "TOKEN_UNAUTHORIZED" });
    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({ success: true, data: { status: "FAIL", code: "TOKEN_UNAUTHORIZED" } });
    expect(h.updateStore).not.toHaveBeenCalled();
  });
});
