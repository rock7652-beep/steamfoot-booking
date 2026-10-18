import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ permission: vi.fn(), manager: vi.fn(), transaction: vi.fn(), edit: vi.fn(), voidPurchase: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requireWritablePermission: m.permission }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.manager, courseTransaction: m.transaction }));
vi.mock("@/server/services/course-purchase-correction", () => ({ editCoursePurchaseInTransaction: m.edit, voidCoursePurchaseInTransaction: m.voidPurchase }));
import { revalidatePath } from "next/cache";
import { editCoursePurchase, voidCoursePurchase } from "@/server/actions/course-purchase-correction";

beforeEach(() => {
  vi.resetAllMocks();
  m.manager.mockResolvedValue({ storeId: "own-store", user: { id: "manager" } });
  m.transaction.mockImplementation(async (_store, work) => work("locked-tx"));
});
it.each(["edit", "void"] as const)("%s refreshes both transaction entrances and linked balances after commit", async kind => {
  const base = { purchaseId: "purchase", reason: "核對更正" };
  const result = kind === "edit"
    ? await editCoursePurchase({ ...base, note: "修正備註", revenueStaffId: null })
    : await voidCoursePurchase(base);
  expect(result).toMatchObject({ success: true });
  expect(m.permission).toHaveBeenCalledWith(kind === "edit" ? "transaction.create" : "transaction.void");
  expect(m.transaction).toHaveBeenCalledWith("own-store", expect.any(Function));
  for (const path of ["/dashboard", "/dashboard/revenue", "/dashboard/transactions", "/dashboard/cashbook", "/dashboard/cash-drawer", "/dashboard/courses", "/book"])
    expect(revalidatePath).toHaveBeenCalledWith(path);
});
it("does not invalidate pages after a failed correction", async () => {
  m.transaction.mockRejectedValueOnce(new Error("rollback"));
  expect(await voidCoursePurchase({ purchaseId: "purchase", reason: "核對更正" })).toMatchObject({ success: false });
  expect(revalidatePath).not.toHaveBeenCalled();
});
