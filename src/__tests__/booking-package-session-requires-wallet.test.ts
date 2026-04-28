/**
 * P0 Regression: PACKAGE_SESSION 預約必須有有效方案（跨角色）
 *
 * 系統規則（一句話）：
 *   只要是 PACKAGE_SESSION，就一定要有可扣堂數 — 不看角色，看資料。
 *
 * 防止以下歷史 bug 復發：
 *   後台店長 / ADMIN 在沒有方案的顧客身上建立「課程堂數」預約 →
 *   markCompleted 時 wallet=null → 不扣堂卻顯示為套餐扣堂 → 污染堂數與報表。
 *
 * 守則：
 *   1. createBooking({ bookingType: "PACKAGE_SESSION" }) 對所有角色（CUSTOMER /
 *      STAFF / OWNER / ADMIN）都要檢查顧客有 ACTIVE wallet + remainingSessions > 0
 *   2. 沒方案 → 拒絕並回 error
 *   3. 有方案但呼叫端沒指定 walletId → server 自動綁定第一個可用 wallet（FIFO）
 *   4. markCompleted 對 PACKAGE_SESSION + 無 wallet 的 booking 必須拒絕
 *   5. 補課（isMakeup）不受此限制
 *   6. FIRST_TRIAL / SINGLE 不需方案
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const NO_PLAN_CUSTOMER_ID = "ck0000000000000000000001";
const PLAN_CUSTOMER_ID = "ck0000000000000000000002";
const STAFF_ID = "ck0000000000000000000050";
const OWNER_USER_ID = "ck0000000000000000000051";
const WALLET_ID = "ck0000000000000000000020";

const mockCustomerFindUnique = vi.fn();
const mockBookingFindUnique = vi.fn();
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
      findUnique: (...a: unknown[]) => mockBookingFindUnique(...a),
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
  mockBookingCreate.mockImplementation(async (args: { data: { customerId: string; storeId: string } }) => ({
    id: "ck0000000000000000000099",
    storeId: args.data.storeId,
    customerId: args.data.customerId,
  }));
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

const NO_PLAN_CUSTOMER_RECORD = {
  id: NO_PLAN_CUSTOMER_ID,
  storeId: STORE_A,
  selfBookingEnabled: true,
  assignedStaffId: null,
  sponsorId: null,
  email: null,
  phone: "0911000111",
  name: "No Plan Customer",
  birthday: null,
  gender: null,
  userId: null,
  planWallets: [], // ⚠ 沒有方案
};

const PLAN_CUSTOMER_RECORD = {
  id: PLAN_CUSTOMER_ID,
  storeId: STORE_A,
  selfBookingEnabled: true,
  assignedStaffId: null,
  sponsorId: null,
  email: null,
  phone: "0922000222",
  name: "Plan Customer",
  birthday: null,
  gender: null,
  userId: null,
  planWallets: [
    {
      id: WALLET_ID,
      remainingSessions: 5,
      expiryDate: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
  ],
};

// ────────────────────────────────────────────────────────────
// 無方案 → 全角色都拒（核心 P0 防呆）
// ────────────────────────────────────────────────────────────
describe("createBooking — PACKAGE_SESSION 無方案：全角色都拒", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBusinessHours();
    mockCustomerFindUnique.mockResolvedValue(NO_PLAN_CUSTOMER_RECORD);
    mockRequirePermission.mockResolvedValue({
      role: "OWNER",
      storeId: STORE_A,
      staffId: STAFF_ID,
      id: OWNER_USER_ID,
      email: "owner@x.com",
    });
  });

  it("CUSTOMER 自助 → rejected", async () => {
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: NO_PLAN_CUSTOMER_ID,
      id: "ck0000000000000000000010",
      email: "noplan@x.com",
    });

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: NO_PLAN_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      people: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/沒有可使用的方案|請先購買/);
    }
    expect(mockBookingCreate).not.toHaveBeenCalled();
  });

  it("STAFF 代約 → rejected", async () => {
    mockRequireSession.mockResolvedValue({
      role: "STAFF",
      storeId: STORE_A,
      staffId: STAFF_ID,
      id: "ck0000000000000000000060",
      email: "staff@x.com",
    });

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: NO_PLAN_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      people: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/沒有可用方案|請先指派/);
    }
    expect(mockBookingCreate).not.toHaveBeenCalled();
  });

  it("OWNER 代約 → rejected（這是 P0 主要修補的洞）", async () => {
    mockRequireSession.mockResolvedValue({
      role: "OWNER",
      storeId: STORE_A,
      staffId: STAFF_ID,
      id: OWNER_USER_ID,
      email: "owner@x.com",
    });

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: NO_PLAN_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      people: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/沒有可用方案|請先指派/);
    }
    expect(mockBookingCreate).not.toHaveBeenCalled();
  });

  it("ADMIN 代約 → rejected", async () => {
    mockRequireSession.mockResolvedValue({
      role: "ADMIN",
      storeId: STORE_A,
      staffId: STAFF_ID,
      id: OWNER_USER_ID,
      email: "admin@x.com",
    });

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: NO_PLAN_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      people: 1,
    });

    expect(result.success).toBe(false);
    expect(mockBookingCreate).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// 有方案 → 可建立 + 自動綁 wallet
// ────────────────────────────────────────────────────────────
describe("createBooking — PACKAGE_SESSION 有方案：可建立並綁 wallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBusinessHours();
    mockCustomerFindUnique.mockResolvedValue(PLAN_CUSTOMER_RECORD);
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

  it("有方案、沒指定 walletId → server 自動 FIFO 綁定", async () => {
    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: PLAN_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      // 注意：沒指定 customerPlanWalletId
      people: 1,
    });

    expect(result.success).toBe(true);
    const createCall = mockBookingCreate.mock.calls[0][0];
    // server 必須自動綁 wallet — 不可留 null（防資料污染）
    expect(createCall.data.customerPlanWalletId).toBe(WALLET_ID);
  });

  it("有方案、指定 walletId → 正常綁定", async () => {
    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: PLAN_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: WALLET_ID,
      people: 1,
    });

    expect(result.success).toBe(true);
    const createCall = mockBookingCreate.mock.calls[0][0];
    expect(createCall.data.customerPlanWalletId).toBe(WALLET_ID);
  });
});

// ────────────────────────────────────────────────────────────
// 特例：FIRST_TRIAL / SINGLE 不受限制
// ────────────────────────────────────────────────────────────
describe("createBooking — 特例不受 PACKAGE_SESSION 限制", () => {
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

  it("無方案顧客 + FIRST_TRIAL → 可建立（體驗不需方案）", async () => {
    mockCustomerFindUnique.mockResolvedValue(NO_PLAN_CUSTOMER_RECORD);

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: NO_PLAN_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "FIRST_TRIAL",
      people: 1,
    });

    expect(result.success).toBe(true);
  });

  it("無方案顧客 + SINGLE → 可建立（單次不需方案）", async () => {
    mockCustomerFindUnique.mockResolvedValue(NO_PLAN_CUSTOMER_RECORD);

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: NO_PLAN_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "SINGLE",
      people: 1,
    });

    expect(result.success).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// markCompleted：PACKAGE_SESSION 必須有 wallet 綁定
// ────────────────────────────────────────────────────────────
describe("markCompleted — PACKAGE_SESSION 必須綁定方案才能完成", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBusinessHours();
    mockRequirePermission.mockResolvedValue({
      role: "OWNER",
      storeId: STORE_A,
      staffId: STAFF_ID,
      id: OWNER_USER_ID,
      email: "owner@x.com",
    });
  });

  it("PACKAGE_SESSION + customerPlanWallet=null → 拒絕完成", async () => {
    mockBookingFindUnique.mockResolvedValue({
      id: "booking-1",
      storeId: STORE_A,
      customerId: NO_PLAN_CUSTOMER_ID,
      bookingDate: new Date("2026-04-27T00:00:00Z"),
      slotTime: "11:00",
      bookingStatus: "PENDING",
      bookingType: "PACKAGE_SESSION",
      isMakeup: false,
      customerPlanWalletId: null,
      customerPlanWallet: null, // ⚠ 沒綁方案（舊資料）
      revenueStaffId: null,
      serviceStaffId: null,
      customer: { sponsorId: null, customerStage: "ACTIVE" },
    });

    const { markCompleted } = await import("@/server/actions/booking");
    const result = await markCompleted("booking-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/沒有綁定可扣堂方案|請先修正方案資料/);
    }
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("PACKAGE_SESSION + 補課 + 無 wallet → 允許（補課不扣堂）", async () => {
    mockBookingFindUnique.mockResolvedValue({
      id: "booking-2",
      storeId: STORE_A,
      customerId: NO_PLAN_CUSTOMER_ID,
      bookingDate: new Date("2026-04-27T00:00:00Z"),
      slotTime: "11:00",
      bookingStatus: "PENDING",
      bookingType: "PACKAGE_SESSION",
      isMakeup: true, // 補課
      customerPlanWalletId: null,
      customerPlanWallet: null,
      revenueStaffId: null,
      serviceStaffId: null,
      customer: { sponsorId: null, customerStage: "ACTIVE" },
    });

    const { markCompleted } = await import("@/server/actions/booking");
    const result = await markCompleted("booking-2");

    expect(result.success).toBe(true);
  });

  it("FIRST_TRIAL + 無 wallet → 允許（體驗不需方案）", async () => {
    mockBookingFindUnique.mockResolvedValue({
      id: "booking-3",
      storeId: STORE_A,
      customerId: NO_PLAN_CUSTOMER_ID,
      bookingDate: new Date("2026-04-27T00:00:00Z"),
      slotTime: "11:00",
      bookingStatus: "PENDING",
      bookingType: "FIRST_TRIAL",
      isMakeup: false,
      customerPlanWalletId: null,
      customerPlanWallet: null,
      revenueStaffId: null,
      serviceStaffId: null,
      customer: { sponsorId: null, customerStage: "ACTIVE" },
    });

    const { markCompleted } = await import("@/server/actions/booking");
    const result = await markCompleted("booking-3");

    expect(result.success).toBe(true);
  });
});
