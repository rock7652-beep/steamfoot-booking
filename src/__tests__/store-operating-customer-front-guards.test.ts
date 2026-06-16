import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isStoreBookableStatus,
  isStoreCustomerPortalBlocked,
} from "@/lib/store-operating-status";

const STORE_ID = "store-zhubei";
const STORE_SLUG = "zhubei";
const USER_ID = "ck0000000000000000000002";
const CUSTOMER_ID = "ck0000000000000000000001";
const PLAN_ID = "ck0000000000000000000003";

const mockStoreFindUnique = vi.fn();
const mockUserCreate = vi.fn();
const mockServicePlanFindFirst = vi.fn();
const mockWalletCreate = vi.fn();
const mockTransactionCreate = vi.fn();
const mockDbTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findUnique: (...args: unknown[]) => mockStoreFindUnique(...args),
    },
    user: {
      findFirst: vi.fn(),
      create: (...args: unknown[]) => mockUserCreate(...args),
    },
    customer: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    servicePlan: {
      findFirst: (...args: unknown[]) => mockServicePlanFindFirst(...args),
    },
    customerPlanWallet: {
      create: (...args: unknown[]) => mockWalletCreate(...args),
    },
    transaction: {
      create: (...args: unknown[]) => mockTransactionCreate(...args),
    },
    $transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}));

vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
}));

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

vi.mock("bcryptjs", () => ({
  hashSync: vi.fn(() => "hashed-password"),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) =>
      name === "store-slug" ? { value: STORE_SLUG } : undefined,
    ),
    delete: vi.fn(),
  })),
}));

vi.mock("@/lib/store-resolver", () => ({
  resolveStoreBySlug: vi.fn(async (slug: string) => ({
    id: STORE_ID,
    slug,
  })),
}));

vi.mock("@/lib/store-context", () => ({
  getStoreContext: vi.fn(async () => ({
    storeId: STORE_ID,
    storeSlug: STORE_SLUG,
  })),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: USER_ID,
    role: "CUSTOMER",
    customerId: CUSTOMER_ID,
    email: "customer@example.com",
    storeId: STORE_ID,
  })),
}));

vi.mock("@/server/queries/customer-completion", () => ({
  resolveCustomerForUser: vi.fn(async () => ({
    customer: { id: CUSTOMER_ID },
    reason: "found_by_id",
  })),
}));

vi.mock("@/server/services/referral-events", () => ({
  createRegisterEvent: vi.fn(),
}));

vi.mock("@/server/services/referral-binding", () => ({
  bindReferralToCustomer: vi.fn(),
}));

vi.mock("@/server/services/customer-assignment", () => ({
  resolveCustomerStaffAssignment: vi.fn(async () => ({
    staffId: "staff-owner",
    source: "store_owner",
  })),
}));

vi.mock("@/server/services/wallet-session", () => ({
  seedWalletSessions: vi.fn(),
  reconcileForManualAdjust: vi.fn(),
  voidAvailableSession: vi.fn(),
  backfillAvailableSessions: vi.fn(),
  WalletSessionError: class WalletSessionError extends Error {},
}));

vi.mock("@/lib/transaction-snapshot", () => ({
  buildTransactionSnapshot: vi.fn(async () => ({})),
}));

vi.mock("@/server/services/referral-points", () => ({
  awardFirstTopupReferralPointsIfEligible: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

function registerFormData() {
  const formData = new FormData();
  formData.set("storeSlug", STORE_SLUG);
  formData.set("name", "王小明");
  formData.set("phone", "0912345678");
  formData.set("password", "123456");
  formData.set("confirmPassword", "123456");
  formData.set("gender", "male");
  formData.set("birthday", "1990-01-01");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStoreFindUnique.mockResolvedValue({ operatingStatus: "ACTIVE" });
  mockServicePlanFindFirst.mockResolvedValue({
    id: PLAN_ID,
    storeId: STORE_ID,
    isActive: true,
    publicVisible: true,
    price: 1200,
    category: "PACKAGE",
    sessionCount: 4,
    validityDays: 30,
  });
  mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      customerPlanWallet: { create: mockWalletCreate },
      transaction: { create: mockTransactionCreate },
    }),
  );
});

describe("store operating status customer-facing guards", () => {
  it("PAUSED/INACTIVE 不可顧客註冊", async () => {
    const { customerRegisterAction } = await import("@/server/actions/customer-auth");

    mockStoreFindUnique.mockResolvedValueOnce({ operatingStatus: "PAUSED" });
    const paused = await customerRegisterAction({ error: null }, registerFormData());
    expect(paused.error).toMatch(/暫停營業/);
    expect(mockUserCreate).not.toHaveBeenCalled();

    mockStoreFindUnique.mockResolvedValueOnce({ operatingStatus: "INACTIVE" });
    const inactive = await customerRegisterAction({ error: null }, registerFormData());
    expect(inactive.error).toMatch(/已停用/);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("PAUSED/INACTIVE 不可顧客自助購買方案", async () => {
    const { initiateCustomerPlanPurchase } = await import("@/server/actions/wallet");

    mockStoreFindUnique.mockResolvedValueOnce({ operatingStatus: "PAUSED" });
    const paused = await initiateCustomerPlanPurchase({
      planId: PLAN_ID,
      transferLastFour: "1234",
    });
    expect(paused.success).toBe(false);
    if (!paused.success) expect(paused.error).toMatch(/暫停營業/);

    mockStoreFindUnique.mockResolvedValueOnce({ operatingStatus: "INACTIVE" });
    const inactive = await initiateCustomerPlanPurchase({
      planId: PLAN_ID,
      transferLastFour: "1234",
    });
    expect(inactive.success).toBe(false);
    if (!inactive.success) expect(inactive.error).toMatch(/已停用/);

    expect(mockWalletCreate).not.toHaveBeenCalled();
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });

  it("PAUSED 不阻擋整個顧客既有資料區，INACTIVE 才硬擋顧客區", () => {
    expect(isStoreBookableStatus("PAUSED")).toBe(false);
    expect(isStoreCustomerPortalBlocked("PAUSED")).toBe(false);
    expect(isStoreCustomerPortalBlocked("INACTIVE")).toBe(true);
  });
});
