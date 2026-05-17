import { describe, it, expect, vi, beforeEach } from "vitest";

// 體驗 499 PR-2：createTrialBooking 保證
//  - 只透過 createBooking 建 FIRST_TRIAL（servicePlanId=trial plan、無 wallet）
//  - 不建立 Transaction / CustomerPlanWallet（@/lib/db mock 只暴露 staff+customer，
//    任何 prisma.transaction.* / customerPlanWallet.* 會直接 throw → 測試會 fail）
//  - 同店電話重複 → 沿用既有 Customer，不建第二筆
//  - expectedAmount：未傳帶店家預設、allowEdit=false 強制預設、皆 clamp
//  - 直屬店長：既有顧客「未指派」才補、已指派不覆蓋

const CUID = {
  cust: "ckcustomer0000000000000aa",
  custExisting: "ckcustexisting00000000aaa",
  staff: "ckstaff000000000000000aaa",
  plan: "ckplan0000000000000000aaa",
};

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(async () => ({ storeId: "store_1", staffId: "op" })),
  currentStoreId: vi.fn(() => "store_1"),
  getTrialSettings: vi.fn(async () => ({
    trialEnabled: true,
    trialDefaultPrice: 499,
    trialAllowPriceEdit: true,
    trialMinPrice: 0,
    trialMaxPrice: 3000,
  })),
  ensureTrialPlan: vi.fn(async () => ({ id: "ckplan0000000000000000aaa" })),
  createCustomer: vi.fn(
    async (): Promise<
      | { success: true; data: { customerId: string } }
      | { success: false; error: string; existingCustomerId?: string }
    > => ({ success: true, data: { customerId: "ckcustomer0000000000000aa" } }),
  ),
  createBooking: vi.fn(async () => ({ success: true, data: { bookingId: "ckbk0000000000000000000aa" } })),
  staffFindFirst: vi.fn(async () => ({ id: "ckstaff000000000000000aaa" }) as { id: string } | null),
  custFindFirst: vi.fn(async () => ({ id: "ckcustomer0000000000000aa", assignedStaffId: null as string | null }) as { id: string; assignedStaffId: string | null } | null),
  custFindUnique: vi.fn(async () => ({ assignedStaffId: null as string | null }) as { assignedStaffId: string | null } | null),
  custUpdate: vi.fn(async () => ({})),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    staff: { findFirst: h.staffFindFirst },
    customer: { findFirst: h.custFindFirst, findUnique: h.custFindUnique, update: h.custUpdate },
  },
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.requirePermission }));
vi.mock("@/lib/store", () => ({ currentStoreId: h.currentStoreId }));
vi.mock("@/lib/shop-config", () => ({
  getTrialSettings: h.getTrialSettings,
  clampTrialPrice: (input: number, s: { trialAllowPriceEdit: boolean; trialDefaultPrice: number; trialMinPrice: number; trialMaxPrice: number }) =>
    !s.trialAllowPriceEdit
      ? s.trialDefaultPrice
      : Math.min(Math.max(Math.round(input), Math.min(s.trialMinPrice, s.trialMaxPrice)), Math.max(s.trialMinPrice, s.trialMaxPrice)),
}));
vi.mock("@/server/services/trial-plan", () => ({ ensureTrialPlan: h.ensureTrialPlan }));
vi.mock("@/server/actions/customer", () => ({ createCustomer: h.createCustomer }));
vi.mock("@/server/actions/booking", () => ({ createBooking: h.createBooking }));
vi.mock("@/server/queries/staff", () => ({ listStaffSelectOptions: vi.fn(async () => []) }));
vi.mock("@/lib/errors", () => ({
  AppError: class AppError extends Error { code: string; constructor(code: string, msg: string) { super(msg); this.code = code; } },
  handleActionError: (e: unknown) => ({ success: false, error: e instanceof Error ? e.message : "err" }),
}));

import { createTrialBooking } from "@/server/actions/trial-booking";

type BkArg = { bookingType: string; servicePlanId?: string; expectedAmount?: number; customerPlanWalletId?: string; customerId: string };
const lastBookingArg = (): BkArg => (h.createBooking.mock.calls.at(-1) as unknown as [BkArg])[0];

beforeEach(() => {
  vi.clearAllMocks();
  h.requirePermission.mockResolvedValue({ storeId: "store_1", staffId: "op" });
  h.currentStoreId.mockReturnValue("store_1");
  h.getTrialSettings.mockResolvedValue({ trialEnabled: true, trialDefaultPrice: 499, trialAllowPriceEdit: true, trialMinPrice: 0, trialMaxPrice: 3000 });
  h.ensureTrialPlan.mockResolvedValue({ id: CUID.plan });
  h.createBooking.mockResolvedValue({ success: true, data: { bookingId: "ckbk0000000000000000000aa" } });
  h.staffFindFirst.mockResolvedValue({ id: CUID.staff });
  h.custFindUnique.mockResolvedValue({ assignedStaffId: null });
});

const base = { assignedStaffId: CUID.staff, bookingDate: "2026-06-01", slotTime: "14:00" };

describe("createTrialBooking — no financial side-effects", () => {
  it("builds FIRST_TRIAL via createBooking with trial plan + clamped amount, NO wallet", async () => {
    h.custFindFirst.mockResolvedValue({ id: CUID.cust, assignedStaffId: null });
    const r = await createTrialBooking({ ...base, customerId: CUID.cust });
    expect(r.success).toBe(true);
    expect(h.createBooking).toHaveBeenCalledTimes(1);
    const a = lastBookingArg();
    expect(a.bookingType).toBe("FIRST_TRIAL");
    expect(a.servicePlanId).toBe(CUID.plan);
    expect(a.expectedAmount).toBe(499);
    expect(a.customerPlanWalletId).toBeUndefined();
  });

  it("never touches transaction/wallet prisma models (mock would throw)", async () => {
    h.custFindFirst.mockResolvedValue({ id: CUID.cust, assignedStaffId: "x" });
    const r = await createTrialBooking({ ...base, customerId: CUID.cust });
    expect(r.success).toBe(true); // clean success ⇒ no prisma.transaction/customerPlanWallet calls
  });
});

describe("createTrialBooking — customer dedupe", () => {
  it("duplicate phone → reuses existingCustomerId, no second Customer", async () => {
    h.createCustomer.mockResolvedValue({ success: false, error: "dup", existingCustomerId: CUID.custExisting });
    h.custFindUnique.mockResolvedValue({ assignedStaffId: "x" });
    const r = await createTrialBooking({ ...base, newCustomer: { name: "A", phone: "0912345678" } });
    expect(r.success).toBe(true);
    expect((r as { data: { customerId: string } }).data.customerId).toBe(CUID.custExisting);
    expect(lastBookingArg().customerId).toBe(CUID.custExisting);
  });
});

describe("createTrialBooking — expectedAmount snapshot/clamp", () => {
  it("not provided → store default", async () => {
    h.custFindFirst.mockResolvedValue({ id: CUID.cust, assignedStaffId: "x" });
    await createTrialBooking({ ...base, customerId: CUID.cust });
    expect(lastBookingArg().expectedAmount).toBe(499);
  });
  it("allowEdit=false → forced to default regardless of input", async () => {
    h.getTrialSettings.mockResolvedValue({ trialEnabled: true, trialDefaultPrice: 499, trialAllowPriceEdit: false, trialMinPrice: 0, trialMaxPrice: 3000 });
    h.custFindFirst.mockResolvedValue({ id: CUID.cust, assignedStaffId: "x" });
    await createTrialBooking({ ...base, customerId: CUID.cust, expectedAmount: 999 });
    expect(lastBookingArg().expectedAmount).toBe(499);
  });
  it("clamps to max (5000 → 3000)", async () => {
    h.custFindFirst.mockResolvedValue({ id: CUID.cust, assignedStaffId: "x" });
    await createTrialBooking({ ...base, customerId: CUID.cust, expectedAmount: 5000 });
    expect(lastBookingArg().expectedAmount).toBe(3000);
  });
});

describe("createTrialBooking — 直屬店長 no-overwrite", () => {
  it("sets assignedStaffId only when customer has none", async () => {
    h.custFindFirst.mockResolvedValue({ id: CUID.cust, assignedStaffId: null });
    h.custFindUnique.mockResolvedValue({ assignedStaffId: null });
    await createTrialBooking({ ...base, customerId: CUID.cust });
    expect(h.custUpdate).toHaveBeenCalledTimes(1);
  });
  it("does NOT overwrite an existing assignedStaffId", async () => {
    h.custFindFirst.mockResolvedValue({ id: CUID.cust, assignedStaffId: "already" });
    h.custFindUnique.mockResolvedValue({ assignedStaffId: "already" });
    await createTrialBooking({ ...base, customerId: CUID.cust });
    expect(h.custUpdate).not.toHaveBeenCalled();
  });
});
