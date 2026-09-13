import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), storeFind: vi.fn(), subFind: vi.fn(), subSave: vi.fn(), storeSave: vi.fn(), log: vi.fn(), tx: vi.fn(), lock: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireStaffSession: m.user }));
vi.mock("@/lib/permissions", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/revalidation", () => ({ revalidateStorePlan: vi.fn(), revalidateShopConfig: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: m.storeFind }, $transaction: m.tx } }));
import { upsertStoreSubscription } from "@/server/actions/store-subscription";
const input = { subscriptionId: "trial", storeId: "store", plan: "BASIC", status: "ACTIVE", billingCycle: "MONTHLY", startedAt: "2026-09-13", expiresAt: "2026-10-12", billingStatus: "PAID", paymentMethod: "BANK_TRANSFER", priceAmount: 1490 };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T05:00:00Z"));
  m.user.mockResolvedValue({ id: "admin", role: "ADMIN" });
  m.storeFind.mockResolvedValue({ id: "store", plan: "EXPERIENCE", planStatus: "TRIAL", currentSubscriptionId: "trial" });
  m.subFind.mockResolvedValue({ id: "trial", storeId: "store", isTrial: true });
  m.subSave.mockImplementation(async ({ data }) => ({ id: "trial", ...data }));
  m.tx.mockImplementation(async fn => fn({ $executeRaw: m.lock, store: { findUniqueOrThrow: m.storeFind, update: m.storeSave }, storeSubscription: { findUnique: m.subFind, update: m.subSave, create: m.subSave }, storePlanChange: { create: m.log } }));
});
describe("original-store trial conversion", () => {
  it("activates the purchased plan on the same store and subscription", async () => {
    expect((await upsertStoreSubscription(input)).success).toBe(true);
    expect(m.subSave).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "trial" }, data: expect.objectContaining({ isTrial: false, plan: "BASIC", status: "ACTIVE" }) }));
    expect(m.storeSave).toHaveBeenCalledWith({ where: { id: "store" }, data: expect.objectContaining({ plan: "BASIC", planStatus: "ACTIVE", currentSubscriptionId: "trial" }) });
    // Transaction exposes no customer/booking/wallet model: conversion must not copy or delete them.
    expect(m.log).toHaveBeenCalledTimes(1);
  });
  it("editing an old subscription cannot overwrite the current paid plan", async () => {
    m.storeFind.mockResolvedValue({ id: "store", plan: "GROWTH", planStatus: "ACTIVE", currentSubscriptionId: "newer" });
    expect((await upsertStoreSubscription(input)).success).toBe(true);
    expect(m.storeSave).not.toHaveBeenCalled();
  });
  it("rejects cross-store subscription edits", async () => {
    m.subFind.mockResolvedValue({ id: "trial", storeId: "other" });
    expect((await upsertStoreSubscription(input)).success).toBe(false);
    expect(m.subSave).not.toHaveBeenCalled();
  });
  it("does not allow a shop owner to activate their own paid plan", async () => {
    m.user.mockResolvedValue({ id: "owner", role: "OWNER" });
    expect((await upsertStoreSubscription(input)).success).toBe(false);
    expect(m.tx).not.toHaveBeenCalled();
  });
});
