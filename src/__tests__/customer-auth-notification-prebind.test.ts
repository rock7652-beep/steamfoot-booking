import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCustomerFindFirst = vi.fn();
const mockUserFindFirst = vi.fn();
const mockUserCreate = vi.fn();
const mockCustomerUpdateMany = vi.fn();
const mockAuditCreate = vi.fn();
const mockTransaction = vi.fn();
const mockSignIn = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    store: { findUnique: vi.fn(async () => ({ operatingStatus: "ACTIVE" })) },
    customer: { findFirst: (...args: unknown[]) => mockCustomerFindFirst(...args) },
    user: { findFirst: (...args: unknown[]) => mockUserFindFirst(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/auth", () => ({ signIn: (...args: unknown[]) => mockSignIn(...args) }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("bcryptjs", () => ({
  hashSync: vi.fn(() => "hashed-password"),
  compareSync: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), delete: vi.fn() })),
}));
vi.mock("@/lib/store-resolver", () => ({
  resolveStoreBySlug: vi.fn(async () => ({ id: "store-zhubei", slug: "zhubei" })),
}));
vi.mock("@/server/services/referral-events", () => ({ createRegisterEvent: vi.fn() }));
vi.mock("@/server/services/referral-binding", () => ({ bindReferralToCustomer: vi.fn() }));

function formData() {
  const data = new FormData();
  data.set("storeSlug", "zhubei");
  data.set("name", "QA LINE預綁驗收");
  data.set("phone", "0900000825");
  data.set("password", "825825");
  data.set("confirmPassword", "825825");
  data.set("gender", "male");
  data.set("birthday", "1990-01-01");
  return data;
}

describe("customerRegisterAction notification prebind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFindFirst.mockResolvedValue({
      id: "customer-prebound",
      storeId: "store-zhubei",
      phone: "0900000825",
      userId: null,
      lineUserId: "messaging-line-user-id",
      lineLinkedAt: new Date("2026-08-25T00:00:00Z"),
      lineLinkStatus: "LINKED",
    });
    mockUserFindFirst.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: "user-new" });
    mockCustomerUpdateMany.mockResolvedValue({ count: 1 });
    mockAuditCreate.mockResolvedValue({ id: "audit-1" });
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        user: { create: mockUserCreate },
        customer: { updateMany: mockCustomerUpdateMany },
        auditLog: { create: mockAuditCreate },
      }),
    );
  });

  it("activates the existing Customer and preserves its LINE notification recipient", async () => {
    const { customerRegisterAction } = await import("@/server/actions/customer-auth");

    const result = await customerRegisterAction({ error: null }, formData());

    expect(result).toEqual({ error: null });
    expect(mockCustomerUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "customer-prebound",
        userId: null,
        lineUserId: "messaging-line-user-id",
        lineLinkStatus: "LINKED",
      }),
      data: expect.not.objectContaining({ lineUserId: expect.anything() }),
    }));
    expect(mockSignIn).toHaveBeenCalledWith("customer-phone", expect.objectContaining({
      phone: "0900000825",
      storeId: "store-zhubei",
    }));
  });

  it("keeps ordinary back-office customers on the activation flow", async () => {
    mockCustomerFindFirst.mockResolvedValueOnce({
      id: "customer-manual",
      storeId: "store-zhubei",
      phone: "0900000825",
      userId: null,
      lineUserId: null,
      lineLinkedAt: null,
      lineLinkStatus: "UNLINKED",
    });
    const { customerRegisterAction } = await import("@/server/actions/customer-auth");

    const result = await customerRegisterAction({ error: null }, formData());

    expect(result).toEqual({ error: "NEEDS_ACTIVATION" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
