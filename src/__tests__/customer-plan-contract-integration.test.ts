/**
 * 殺手整合測試：createBooking / cancelBooking 後 customer-plan-contract 數字必須正確變動
 *
 * 不變式：
 *   - createBooking 後 reservedPendingSessions +1，availableSessions -1，
 *     totalRemainingSessions 不變（堂數要等出席才扣）
 *   - cancelBooking 後 reservedPendingSessions 回 0，availableSessions 回原值
 *   - 整段流程都用 canonical customerId（不被 stale session 干擾）
 *
 * 這條測試直接擋掉「扣堂數但前台看不到 / 取消後仍卡 reserved」這族 bug。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const REAL_CUSTOMER_ID = "ck0000000000000000000001";
const USER_ID = "ck0000000000000000000010";
const WALLET_ID = "ck0000000000000000000020";

// ── In-memory bookings store ──
type BookingRow = {
  id: string;
  customerId: string;
  storeId: string;
  bookingDate: Date;
  slotTime: string;
  bookingStatus: string;
  isMakeup: boolean;
  people: number;
  noShowPolicy: string | null;
  customerPlanWalletId: string | null;
};
const bookingsStore: BookingRow[] = [];
let walletRemainingSessions = 5;

const mockPrisma = {
  customer: {
    findUnique: vi.fn(async (args: { where: { id: string }; select?: unknown; include?: unknown }) => {
      if (args.where.id !== REAL_CUSTOMER_ID) return null;
      return {
        id: REAL_CUSTOMER_ID,
        storeId: STORE_A,
        selfBookingEnabled: true,
        assignedStaffId: null,
        sponsorId: null,
        email: "real@x.com",
        phone: "0911000111",
        name: "Real",
        birthday: null,
        gender: null,
        userId: USER_ID,
        planWallets: [
          {
            id: WALLET_ID,
            status: "ACTIVE",
            totalSessions: 10,
            remainingSessions: walletRemainingSessions,
            startDate: new Date("2026-01-01"),
            expiryDate: null,
            plan: { name: "課程 10 堂", category: "PACKAGE", sessionCount: 10 },
            bookings: bookingsStore.filter(
              (b) => b.customerPlanWalletId === WALLET_ID,
            ),
          },
        ],
      };
    }),
    findFirst: vi.fn(),
    findMany: vi.fn(async () => []),
  },
  booking: {
    create: vi.fn(async ({ data }: { data: Partial<BookingRow> }) => {
      const row: BookingRow = {
        id: `bk-${bookingsStore.length + 1}`,
        customerId: data.customerId!,
        storeId: data.storeId!,
        bookingDate: data.bookingDate!,
        slotTime: data.slotTime!,
        bookingStatus: data.bookingStatus ?? "PENDING",
        isMakeup: data.isMakeup ?? false,
        people: data.people ?? 1,
        noShowPolicy: null,
        customerPlanWalletId: data.customerPlanWalletId ?? null,
      };
      bookingsStore.push(row);
      return row;
    }),
    findUnique: vi.fn(async (args: { where: { id: string } }) =>
      bookingsStore.find((r) => r.id === args.where.id) ?? null,
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<BookingRow> }) => {
      const idx = bookingsStore.findIndex((r) => r.id === where.id);
      if (idx >= 0) {
        bookingsStore[idx] = { ...bookingsStore[idx], ...data };
        return bookingsStore[idx];
      }
      return null;
    }),
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    count: vi.fn(async () => 0),
    aggregate: vi.fn(async () => ({ _sum: { people: 0 } })),
  },
  businessHours: {
    findMany: vi.fn(async () =>
      [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
        dayOfWeek: dow,
        isOpen: true,
        openTime: "10:00",
        closeTime: "22:00",
        slotInterval: 60,
        defaultCapacity: 6,
      })),
    ),
    findFirst: vi.fn(async () => ({
      dayOfWeek: 1,
      isOpen: true,
      openTime: "10:00",
      closeTime: "22:00",
      slotInterval: 60,
      defaultCapacity: 6,
    })),
  },
  specialBusinessDay: {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
  },
  slotOverride: {
    findMany: vi.fn(async () => []),
  },
  dutyAssignment: {
    count: vi.fn(async () => 0),
  },
  store: {
    findUnique: vi.fn(async () => ({
      id: STORE_A,
      plan: "ALLIANCE",
      maxStaffOverride: null,
      maxCustomersOverride: null,
      maxMonthlyBookingsOverride: null,
      maxMonthlyReportsOverride: null,
      maxReminderSendsOverride: null,
      maxStoresOverride: null,
    })),
  },
  makeupCredit: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
};

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const mockRequireSession = vi.fn();
vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
  requireStaffSession: vi.fn(async () => mockRequireSession()),
}));

vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? STORE_A,
  DEFAULT_STORE_ID: "default-store",
  getActiveStoreForRead: vi.fn(),
}));

vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: vi.fn(),
  getStoreFilter: () => ({}),
  getManagerCustomerFilter: vi.fn(() => ({})),
}));

vi.mock("@/lib/permissions", () => ({
  requirePermission: vi.fn(async () => mockRequireSession()),
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
vi.mock("@/server/services/wallet-session", () => ({
  allocateSession: vi.fn(async () => null),
  releaseSession: vi.fn(async () => true),
  completeSession: vi.fn(async () => true),
  uncompleteSession: vi.fn(async () => true),
  reReserveSession: vi.fn(async () => null),
}));

beforeEach(() => {
  vi.clearAllMocks();
  bookingsStore.length = 0;
  walletRemainingSessions = 5;
});

describe("Plan contract 整合：createBooking → contract → cancelBooking", () => {
  it("createBooking 後 reservedPending +1，availableSessions -1，totalRemaining 不變", async () => {
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: REAL_CUSTOMER_ID,
      id: USER_ID,
      email: "real@x.com",
    });

    // ── before：契約看到 5 可預約、0 reserved ──
    const { getCustomerPlanSummary } = await import("@/lib/customer-plan-contract");
    const before = await getCustomerPlanSummary(REAL_CUSTOMER_ID);
    expect(before).not.toBeNull();
    expect(before!.totalRemainingSessions).toBe(5);
    expect(before!.reservedPendingSessions).toBe(0);
    expect(before!.availableSessions).toBe(5);

    // ── createBooking ──
    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: REAL_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "10:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: WALLET_ID,
      people: 1,
    });
    expect(result.success).toBe(true);
    expect(bookingsStore).toHaveLength(1);

    // ── after：契約看到 reserved=1、available=4、total 仍 5（堂數要 markCompleted 才扣）──
    const after = await getCustomerPlanSummary(REAL_CUSTOMER_ID);
    expect(after).not.toBeNull();
    expect(after!.totalRemainingSessions).toBe(5);
    expect(after!.reservedPendingSessions).toBe(1);
    expect(after!.availableSessions).toBe(4);
  });

  it("cancelBooking 後 reservedPending 歸零、available 回 5", async () => {
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: REAL_CUSTOMER_ID,
      id: USER_ID,
      email: "real@x.com",
    });

    // 先建一筆 booking
    const { createBooking, cancelBooking } = await import("@/server/actions/booking");
    const create = await createBooking({
      customerId: REAL_CUSTOMER_ID,
      bookingDate: "2026-04-29", // 14 天內 + > 12hr
      slotTime: "10:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: WALLET_ID,
      people: 1,
    });
    expect(create.success).toBe(true);
    if (!create.success) throw new Error("create failed");

    // 確認 reserved=1
    const { getCustomerPlanSummary } = await import("@/lib/customer-plan-contract");
    const mid = await getCustomerPlanSummary(REAL_CUSTOMER_ID);
    expect(mid!.reservedPendingSessions).toBe(1);
    expect(mid!.availableSessions).toBe(4);

    // 取消
    const cancel = await cancelBooking(create.data.bookingId, "test cancel");
    expect(cancel.success).toBe(true);

    // 確認 reserved=0、available 回到 5（CANCELLED 不算 reserved）
    const after = await getCustomerPlanSummary(REAL_CUSTOMER_ID);
    expect(after!.reservedPendingSessions).toBe(0);
    expect(after!.availableSessions).toBe(5);
    expect(after!.totalRemainingSessions).toBe(5);
  });

  it("補課 booking 不影響 reservedPending", async () => {
    // 直接塞一筆 isMakeup=true 的 booking
    bookingsStore.push({
      id: "bk-makeup",
      customerId: REAL_CUSTOMER_ID,
      storeId: STORE_A,
      bookingDate: new Date("2026-04-27"),
      slotTime: "10:00",
      bookingStatus: "PENDING",
      isMakeup: true,
      people: 1,
      noShowPolicy: null,
      customerPlanWalletId: WALLET_ID,
    });

    const { getCustomerPlanSummary } = await import("@/lib/customer-plan-contract");
    const summary = await getCustomerPlanSummary(REAL_CUSTOMER_ID);
    expect(summary!.reservedPendingSessions).toBe(0);
    expect(summary!.availableSessions).toBe(5);
  });

  it("getCustomerPlanSummaryForSession 走 canonical resolver（stale session 不影響）", async () => {
    const STALE = "ck0000000000000000000099";
    // session.customerId 為 stale，customer.findUnique 對 stale 回 null
    const original = mockPrisma.customer.findUnique;
    mockPrisma.customer.findUnique = vi.fn(async (args: { where: { id: string } }) => {
      if (args.where.id === STALE) return null;
      // 為 canonical resolve 路徑保留原 mock 行為
      return original(args as never);
    });
    mockPrisma.customer.findFirst = vi.fn(async (args: { where: { userId?: string } }) => {
      if (args.where.userId === USER_ID) {
        return {
          id: REAL_CUSTOMER_ID,
          storeId: STORE_A,
          name: "Real",
          phone: "0911000111",
          email: "real@x.com",
          birthday: null,
          gender: null,
          userId: USER_ID,
        };
      }
      return null;
    });

    const { getCustomerPlanSummaryForSession } = await import("@/lib/customer-plan-contract");
    const summary = await getCustomerPlanSummaryForSession({
      id: USER_ID,
      customerId: STALE, // ⚠ stale
      email: "real@x.com",
      storeId: STORE_A,
    });
    expect(summary).not.toBeNull();
    expect(summary!.customerId).toBe(REAL_CUSTOMER_ID);
  });
});
