/**
 * 顧客有多個可用方案時，createBooking 自動綁定規則 = FEFO（最早到期優先）。
 *
 * 對照 src/lib/wallet-sort.ts：
 *   1. 有到期日的方案 < 沒到期日的方案
 *   2. 兩者都有到期日 → expiryDate ASC
 *   3. expiryDate 相同 → createdAt ASC
 *   4. createdAt 也相同 → id ASC（穩定）
 *
 * 注意：
 *   - 顧客自己 / 後台店長明確指定 walletId 時不被覆蓋
 *   - 完成時扣 booking.customerPlanWallet（預約當下綁的），不重新挑選
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const CUSTOMER_ID = "ck0000000000000000000002";
const STAFF_ID = "ck0000000000000000000050";
const OWNER_USER_ID = "ck0000000000000000000051";

// cuid v1 格式 (Zod 用 .cuid() 驗證輸入)
const WALLET_NO_EXPIRY_OLD = "ck0000000000000000000n01"; // 先買、無期限
const WALLET_EARLY_EXPIRY = "ck0000000000000000000e01"; // 後買、6/30 到期
const WALLET_LATE_EXPIRY = "ck0000000000000000000l01"; // 中間、8/31 到期

const mockCustomerFindUnique = vi.fn();
const mockBookingCount = vi.fn();
const mockBookingAggregate = vi.fn();
const mockBookingCreate = vi.fn();
const mockBookingUpdate = vi.fn();
const mockTransactionCreate = vi.fn();
const mockBusinessHoursFindMany = vi.fn();
const mockBusinessHoursFindFirst = vi.fn();
const mockSpecialDayFindMany = vi.fn();
const mockSpecialDayFindFirst = vi.fn();
const mockSlotOverrideFindMany = vi.fn();
const mockDutyAssignmentCount = vi.fn();
const mockStoreFindUnique = vi.fn();
const mockTx = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findUnique: (...a: unknown[]) => mockCustomerFindUnique(...a) },
    booking: {
      findUnique: vi.fn(),
      count: (...a: unknown[]) => mockBookingCount(...a),
      aggregate: (...a: unknown[]) => mockBookingAggregate(...a),
      create: (...a: unknown[]) => mockBookingCreate(...a),
      update: (...a: unknown[]) => mockBookingUpdate(...a),
    },
    businessHours: {
      findMany: (...a: unknown[]) => mockBusinessHoursFindMany(...a),
      findFirst: (...a: unknown[]) => mockBusinessHoursFindFirst(...a),
    },
    specialBusinessDay: {
      findMany: (...a: unknown[]) => mockSpecialDayFindMany(...a),
      findFirst: (...a: unknown[]) => mockSpecialDayFindFirst(...a),
    },
    slotOverride: { findMany: (...a: unknown[]) => mockSlotOverrideFindMany(...a) },
    dutyAssignment: { count: (...a: unknown[]) => mockDutyAssignmentCount(...a) },
    store: { findUnique: (...a: unknown[]) => mockStoreFindUnique(...a) },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTx(cb),
  },
}));

const mockRequireSession = vi.fn();
const mockRequirePermission = vi.fn();
vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
  requireStaffSession: () => mockRequireSession(),
}));
vi.mock("@/lib/permissions", () => ({
  requirePermission: () => mockRequirePermission(),
}));
vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? STORE_A,
  DEFAULT_STORE_ID: "default-store",
  getActiveStoreForRead: vi.fn(),
}));
vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: vi.fn(),
  getStoreFilter: () => ({}),
}));
vi.mock("@/lib/shop-config", () => ({
  isDutySchedulingEnabled: vi.fn(async () => false),
  checkBookingLimit: vi.fn(async () => ({ allowed: true, current: 0, limit: 100 })),
}));
vi.mock("@/lib/usage-gate", () => ({
  checkMonthlyBookingLimitOrThrow: vi.fn(async () => undefined),
}));
vi.mock("@/lib/date-utils", () => ({
  toLocalDateStr: () => "2026-04-26",
  getNowTaipeiHHmm: () => "00:00",
}));
vi.mock("@/lib/booking-constants", () => ({
  PENDING_STATUSES: ["PENDING", "CONFIRMED"] as const,
  getBookingDateTime: (d: Date, t: string) => {
    const [h, m] = t.split(":").map(Number);
    const dd = new Date(d);
    dd.setUTCHours(h, m, 0, 0);
    return dd;
  },
}));
vi.mock("@/lib/revalidation", () => ({ revalidateBookings: vi.fn() }));
vi.mock("@/server/services/referral-events", () => ({
  createBookingCreatedEvent: vi.fn(async () => undefined),
  createBookingCompletedEvent: vi.fn(async () => undefined),
}));
vi.mock("@/server/services/referral-points", () => ({
  awardFirstBookingReferralPointsIfEligible: vi.fn(async () => undefined),
}));
vi.mock("@/server/actions/points", () => ({
  awardPoints: vi.fn(async () => undefined),
}));
vi.mock("@/server/services/wallet-session", () => ({
  allocateSession: vi.fn(async () => null),
  releaseSession: vi.fn(async () => true),
  completeSession: vi.fn(async () => true),
  uncompleteSession: vi.fn(async () => true),
  reReserveSession: vi.fn(async () => null),
}));

function setupBusinessHours() {
  mockBusinessHoursFindMany.mockResolvedValue(
    [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
      dayOfWeek: dow,
      isOpen: true,
      openTime: "10:00",
      closeTime: "22:00",
      slotInterval: 60,
      defaultCapacity: 6,
    })),
  );
  mockBusinessHoursFindFirst.mockResolvedValue({
    dayOfWeek: 0,
    isOpen: true,
    openTime: "10:00",
    closeTime: "22:00",
    slotInterval: 60,
    defaultCapacity: 6,
  });
  mockSpecialDayFindMany.mockResolvedValue([]);
  mockSpecialDayFindFirst.mockResolvedValue(null);
  mockSlotOverrideFindMany.mockResolvedValue([]);
  mockBookingCount.mockResolvedValue(0);
  mockBookingAggregate.mockResolvedValue({ _sum: { people: 0 } });
  mockDutyAssignmentCount.mockResolvedValue(0);
  mockBookingCreate.mockImplementation(
    async (args: { data: { customerId: string; storeId: string } }) => ({
      id: "ck0000000000000000000099",
      storeId: args.data.storeId,
      customerId: args.data.customerId,
    }),
  );
  mockTx.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      booking: { create: mockBookingCreate, update: mockBookingUpdate },
      makeupCredit: { update: vi.fn(), create: vi.fn() },
      customerPlanWallet: {
        findUnique: vi.fn(async () => ({ remainingSessions: 5 })),
        update: vi.fn(),
        count: vi.fn(async () => 0),
      },
      customer: { update: vi.fn() },
      transaction: { create: mockTransactionCreate, deleteMany: vi.fn() },
    }),
  );
}

function customerWith(planWallets: Array<{
  id: string;
  remainingSessions: number;
  expiryDate: Date | null;
  createdAt: Date;
}>) {
  return {
    id: CUSTOMER_ID,
    storeId: STORE_A,
    selfBookingEnabled: true,
    assignedStaffId: null,
    sponsorId: null,
    email: null,
    phone: "0922000222",
    name: "Multi Wallet Customer",
    birthday: null,
    gender: null,
    userId: "ck0000000000000000000010",
    planWallets,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupBusinessHours();
  mockRequireSession.mockResolvedValue({
    role: "OWNER",
    storeId: STORE_A,
    staffId: STAFF_ID,
    id: OWNER_USER_ID,
    email: "owner@x.com",
  });
  mockRequirePermission.mockResolvedValue({
    role: "OWNER",
    storeId: STORE_A,
    staffId: STAFF_ID,
    id: OWNER_USER_ID,
    email: "owner@x.com",
  });
});

describe("createBooking auto-pick — FEFO（最早到期優先）", () => {
  it("先買無期限 vs 後買快到期 → 自動選快到期（不再 FIFO）", async () => {
    mockCustomerFindUnique.mockResolvedValue(
      customerWith([
        {
          id: WALLET_NO_EXPIRY_OLD,
          remainingSessions: 5,
          expiryDate: null,
          createdAt: new Date("2025-12-01T00:00:00Z"),
        },
        {
          id: WALLET_EARLY_EXPIRY,
          remainingSessions: 3,
          expiryDate: new Date("2026-05-31T00:00:00Z"),
          createdAt: new Date("2026-04-01T00:00:00Z"),
        },
      ]),
    );

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      people: 1,
    });

    expect(result.success).toBe(true);
    const createCall = mockBookingCreate.mock.calls[0][0];
    expect(createCall.data.customerPlanWalletId).toBe(WALLET_EARLY_EXPIRY);
  });

  it("多張有到期日方案 → 自動選最早到期", async () => {
    mockCustomerFindUnique.mockResolvedValue(
      customerWith([
        {
          id: WALLET_LATE_EXPIRY,
          remainingSessions: 3,
          expiryDate: new Date("2026-08-31T00:00:00Z"),
          createdAt: new Date("2026-02-01T00:00:00Z"),
        },
        {
          id: WALLET_EARLY_EXPIRY,
          remainingSessions: 3,
          expiryDate: new Date("2026-06-30T00:00:00Z"),
          createdAt: new Date("2026-03-01T00:00:00Z"),
        },
        {
          id: WALLET_NO_EXPIRY_OLD,
          remainingSessions: 5,
          expiryDate: null,
          createdAt: new Date("2025-12-01T00:00:00Z"),
        },
      ]),
    );

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      people: 1,
    });

    expect(result.success).toBe(true);
    expect(mockBookingCreate.mock.calls[0][0].data.customerPlanWalletId).toBe(
      WALLET_EARLY_EXPIRY,
    );
  });

  it("快到期方案票券期限不足以涵蓋預約日 → 跳過、自動選下一個合格方案", async () => {
    // 預約日 2026-04-27
    // wallet A：到期 2026-04-20（已過預約日，不合格）
    // wallet B：到期 2026-08-31（合格）
    mockCustomerFindUnique.mockResolvedValue(
      customerWith([
        {
          id: "ck0000000000000000000x01",
          remainingSessions: 3,
          expiryDate: new Date("2026-04-20T00:00:00Z"),
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: WALLET_LATE_EXPIRY,
          remainingSessions: 3,
          expiryDate: new Date("2026-08-31T00:00:00Z"),
          createdAt: new Date("2026-02-01T00:00:00Z"),
        },
      ]),
    );

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      people: 1,
    });

    expect(result.success).toBe(true);
    expect(mockBookingCreate.mock.calls[0][0].data.customerPlanWalletId).toBe(
      WALLET_LATE_EXPIRY,
    );
  });

  it("呼叫端明確指定 walletId → 不被 FEFO 規則覆蓋", async () => {
    mockCustomerFindUnique.mockResolvedValue(
      customerWith([
        {
          id: WALLET_EARLY_EXPIRY,
          remainingSessions: 3,
          expiryDate: new Date("2026-06-30T00:00:00Z"),
          createdAt: new Date("2026-03-01T00:00:00Z"),
        },
        {
          id: WALLET_NO_EXPIRY_OLD,
          remainingSessions: 5,
          expiryDate: null,
          createdAt: new Date("2025-12-01T00:00:00Z"),
        },
      ]),
    );

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      // 顧客 / 店長明確指定要用哪一支 wallet
      customerPlanWalletId: WALLET_NO_EXPIRY_OLD,
      people: 1,
    });

    expect(result.success).toBe(true);
    expect(mockBookingCreate.mock.calls[0][0].data.customerPlanWalletId).toBe(
      WALLET_NO_EXPIRY_OLD,
    );
  });
});
