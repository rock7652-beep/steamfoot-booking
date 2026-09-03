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
 *   3. 有方案但呼叫端沒指定 walletId → server 自動綁定第一個可用 wallet（FEFO 最早到期優先）
 *   4. markCompleted 對 PACKAGE_SESSION + 無 wallet 的 booking 必須拒絕
 *   5. 補課（isMakeup）不受此限制
 *   6. FIRST_TRIAL / SINGLE 不需方案
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/industry-module-server", () => ({
  getStoreIndustryModule: vi.fn(async () => "steamfoot"),
}));

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
const mockBookingFindFirst = vi.fn();
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

const mockTransactionFindFirst = vi.fn();
// PR-NoShow-2：補課自助預約用（多券 join table）
const mockMakeupCount = vi.fn();
const mockTxQueryRaw = vi.fn();
const mockTxMakeupUpdateMany = vi.fn();
const mockTxJoinCreateMany = vi.fn();
const mockTxJoinFindMany = vi.fn();
const mockTxJoinDeleteMany = vi.fn();
const mockWalletSessionCount = vi.fn();
const mockAllocateSessionsFefo = vi.fn<(...args: unknown[]) => Promise<{ allocations: unknown[]; primaryWalletId: string | null }>>(async () => ({ allocations: [], primaryWalletId: null }));
const mockAcquireBookingSlotLocks = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findUnique: (...a: unknown[]) => mockCustomerFindUnique(...a) },
    makeupCredit: { count: (...a: unknown[]) => mockMakeupCount(...a) },
    booking: {
      findUnique: (...a: unknown[]) => mockBookingFindUnique(...a),
      count: (...a: unknown[]) => mockBookingCount(...a),
      aggregate: (...a: unknown[]) => mockBookingAggregate(...a),
      create: (...a: unknown[]) => mockBookingCreate(...a),
      update: (...a: unknown[]) => mockBookingUpdate(...a),
    },
    transaction: {
      findFirst: (...a: unknown[]) => mockTransactionFindFirst(...a),
    },
    walletSession: {
      count: (...a: unknown[]) => mockWalletSessionCount(...a),
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
    shopConfig: { findUnique: vi.fn(async () => null) },
    store: { findUnique: (...a: unknown[]) => mockStoreFindUnique(...a) },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTx(cb),
  },
}));
vi.mock("@/server/services/booking-slot-lock", () => ({
  acquireBookingSlotLocks: (...args: unknown[]) => mockAcquireBookingSlotLocks(...args),
  bookingSlotTimeVariants: (slotTime: string) => [slotTime],
}));

const mockRequireSession = vi.fn();
const mockRequirePermission = vi.fn();
vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
  requireStaffSession: () => mockRequireSession(),
}));
vi.mock("@/lib/permissions", () => ({
  requirePermission: () => mockRequirePermission(),
  requireWritablePermission: () => mockRequirePermission(),
}));
vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: vi.fn(async () => null),
}));
vi.mock("@/lib/store-organization", () => ({
  assertWritableStoreViewContext: vi.fn(),
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
  resolveBookableUntilDate: vi.fn(() => "2026-12-31"),
}));
vi.mock("@/lib/usage-gate", () => ({
  checkMonthlyBookingLimitOrThrow: vi.fn(async () => undefined),
}));
vi.mock("@/lib/date-utils", () => ({
  toLocalDateStr: () => "2026-04-26",
  getNowTaipeiHHmm: () => "00:00",
  dayRange: (date: string) => ({
    start: new Date(`${date}T00:00:00+08:00`),
    end: new Date(`${date}T23:59:59.999+08:00`),
  }),
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
  allocateSessions: vi.fn(async () => ({ allocated: 0 })),
  allocateSessionsFefo: (...a: unknown[]) => mockAllocateSessionsFefo(...a),
  releaseSessions: vi.fn(async () => ({ released: 1 })),
  completeSessions: vi.fn(async () => ({ completed: 1, items: [] })),
  uncompleteSessions: vi.fn(async () => ({ uncompleted: 1 })),
  reReserveSessions: vi.fn(async () => ({ reReserved: 0 })),
  reReserveSessionsFefo: vi.fn(async () => ({ reReserved: 0, allocations: [], primaryWalletId: null })),
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
  mockWalletSessionCount.mockResolvedValue(0);
  mockBookingAggregate.mockResolvedValue({ _sum: { people: 0 } });
  mockBookingFindFirst.mockResolvedValue(null);
  mockDutyAssignmentCount.mockResolvedValue(0);
  mockBookingCreate.mockImplementation(async (args: { data: { customerId: string; storeId: string } }) => ({
    id: "ck0000000000000000000099",
    storeId: args.data.storeId,
    customerId: args.data.customerId,
  }));
  mockMakeupCount.mockResolvedValue(0);
  mockTxQueryRaw.mockResolvedValue([]);
  mockTxMakeupUpdateMany.mockResolvedValue({ count: 0 });
  mockTxJoinCreateMany.mockResolvedValue({ count: 0 });
  mockTxJoinFindMany.mockResolvedValue([]);
  mockTxJoinDeleteMany.mockResolvedValue({ count: 0 });
  mockAllocateSessionsFefo.mockResolvedValue({ allocations: [], primaryWalletId: null });
  mockTx.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      $queryRaw: (...a: unknown[]) => mockTxQueryRaw(...a),
      booking: {
        aggregate: mockBookingAggregate,
        findFirst: mockBookingFindFirst,
        create: mockBookingCreate,
        update: mockBookingUpdate,
      },
      makeupCredit: { updateMany: (...a: unknown[]) => mockTxMakeupUpdateMany(...a), update: vi.fn(), create: vi.fn() },
      bookingMakeupCredit: {
        createMany: (...a: unknown[]) => mockTxJoinCreateMany(...a),
        findMany: (...a: unknown[]) => mockTxJoinFindMany(...a),
        deleteMany: (...a: unknown[]) => mockTxJoinDeleteMany(...a),
      },
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
  // 必須與 mockRequireSession 的 user.id 一致 — resolveCustomerForUser path A
  // 現在會驗 userId 必符當前 session（防 merge 後 placeholder 被誤判為當前綁定）。
  userId: "ck0000000000000000000010",
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
  userId: "ck0000000000000000000010",
  planWallets: [
    {
      id: WALLET_ID,
      storeId: STORE_A,
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

  it("有方案、沒指定 walletId → server 自動 FEFO 綁定", async () => {
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

  it("FIRST_TRIAL + 已收款 + 無 wallet → 允許（提前收款後完成服務）", async () => {
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
    mockTransactionFindFirst.mockResolvedValue({ id: "tx_trial_paid" });

    const { markCompleted } = await import("@/server/actions/booking");
    const result = await markCompleted("booking-3");

    expect(result.success).toBe(true);
  });

  it("FIRST_TRIAL + 尚未收款 → 拒絕完成服務", async () => {
    mockBookingFindUnique.mockResolvedValue({
      id: "booking-trial-unpaid",
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
    mockTransactionFindFirst.mockResolvedValue(null);

    const { markCompleted } = await import("@/server/actions/booking");
    const result = await markCompleted("booking-trial-unpaid");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/請先完成體驗收款/);
    expect(mockTx).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// markCompleted：SINGLE（不扣堂）必須先收款才能完成（P0 防漏帳）
// ────────────────────────────────────────────────────────────
describe("markCompleted — SINGLE 必須先收款才能完成", () => {
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

  it("SINGLE + 尚未收款（無 SINGLE_PURCHASE SUCCESS）→ 拒絕完成", async () => {
    mockBookingFindUnique.mockResolvedValue({
      id: "booking-single-1",
      storeId: STORE_A,
      customerId: NO_PLAN_CUSTOMER_ID,
      bookingDate: new Date("2026-04-27T00:00:00Z"),
      slotTime: "11:00",
      bookingStatus: "PENDING",
      bookingType: "SINGLE",
      isMakeup: false,
      customerPlanWalletId: null,
      customerPlanWallet: null,
      revenueStaffId: null,
      serviceStaffId: null,
      customer: { sponsorId: null, customerStage: "ACTIVE" },
    });
    mockTransactionFindFirst.mockResolvedValue(null); // 沒收款

    const { markCompleted } = await import("@/server/actions/booking");
    const result = await markCompleted("booking-single-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/請先完成單次收款/);
    }
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("SINGLE + 已收款（有 SINGLE_PURCHASE SUCCESS）→ 允許完成", async () => {
    mockBookingFindUnique.mockResolvedValue({
      id: "booking-single-2",
      storeId: STORE_A,
      customerId: NO_PLAN_CUSTOMER_ID,
      bookingDate: new Date("2026-04-27T00:00:00Z"),
      slotTime: "11:00",
      bookingStatus: "PENDING",
      bookingType: "SINGLE",
      isMakeup: false,
      customerPlanWalletId: null,
      customerPlanWallet: null,
      revenueStaffId: null,
      serviceStaffId: null,
      customer: { sponsorId: null, customerStage: "ACTIVE" },
    });
    mockTransactionFindFirst.mockResolvedValue({ id: "tx_paid" }); // 已收款

    const { markCompleted } = await import("@/server/actions/booking");
    const result = await markCompleted("booking-single-2");

    expect(result.success).toBe(true);
    // SINGLE 不應該 create SESSION_DEDUCTION（不扣堂）
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// createBooking — 補課自助預約核心 (PR-NoShow-2)
//   用 OWNER session 測 makeup 分支核心（避開 CUSTOMER-only bookable-until gate）；
//   makeup 邏輯本身與角色無關。
// ────────────────────────────────────────────────────────────
describe("createBooking — 補課自助預約 (PR-NoShow-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBusinessHours();
    // 補課不需 wallet → 用無方案顧客即可
    mockCustomerFindUnique.mockResolvedValue(NO_PLAN_CUSTOMER_RECORD);
    mockRequireSession.mockResolvedValue({
      role: "OWNER",
      storeId: STORE_A,
      staffId: STAFF_ID,
      id: OWNER_USER_ID,
      email: "owner@x.com",
    });
  });

  const makeupInput = {
    customerId: NO_PLAN_CUSTOMER_ID,
    bookingDate: "2026-04-27",
    slotTime: "11:00",
    bookingType: "PACKAGE_SESSION" as const,
    isMakeup: true,
  };

  it("people=1 有 1 券 → 自選 1 張、標 isUsed、建 1 筆 join row、isMakeup booking、不扣堂", async () => {
    mockMakeupCount.mockResolvedValue(1);
    mockTxQueryRaw.mockResolvedValue([{ id: "mc-1" }]);

    const { createBooking } = await import("@/server/actions/booking");
    const r = await createBooking(makeupInput);

    expect(r.success).toBe(true);
    expect(mockTxQueryRaw).toHaveBeenCalledTimes(1); // tx 內 FOR UPDATE 挑券
    // N 張券標記 isUsed
    expect(mockTxMakeupUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["mc-1"] } },
      data: { isUsed: true },
    });
    // join row：1 筆
    const joinData = mockTxJoinCreateMany.mock.calls[0][0].data;
    expect(joinData).toHaveLength(1);
    expect(joinData[0].makeupCreditId).toBe("mc-1");
    // booking：isMakeup + legacy makeupCreditId=第一張；不扣方案堂數
    const created = mockBookingCreate.mock.calls[0][0].data;
    expect(created.isMakeup).toBe(true);
    expect(created.makeupCreditId).toBe("mc-1");
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });

  it("people=2 有 2 券 → 自選 2 張、標 2 張 isUsed、建 2 筆 join row（多人多券）", async () => {
    mockMakeupCount.mockResolvedValue(2);
    mockTxQueryRaw.mockResolvedValue([{ id: "mc-1" }, { id: "mc-2" }]);

    const { createBooking } = await import("@/server/actions/booking");
    const r = await createBooking({ ...makeupInput, people: 2 });

    expect(r.success).toBe(true);
    expect(mockTxMakeupUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["mc-1", "mc-2"] } },
      data: { isUsed: true },
    });
    const joinData = mockTxJoinCreateMany.mock.calls[0][0].data;
    expect(joinData).toHaveLength(2);
    expect(joinData.map((d: { makeupCreditId: string }) => d.makeupCreditId)).toEqual([
      "mc-1",
      "mc-2",
    ]);
    const created = mockBookingCreate.mock.calls[0][0].data;
    expect(created.isMakeup).toBe(true);
    expect(created.makeupCreditId).toBe("mc-1"); // legacy = 第一張
  });

  it("people=4 有 2 券 + 方案 5 堂 → 用 2 張補課券並只保留 2 堂方案", async () => {
    mockCustomerFindUnique.mockResolvedValue(PLAN_CUSTOMER_RECORD);
    mockMakeupCount.mockResolvedValue(2);
    mockTxQueryRaw.mockResolvedValue([{ id: "mc-1" }, { id: "mc-2" }]);

    const { createBooking } = await import("@/server/actions/booking");
    const r = await createBooking({ ...makeupInput, customerId: PLAN_CUSTOMER_ID, people: 4 });

    expect(r.success).toBe(true);
    expect(mockTxMakeupUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["mc-1", "mc-2"] } },
      data: { isUsed: true },
    });
    const joinData = mockTxJoinCreateMany.mock.calls[0][0].data;
    expect(joinData).toHaveLength(2);
    expect(mockAllocateSessionsFefo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bookingId: "ck0000000000000000000099",
        count: 2,
        preferredWalletId: WALLET_ID,
      }),
    );
    const created = mockBookingCreate.mock.calls[0][0].data;
    expect(created.isMakeup).toBe(true);
    expect(created.customerPlanWalletId).toBe(WALLET_ID);
  });

  it("people=4 有 1 券 + 方案只剩 2 堂 → 拒絕（總可抵用不足）", async () => {
    mockCustomerFindUnique.mockResolvedValue({
      ...PLAN_CUSTOMER_RECORD,
      planWallets: [{ ...PLAN_CUSTOMER_RECORD.planWallets[0], remainingSessions: 2 }],
    });
    mockMakeupCount.mockResolvedValue(1);

    const { createBooking } = await import("@/server/actions/booking");
    const r = await createBooking({ ...makeupInput, customerId: PLAN_CUSTOMER_ID, people: 4 });

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/方案次數不足/);
    expect(mockBookingCreate).not.toHaveBeenCalled();
    expect(mockTxQueryRaw).not.toHaveBeenCalled();
  });

  it("people=1 但無券且無方案 → 拒絕", async () => {
    mockMakeupCount.mockResolvedValue(0);

    const { createBooking } = await import("@/server/actions/booking");
    const r = await createBooking(makeupInput);

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/沒有可用方案|沒有可使用的方案/);
    expect(mockBookingCreate).not.toHaveBeenCalled();
  });

  it("併發：tx 內挑到的券 < people（被搶）→ CONFLICT rollback，不建 join row", async () => {
    mockMakeupCount.mockResolvedValue(2); // 前置檢查過
    mockTxQueryRaw.mockResolvedValue([{ id: "mc-1" }]); // 但 tx 內只鎖到 1 張

    const { createBooking } = await import("@/server/actions/booking");
    const r = await createBooking({ ...makeupInput, people: 2 });

    expect(r.success).toBe(false);
    expect(mockTxJoinCreateMany).not.toHaveBeenCalled();
  });

  it("slot lock 後才在 transaction 內檢查容量，不永久禁止同客同時段多筆預約", async () => {
    mockCustomerFindUnique.mockResolvedValue(PLAN_CUSTOMER_RECORD);
    mockBookingFindFirst.mockResolvedValue({ id: "existing-booking" });

    const { createBooking } = await import("@/server/actions/booking");
    const r = await createBooking({
      customerId: PLAN_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      people: 1,
    });

    expect(r.success).toBe(true);
    expect(mockAcquireBookingSlotLocks).toHaveBeenCalledTimes(1);
    expect(mockBookingAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: STORE_A,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        }),
      }),
    );
    expect(mockBookingFindFirst).not.toHaveBeenCalled();
    expect(mockBookingCreate).toHaveBeenCalledTimes(1);
  });

  it("cancel makeup 預約 → 退回全部 N 張券、刪 join row、清 legacy makeupCreditId（防 @unique 卡重訂）", async () => {
    mockBookingFindUnique.mockResolvedValue({
      id: "bk-makeup",
      storeId: STORE_A,
      customerId: NO_PLAN_CUSTOMER_ID,
      bookingStatus: "PENDING",
      isMakeup: true,
      makeupCreditId: "mc-1",
      customerPlanWalletId: null,
      customer: { customerStage: "ACTIVE" },
      notes: null,
    });
    // people=2：join table 有兩張券
    mockTxJoinFindMany.mockResolvedValue([
      { makeupCreditId: "mc-1" },
      { makeupCreditId: "mc-2" },
    ]);

    const { cancelBooking } = await import("@/server/actions/booking");
    const r = await cancelBooking("bk-makeup");

    expect(r.success).toBe(true);
    // 退回全部 N 張券
    expect(mockTxMakeupUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["mc-1", "mc-2"] } },
      data: { isUsed: false },
    });
    // 刪 join row（釋放券，可再被預約）
    expect(mockTxJoinDeleteMany).toHaveBeenCalledWith({
      where: { bookingId: "bk-makeup" },
    });
    // 狀態更新清掉 legacy makeupCreditId（避免取消後仍佔住 @unique 槽位）
    const cancelUpdate = mockBookingUpdate.mock.calls.find(
      (c) => (c[0] as { data?: { bookingStatus?: string } })?.data?.bookingStatus === "CANCELLED",
    )?.[0] as { data: { makeupCreditId: string | null } };
    expect(cancelUpdate.data.makeupCreditId).toBeNull();
  });
});
