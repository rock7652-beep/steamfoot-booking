/**
 * Regression: createBooking 對 CUSTOMER 角色一律以 session resolver 取得
 * canonical customerId，不信任 client 傳入。
 *
 * 防止以下歷史 bug 復發：
 *   - 顧客前台 /book/new 按確認預約後出現「顧客只能為自己建立預約」
 *     — 因為 server 用 `user.customerId !== input.customerId` 比對，但 session
 *     的 customerId 可能 stale（merge / placeholder / 跨環境 JWT）導致誤判。
 *
 * 守則：
 *   1. CUSTOMER：忽略 input.customerId，強制走 resolveCustomerForUser 的結果
 *   2. CUSTOMER：即使送錯別人的 customerId，server 也改用 session 對應的
 *   3. STAFF/ADMIN：input.customerId 仍是 target，照舊使用
 *   4. session.customerId stale 但 userId 能找到 customer → 仍能成立預約
 *      （resolveCustomerForUser fallback B：Customer.userId = session.userId）
 *   5. customerPlanWalletId 不可指定別人的 wallet — 需屬於 canonical customerId
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const REAL_CUSTOMER_ID = "ck0000000000000000000001"; // session 對應的真顧客
const STALE_SESSION_CUSTOMER_ID = "ck0000000000000000000099"; // session 殘留的舊 ID
const OTHER_CUSTOMER_ID = "ck0000000000000000000002"; // 別人的 customer id（client 嘗試送的）
const USER_ID = "ck0000000000000000000010";
const WALLET_ID = "ck0000000000000000000020";
const OTHER_WALLET_ID = "ck0000000000000000000021";

// ── Mock prisma ──
const mockCustomerFindUnique = vi.fn();
const mockBookingCount = vi.fn();
const mockBookingAggregate = vi.fn();
const mockBookingCreate = vi.fn();
const mockTransaction = vi.fn();
const mockBusinessHoursFindMany = vi.fn();
const mockBusinessHoursFindFirst = vi.fn();
const mockSpecialDayFindMany = vi.fn();
const mockSpecialDayFindFirst = vi.fn();
const mockSlotOverrideFindMany = vi.fn();
const mockDutyAssignmentCount = vi.fn();
const mockStoreFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findUnique: (...a: unknown[]) => mockCustomerFindUnique(...a) },
    booking: {
      count: (...a: unknown[]) => mockBookingCount(...a),
      aggregate: (...a: unknown[]) => mockBookingAggregate(...a),
      create: (...a: unknown[]) => mockBookingCreate(...a),
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
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTransaction(cb),
  },
}));

// ── Mock session ──
const mockRequireSession = vi.fn();
vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
  // 萬一被誤觸 → 紅燈
  requireStaffSession: vi.fn(async () => {
    throw new Error("CUSTOMER must not hit requireStaffSession");
  }),
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

vi.mock("@/lib/permissions", () => ({
  requirePermission: vi.fn(async () => {
    throw new Error("CUSTOMER must not hit requirePermission");
  }),
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

vi.mock("@/lib/revalidation", () => ({
  revalidateBookings: vi.fn(),
}));

vi.mock("@/server/services/referral-events", () => ({
  createBookingCreatedEvent: vi.fn(async () => undefined),
  createBookingCompletedEvent: vi.fn(async () => undefined),
}));
vi.mock("@/server/services/referral-points", () => ({
  awardFirstBookingReferralPointsIfEligible: vi.fn(async () => undefined),
}));

// ── 預設好 customer + business hours ──
function setupDefaults() {
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
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      booking: { create: mockBookingCreate },
      makeupCredit: { update: vi.fn() },
    }),
  );
}

// 預設 customer record（被 prisma.customer.findUnique 撈出）
const REAL_CUSTOMER_RECORD = {
  id: REAL_CUSTOMER_ID,
  storeId: STORE_A,
  selfBookingEnabled: true,
  assignedStaffId: null,
  sponsorId: null,
  email: "real@x.com",
  phone: "0911000111",
  name: "Real Customer",
  birthday: null,
  gender: null,
  userId: USER_ID,
  planWallets: [
    { id: WALLET_ID, remainingSessions: 5, expiryDate: null },
  ],
};

// ── Test 1：CUSTOMER 不傳 customerId 也應能成立預約（走 resolver）──
describe("CUSTOMER createBooking — server 強制覆寫 customerId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it("session.customerId 與 user 一致時，正常用 session 對應 customerId 建立預約", async () => {
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: REAL_CUSTOMER_ID,
      id: USER_ID,
      email: "real@x.com",
    });
    // resolveCustomerForUser 走 path A（找到 sessionCustomerId）
    mockCustomerFindUnique.mockResolvedValue(REAL_CUSTOMER_RECORD);

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: REAL_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: WALLET_ID,
      people: 1,
    });

    expect(result.success).toBe(true);
    // booking.create 必須以 canonical customerId
    const createCall = mockBookingCreate.mock.calls[0][0];
    expect(createCall.data.customerId).toBe(REAL_CUSTOMER_ID);
  });

  it("即使 client 送錯 customerId（送成別人的 id），server 也覆寫成 session 對應的", async () => {
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: REAL_CUSTOMER_ID,
      id: USER_ID,
      email: "real@x.com",
    });
    // resolveCustomerForUser path A 仍找到 REAL（因為 sessionCustomerId 對）
    // 注意：被覆寫的是 input.customerId
    mockCustomerFindUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === REAL_CUSTOMER_ID) return REAL_CUSTOMER_RECORD;
      return null; // 即使 client 送 OTHER_CUSTOMER_ID，server 不應拿這個查
    });

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: OTHER_CUSTOMER_ID, // ⚠ tampered
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: WALLET_ID,
      people: 1,
    });

    expect(result.success).toBe(true);
    const createCall = mockBookingCreate.mock.calls[0][0];
    // 寫入 booking 的 customerId 是 server 解析出的真顧客，不是 client 送的 OTHER_CUSTOMER_ID
    expect(createCall.data.customerId).toBe(REAL_CUSTOMER_ID);
    expect(createCall.data.customerId).not.toBe(OTHER_CUSTOMER_ID);
  });

  it("session.customerId stale（不存在於 DB），但 userId 能找到 customer → 仍能成立預約", async () => {
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: STALE_SESSION_CUSTOMER_ID, // ⚠ stale JWT 殘留
      id: USER_ID,
      email: "real@x.com",
    });
    // resolveCustomerForUser 走 path A 失敗（DB 找不到 stale id）→ fall through 到 path B（userId 對）
    mockCustomerFindUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === STALE_SESSION_CUSTOMER_ID) return null; // stale
      if (args.where.id === REAL_CUSTOMER_ID) return REAL_CUSTOMER_RECORD;
      return null;
    });
    // resolveCustomerForUser 內部會用 prisma.customer.findFirst({ where: { userId } })
    // 我們的 prisma mock 不含 customer.findFirst，所以另外 mock：
    const { prisma } = await import("@/lib/db");
    // @ts-expect-error — 動態擴充 mock
    prisma.customer.findFirst = vi.fn(async (args: { where: { userId?: string } }) => {
      if (args.where.userId === USER_ID) return REAL_CUSTOMER_RECORD;
      return null;
    });

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: STALE_SESSION_CUSTOMER_ID, // client 送的也是 stale（因為 page.tsx 也是用 session 帶下去）
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: WALLET_ID,
      people: 1,
    });

    expect(result.success).toBe(true);
    const createCall = mockBookingCreate.mock.calls[0][0];
    expect(createCall.data.customerId).toBe(REAL_CUSTOMER_ID);
  });

  it("resolveCustomerForUser 完全找不到（無 sessionCustomerId、無 userId match） → 回顧客可懂訊息（不再吐「顧客只能為自己建立預約」）", async () => {
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: null,
      id: USER_ID,
      email: null,
    });
    mockCustomerFindUnique.mockResolvedValue(null);
    const { prisma } = await import("@/lib/db");
    // @ts-expect-error — 動態擴充
    prisma.customer.findFirst = vi.fn(async () => null);
    // @ts-expect-error — 動態擴充
    prisma.customer.findMany = vi.fn(async () => []);

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: REAL_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: WALLET_ID,
      people: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // 不可再吐這句歷史誤判
      expect(result.error).not.toMatch(/顧客只能為自己建立預約/);
      // 也不該是 staff-only 文案
      expect(result.error).not.toMatch(/僅限員工|僅限.*管理者/);
      // 該是「找不到顧客 / 重新登入」類訊息（含 sanitize 過的版本）
      expect(result.error).toMatch(/重新登入|顧客資料|無法完成/);
    }
  });
});

// ── Test 2：customerPlanWalletId 不可指定別人 ──
describe("CUSTOMER createBooking — customerPlanWalletId 必須屬於 canonical customer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: REAL_CUSTOMER_ID,
      id: USER_ID,
      email: "real@x.com",
    });
    mockCustomerFindUnique.mockResolvedValue(REAL_CUSTOMER_RECORD);
  });

  it("client 送別人的 walletId → 拒絕，error 屬於 FORBIDDEN", async () => {
    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: REAL_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: OTHER_WALLET_ID, // ⚠ 不在該 customer 的 planWallets 裡
      people: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/方案不屬於該顧客/);
    }
  });
});

// ── Test 3：STAFF 代約仍可指定 customerId ──
describe("STAFF createBooking — 仍可代任意顧客建立預約", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it("STAFF role 不會走 resolveCustomerForUser，input.customerId 直接被使用", async () => {
    mockRequireSession.mockResolvedValue({
      role: "OWNER",
      storeId: STORE_A,
      staffId: "ck0000000000000000000050",
      id: "ck0000000000000000000051",
      email: "owner@x.com",
    });
    mockCustomerFindUnique.mockResolvedValue(REAL_CUSTOMER_RECORD);

    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: REAL_CUSTOMER_ID, // staff 代客操作，這個是 target
      bookingDate: "2026-04-27",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: WALLET_ID,
      people: 1,
    });

    expect(result.success).toBe(true);
    const createCall = mockBookingCreate.mock.calls[0][0];
    expect(createCall.data.customerId).toBe(REAL_CUSTOMER_ID);
    expect(createCall.data.bookedByType).toBe("STAFF");
  });
});
