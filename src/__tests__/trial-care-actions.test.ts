import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), store: vi.fn(), feature: vi.fn(), tx: vi.fn(), find: vi.fn(), save: vi.fn(), customer: vi.fn(), pref: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requireWritablePermission: m.permission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: m.store }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: m.feature }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.tx, customer: { findFirst: m.customer }, trialCarePreference: { upsert: m.pref } } }));
import { saveTrialCareSettings, stopCustomerTrialCare } from "@/server/actions/trial-care";
import { defaultTrialCareRules } from "@/lib/trial-care";
beforeEach(() => { vi.resetAllMocks(); m.permission.mockResolvedValue({ id: "owner" }); m.store.mockResolvedValue("A"); m.find.mockResolvedValue(null); m.tx.mockImplementation(fn => fn({ $executeRaw: vi.fn(), trialCareSetting: { findUnique: m.find, upsert: m.save } })); });
describe("trial care store settings", () => {
  it("resolves the authorized store and rejects a stale cross-store form", async () => { const result = await saveTrialCareSettings({ storeId: "B", enabled: true, rules: defaultTrialCareRules() }); expect(result.success).toBe(false); expect(m.save).not.toHaveBeenCalled(); });
  it("requires server-side writable permission", async () => { await saveTrialCareSettings({ storeId: "A", enabled: true, rules: defaultTrialCareRules() }); expect(m.permission).toHaveBeenCalledWith("business_hours.manage"); expect(m.save.mock.calls[0][0].create.activatedAt).toBeInstanceOf(Date); });
  it("preserves the start date when editing an active journey", async () => { const activatedAt = new Date("2026-09-01"); m.find.mockResolvedValue({ enabled: true, activatedAt }); await saveTrialCareSettings({ storeId: "A", enabled: true, rules: defaultTrialCareRules() }); expect(m.save.mock.calls[0][0].update.activatedAt).toEqual(activatedAt); });
  it("does not touch customer opt-outs when the store re-enables", async () => { m.find.mockResolvedValue({ enabled: false, activatedAt: new Date("2026-09-01") }); await saveTrialCareSettings({ storeId: "A", enabled: true, rules: defaultTrialCareRules() }); expect(m.save.mock.calls[0][0].update.activatedAt).toBeInstanceOf(Date); expect(m.pref).not.toHaveBeenCalled(); });
  it("prevents stopping customers in another store", async () => { m.customer.mockResolvedValue(null); expect((await stopCustomerTrialCare("other-customer")).success).toBe(false); expect(m.customer.mock.calls[0][0].where).toEqual({ id: "other-customer", storeId: "A" }); expect(m.pref).not.toHaveBeenCalled(); });
  it("allows staff to stop but never clears a stop", async () => { m.customer.mockResolvedValue({ id: "c" }); expect((await stopCustomerTrialCare("c")).success).toBe(true); expect(m.pref.mock.calls[0][0].update.stoppedAt).toBeInstanceOf(Date); });
});
