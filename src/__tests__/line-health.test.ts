import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ permission: vi.fn(), activeStore: vi.fn(), store: vi.fn(), botInfo: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: h.activeStore }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: h.store } } }));
vi.mock("@/lib/line", () => ({ getLineBotInfo: h.botInfo }));
import { checkTaichungLineBotHealth } from "@/server/actions/line-health";

describe("Taichung OA token health check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.permission.mockResolvedValue({ role: "OWNER", storeId: "taichung-store" });
    h.activeStore.mockResolvedValue("taichung-store");
    h.store.mockResolvedValue({ slug: "taichung", lineDestination: "Ustored-bot-id" });
    h.botInfo.mockResolvedValue({ ok: true, data: { displayName: "台中通知", basicId: "@taichung", userId: "Ustored-bot-id" } });
  });

  it("passes only when Bot Info matches the stored Taichung destination", async () => {
    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({ success: true, data: { status: "PASS", code: "BOT_IDENTITY_MATCH", matchesTaichungStore: true, basicId: "@taichung" } });
    expect(h.store).toHaveBeenCalledWith({ where: { id: "taichung-store" }, select: { slug: true, lineDestination: true } });
    expect(h.botInfo).toHaveBeenCalledWith("taichung");
  });

  it("fails closed for a mismatched OA without exposing its user ID", async () => {
    h.botInfo.mockResolvedValue({ ok: true, data: { displayName: "其他 OA", basicId: "@other", userId: "Uwrong-bot-id" } });
    const response = await checkTaichungLineBotHealth();
    expect(response).toMatchObject({ success: true, data: { status: "FAIL", code: "BOT_IDENTITY_MISMATCH", matchesTaichungStore: false } });
    expect(JSON.stringify(response)).not.toContain("Uwrong-bot-id");
    expect(JSON.stringify(response)).not.toContain("Ustored-bot-id");
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

  it("does not call LINE for a PARTNER even if a permission check succeeds", async () => {
    h.permission.mockResolvedValue({ role: "PARTNER", storeId: "taichung-store" });
    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({ success: false });
    expect(h.activeStore).not.toHaveBeenCalled();
    expect(h.botInfo).not.toHaveBeenCalled();
  });

  it("fails closed when the store destination or token check is unavailable", async () => {
    h.store.mockResolvedValue({ slug: "taichung", lineDestination: null });
    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({ success: true, data: { status: "FAIL", code: "STORE_DESTINATION_MISSING" } });
    expect(h.botInfo).not.toHaveBeenCalled();
    h.store.mockResolvedValue({ slug: "taichung", lineDestination: "Ustored-bot-id" });
    h.botInfo.mockResolvedValue({ ok: false, code: "TOKEN_UNAUTHORIZED" });
    await expect(checkTaichungLineBotHealth()).resolves.toMatchObject({ success: true, data: { status: "FAIL", code: "TOKEN_UNAUTHORIZED" } });
  });
});
