import { beforeEach, describe, expect, it, vi } from "vitest";

const CUSTOMER_ID = "ck0000000000000000000c01";
const STAFF_TAICHUNG = "ck0000000000000000000s01";
const STAFF_ZHUBEI = "ck0000000000000000000s02";
const USER_ID = "ck0000000000000000000u01";

const h = vi.hoisted(() => ({
  requireWritablePermission: vi.fn(),
  requirePermission: vi.fn(),
  customerCount: vi.fn(),
  customerFindFirst: vi.fn(),
  customerFindUnique: vi.fn(),
  customerCreate: vi.fn(),
  customerUpdate: vi.fn(),
  staffFindUnique: vi.fn(),
  checkCustomerLimit: vi.fn(),
  checkCustomerLimitOrThrow: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      count: h.customerCount,
      findFirst: h.customerFindFirst,
      findUnique: h.customerFindUnique,
      create: h.customerCreate,
      update: h.customerUpdate,
    },
    staff: { findUnique: h.staffFindUnique },
  },
}));
vi.mock("@/lib/permissions", () => ({
  requireWritablePermission: h.requireWritablePermission,
  requirePermission: h.requirePermission,
}));
vi.mock("@/lib/session", () => ({
  requireSession: h.requirePermission,
}));
vi.mock("@/lib/subscription-guard", () => ({
  assertStoreSubscriptionWritable: vi.fn(async () => undefined),
}));
vi.mock("@/lib/shop-config", () => ({
  checkCustomerLimit: h.checkCustomerLimit,
}));
vi.mock("@/lib/usage-gate", () => ({
  checkCustomerLimitOrThrow: h.checkCustomerLimitOrThrow,
}));
vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? "store-taichung",
  getActiveStoreForRead: vi.fn(),
}));
vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: vi.fn(),
}));
vi.mock("@/server/queries/customer", () => ({
  getCustomerDrawerDetailForUser: vi.fn(),
}));
vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: vi.fn(),
  storeIdForViewContext: vi.fn(),
  userForViewContext: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));

beforeEach(() => {
  vi.clearAllMocks();
  h.requireWritablePermission.mockResolvedValue({
    id: USER_ID,
    role: "OWNER",
    storeId: "store-taichung",
    staffId: STAFF_TAICHUNG,
  });
  h.requirePermission.mockResolvedValue({
    id: USER_ID,
    role: "OWNER",
    storeId: "store-taichung",
    staffId: STAFF_TAICHUNG,
  });
  h.customerCount.mockResolvedValue(0);
  h.customerFindFirst.mockResolvedValue(null);
  h.customerFindUnique.mockResolvedValue({
    id: CUSTOMER_ID,
    name: "陳美惠",
    phone: "0988821221",
    storeId: "store-taichung",
    assignedStaffId: STAFF_TAICHUNG,
  });
  h.customerCreate.mockResolvedValue({ id: CUSTOMER_ID });
  h.customerUpdate.mockResolvedValue({});
  h.staffFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    status: "ACTIVE",
    storeId: where.id === STAFF_ZHUBEI ? "store-zhubei" : "store-taichung",
  }));
  h.checkCustomerLimit.mockResolvedValue({ allowed: true, limit: 100 });
  h.checkCustomerLimitOrThrow.mockResolvedValue(undefined);
});

describe("customer actions — store consistency", () => {
  it("allows same-store createCustomer with an active assigned staff", async () => {
    const { createCustomer } = await import("@/server/actions/customer");
    const result = await createCustomer({
      name: "陳美惠",
      phone: "0988-821-221",
      assignedStaffId: STAFF_TAICHUNG,
    });

    expect(result.success).toBe(true);
    expect(h.customerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: "store-taichung",
          assignedStaffId: STAFF_TAICHUNG,
        }),
      }),
    );
  });

  it("rejects createCustomer when assigned staff belongs to another store", async () => {
    const { createCustomer } = await import("@/server/actions/customer");
    const result = await createCustomer({
      name: "陳美惠",
      phone: "0988-821-221",
      assignedStaffId: STAFF_ZHUBEI,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("STORE_CONSISTENCY_MISMATCH");
    expect(h.customerCreate).not.toHaveBeenCalled();
  });

  it("rejects updateCustomer when a new assigned staff belongs to another store", async () => {
    const { updateCustomer } = await import("@/server/actions/customer");
    const result = await updateCustomer(CUSTOMER_ID, {
      name: "陳美惠",
      phone: "0988821221",
      assignedStaffId: STAFF_ZHUBEI,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("STORE_CONSISTENCY_MISMATCH");
    expect(h.customerUpdate).not.toHaveBeenCalled();
  });

  it("rejects transferCustomer for ADMIN/HQ-style cross-store staff assignment", async () => {
    h.requireWritablePermission.mockResolvedValueOnce({
      id: USER_ID,
      role: "ADMIN",
      storeId: "store-taichung",
      staffId: null,
    });

    const { transferCustomer } = await import("@/server/actions/customer");
    const result = await transferCustomer({
      customerId: CUSTOMER_ID,
      newStaffId: STAFF_ZHUBEI,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("STORE_CONSISTENCY_MISMATCH");
    expect(h.customerUpdate).not.toHaveBeenCalled();
  });

  it("allows transferCustomer when customer and new assigned staff are in the same store", async () => {
    const { transferCustomer } = await import("@/server/actions/customer");
    const result = await transferCustomer({
      customerId: CUSTOMER_ID,
      newStaffId: "ck0000000000000000000s03",
    });

    expect(result.success).toBe(true);
    expect(h.customerUpdate).toHaveBeenCalledWith({
      where: { id: CUSTOMER_ID },
      data: { assignedStaffId: "ck0000000000000000000s03" },
    });
  });
});
