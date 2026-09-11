import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: { id: "u", role: "MANAGER", staffId: "s", storeId: "store" }, permission: vi.fn(), active: vi.fn(), write: vi.fn(), feature: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission, requireWritablePermission: m.permission, checkPermission: async () => true }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.active, resolveWriteStoreId: m.write }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: m.feature }));
vi.mock("@/lib/manager-visibility", () => ({ getManagerReadFilter: () => ({ staffId: "s" }) }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: async () => null }));
vi.mock("@/lib/date-utils", () => ({ toLocalDateStr: () => "2026-09-11" }));
vi.mock("@/server/queries/cash-drawer", () => ({ getCashDrawerView: async () => ({ state: "EMPTY" }), listClosedBusinessDates: async () => [] }));
vi.mock("@/lib/db", () => ({ prisma: { cashbookEntry: { findFirst: m.find } } }));
vi.mock("@/server/actions/cashbook", () => ({ createCashbookEntry: m.create, updateCashbookEntry: m.update, deleteCashbookEntry: m.remove }));
import { saveQuickCashbook, deleteQuickCashbook } from "@/server/actions/quick-cashbook";
beforeEach(() => {
  vi.resetAllMocks(); m.permission.mockResolvedValue(m.user); m.active.mockResolvedValue("store"); m.write.mockResolvedValue("store"); m.feature.mockResolvedValue(true);
  m.find.mockResolvedValue({ id: "e", staffId: "s", entryDate: new Date("2026-09-11T00:00:00Z") });
  m.create.mockResolvedValue({ success: true }); m.update.mockResolvedValue({ success: true }); m.remove.mockResolvedValue({ success: true });
});
function form() { const f = new FormData(); f.set("type", "EXPENSE"); f.set("amount", "200"); f.set("paymentMethod", "CASH"); f.set("category", "耗材"); return f; }
it("uses existing cashbook action and preserves closed-day confirmation", async () => {
  const f = form(); f.set("confirmClosedCashbookChange", "on");
  expect((await saveQuickCashbook("store", null, f)).success).toBe(true);
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 200, type: "EXPENSE", entryDate: "2026-09-11", confirmClosedCashbookChange: true }));
});
it("rejects store changes before writing", async () => { expect((await saveQuickCashbook("other", null, form())).success).toBe(false); expect(m.create).not.toHaveBeenCalled(); });
it("rejects a read/write store mismatch", async () => { m.write.mockResolvedValue("other"); expect((await saveQuickCashbook("store", null, form())).success).toBe(false); expect(m.create).not.toHaveBeenCalled(); });
it("respects feature access", async () => { m.feature.mockResolvedValue(false); expect((await saveQuickCashbook("store", null, form())).success).toBe(false); expect(m.create).not.toHaveBeenCalled(); });
it("does not edit another staff member's entry", async () => { m.find.mockResolvedValue({ staffId: "other", entryDate: new Date("2026-09-11T00:00:00Z") }); expect((await saveQuickCashbook("store", "e", form())).success).toBe(false); expect(m.update).not.toHaveBeenCalled(); });
it("does not delete another staff member's entry", async () => { m.find.mockResolvedValue({ staffId: "other" }); expect((await deleteQuickCashbook("store", "e")).success).toBe(false); expect(m.remove).not.toHaveBeenCalled(); });
it("updates through the existing action", async () => { expect((await saveQuickCashbook("store", "e", form())).success).toBe(true); expect(m.update).toHaveBeenCalledWith("e", expect.objectContaining({ amount: 200 })); });
it("does not silently move yesterday's entry to today", async () => { m.find.mockResolvedValue({ staffId: "s", entryDate: new Date("2026-09-10T00:00:00Z") }); expect((await saveQuickCashbook("store", "e", form())).success).toBe(false); expect(m.update).not.toHaveBeenCalled(); });
it("keeps the existing action's failure for the form", async () => { m.create.mockResolvedValue({ success: false, error: "請確認結帳日" }); expect(await saveQuickCashbook("store", null, form())).toEqual({ success: false, error: "請確認結帳日" }); });
