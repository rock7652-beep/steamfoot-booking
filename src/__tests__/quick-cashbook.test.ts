import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const m = vi.hoisted(() => ({ user: { id: "u", role: "MANAGER", staffId: "s", storeId: "store" }, permission: vi.fn(), check: vi.fn(), view: vi.fn(), entries: vi.fn(), count: vi.fn(), summary: vi.fn(), closed: vi.fn(), active: vi.fn(), write: vi.fn(), feature: vi.fn(), find: vi.fn(), customers: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission, requireWritablePermission: m.permission, checkPermission: m.check }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.active, resolveWriteStoreId: m.write }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: m.feature }));
vi.mock("@/lib/manager-visibility", () => ({ getManagerReadFilter: () => ({ staffId: "s" }) }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: m.view }));
vi.mock("@/lib/date-utils", () => ({ toLocalDateStr: () => "2026-09-11" }));
vi.mock("@/server/queries/cash-drawer", () => ({ getCashDrawerBalanceSummary: m.summary, listClosedBusinessDates: m.closed }));
vi.mock("@/lib/db", () => ({ prisma: { cashbookEntry: { findFirst: m.find, findMany: m.entries, count: m.count }, customer: { findMany: m.customers } } }));
vi.mock("@/server/actions/cashbook", () => ({ createCashbookEntry: m.create, updateCashbookEntry: m.update, deleteCashbookEntry: m.remove }));
import { fetchQuickCashbook, saveQuickCashbook, deleteQuickCashbook, searchQuickCashbookCustomers } from "@/server/actions/quick-cashbook";
beforeEach(() => {
  vi.resetAllMocks(); m.check.mockResolvedValue(true); m.view.mockResolvedValue(null); m.entries.mockResolvedValue([]); m.count.mockResolvedValue(0); m.closed.mockResolvedValue([]); m.summary.mockResolvedValue({ balance: null, balanceLabel: "現金抽屜尚未啟用" }); m.permission.mockResolvedValue(m.user); m.active.mockResolvedValue("store"); m.write.mockResolvedValue("store"); m.feature.mockResolvedValue(true);
  m.find.mockResolvedValue({ id: "e", staffId: "s", entryDate: new Date("2026-09-11T00:00:00Z") });
  m.create.mockResolvedValue({ success: true }); m.update.mockResolvedValue({ success: true }); m.remove.mockResolvedValue({ success: true });
});
function form() { const f = new FormData(); f.set("type", "EXPENSE"); f.set("amount", "200"); f.set("paymentMethod", "CASH"); f.set("category", "耗材"); return f; }
it("uses existing cashbook action and preserves closed-day confirmation", async () => {
  const f = form(); f.set("confirmClosedCashbookChange", "on");
  expect((await saveQuickCashbook("store", null, f)).success).toBe(true);
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 200, type: "EXPENSE", entryDate: "2026-09-11", confirmClosedCashbookChange: true }));
});
it("passes the selected customer only for income", async () => {
  const income = form(); income.set("type", "INCOME"); income.set("customerId", "customer-1");
  await saveQuickCashbook("store", null, income);
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ type: "INCOME", customerId: "customer-1" }));
  const expense = form(); expense.set("customerId", "customer-1");
  await saveQuickCashbook("store", null, expense);
  expect(m.create).toHaveBeenLastCalledWith(expect.objectContaining({ type: "EXPENSE", customerId: undefined }));
});
it("rejects store changes before writing", async () => { expect((await saveQuickCashbook("other", null, form())).success).toBe(false); expect(m.create).not.toHaveBeenCalled(); });
it("rejects a read/write store mismatch", async () => { m.write.mockResolvedValue("other"); expect((await saveQuickCashbook("store", null, form())).success).toBe(false); expect(m.create).not.toHaveBeenCalled(); });
it("respects feature access", async () => { m.feature.mockResolvedValue(false); expect((await saveQuickCashbook("store", null, form())).success).toBe(false); expect(m.create).not.toHaveBeenCalled(); });
it("does not edit another staff member's entry", async () => { m.find.mockResolvedValue({ staffId: "other", entryDate: new Date("2026-09-11T00:00:00Z") }); expect((await saveQuickCashbook("store", "e", form())).success).toBe(false); expect(m.update).not.toHaveBeenCalled(); });
it("does not delete another staff member's entry", async () => { m.find.mockResolvedValue({ staffId: "other" }); expect((await deleteQuickCashbook("store", "e")).success).toBe(false); expect(m.remove).not.toHaveBeenCalled(); });
it("updates through the existing action", async () => { expect((await saveQuickCashbook("store", "e", form())).success).toBe(true); expect(m.update).toHaveBeenCalledWith("e", expect.objectContaining({ amount: 200 })); });
it("does not silently move yesterday's entry to today", async () => { m.find.mockResolvedValue({ staffId: "s", entryDate: new Date("2026-09-10T00:00:00Z") }); expect((await saveQuickCashbook("store", "e", form())).success).toBe(false); expect(m.update).not.toHaveBeenCalled(); });
it("keeps the existing action's failure for the form", async () => { m.create.mockResolvedValue({ success: false, error: "請確認結帳日" }); expect(await saveQuickCashbook("store", null, form())).toEqual({ success: false, error: "請確認結帳日" }); });
it("uses a phone prefix for fast numeric customer search", async () => {
  m.customers.mockResolvedValue([]);
  await searchQuickCashbookCustomers("store", "09");
  expect(m.customers).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ phone: { startsWith: "09" } }), take: 8 }));
});
it("uses a fast name prefix before fuzzy matching", async () => {
  m.customers.mockResolvedValue([]);
  await searchQuickCashbookCustomers("store", "黃");
  expect(m.customers).toHaveBeenCalledTimes(1);
  expect(m.customers).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ name: { startsWith: "黃" } }]) }) }));
});
it("falls back to a partial name match after two characters", async () => {
  m.customers.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  await searchQuickCashbookCustomers("store", "彥陸");
  expect(m.customers).toHaveBeenCalledTimes(2);
  expect(m.customers).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ name: { contains: "彥陸" } }]) }) }));
});
it("keeps letters with numbers in the name search", async () => {
  m.customers.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  await searchQuickCashbookCustomers("store", "QA396");
  expect(m.customers).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ name: { startsWith: "QA396" } }]) }) }));
});
it("uses the lightweight customer API and cancels stale searches", () => {
  const source = readFileSync("src/app/(dashboard)/dashboard/cashbook/_components/cashbook-entry-fields.tsx", "utf8");
  expect(source).toContain("/api/customers/search?q=");
  expect(source).toContain("new AbortController()");
  expect(source).not.toContain("Promise.race([searchQuickCashbookCustomers");
});
it("renders the quick cashbook as a centered responsive dialog", () => {
  const source = readFileSync("src/app/(dashboard)/dashboard/cashbook/_components/quick-cashbook.tsx", "utf8");
  expect(source).toContain("createPortal(");
  expect(source).toContain('sm:items-center sm:justify-center');
  expect(source).toContain('role="dialog" aria-modal="true"');
  expect(source).not.toContain("<RightSheet");
});


it("starts authorized list queries while view metadata is still pending", async () => {
  let finish!: (value: null) => void;
  m.view.mockReturnValue(new Promise<null>(resolve => { finish = resolve; }));
  const read = fetchQuickCashbook("store", 2);
  await vi.waitFor(() => expect(m.entries).toHaveBeenCalledTimes(1));
  expect(m.count).toHaveBeenCalledTimes(1);
  expect(m.closed).toHaveBeenCalledTimes(1);
  expect(m.entries).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store", entryDate: new Date("2026-09-11T00:00:00Z"), staffId: "s" }, skip: 20, take: 20 }));
  finish(null);
  expect((await read).page).toBe(2);
});
it("does not query drawer balances without drawer permission", async () => {
  m.check.mockImplementation(async (_role, _staff, permission) => permission !== "cashDrawer.read");
  expect((await fetchQuickCashbook("store")).canDrawer).toBe(false);
  expect(m.summary).not.toHaveBeenCalled();
});
it("does not query cash data for a different active store", async () => {
  await expect(fetchQuickCashbook("other")).rejects.toThrow("店別已變更");
  expect(m.entries).not.toHaveBeenCalled();
  expect(m.summary).not.toHaveBeenCalled();
});
it("keeps view mode read-only even with create permission", async () => {
  m.view.mockResolvedValue({ isViewMode: true });
  m.entries.mockResolvedValue([{ id: "e", staffId: "s", type: "INCOME", amount: 1, paymentMethod: "OTHER", customer: null }]);
  const result = await fetchQuickCashbook("store");
  expect(result.canWrite).toBe(false);
  expect(result.entries[0].canEdit).toBe(false);
});


it("read permission denial does not start financial queries", async () => {
  m.permission.mockRejectedValue(new Error("denied"));
  await expect(fetchQuickCashbook("store")).rejects.toThrow("denied");
  expect(m.entries).not.toHaveBeenCalled();
  expect(m.summary).not.toHaveBeenCalled();
});
it("disabled cashbook feature does not start financial queries", async () => {
  m.feature.mockResolvedValue(false);
  await expect(fetchQuickCashbook("store")).rejects.toThrow("尚未開通");
  expect(m.entries).not.toHaveBeenCalled();
  expect(m.summary).not.toHaveBeenCalled();
});
