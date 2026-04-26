/**
 * 🔥 殺手整合測試：booking 寫入 / 讀取契約 (Customer Identity Contract)
 *
 * 不變式：createBooking 寫入後的同一筆 booking，**必須** 在以下三處都能查到：
 *   1. 顧客「即將到來」(`listBookings`，CUSTOMER session)
 *   2. 後台「該日預約」(`getDayBookings`，OWNER session)
 *   3. customer.id 與 booking.customerId 完全一致（canonical，不被 stale session 干擾）
 *
 * 這條測試的意義：
 *   只要寫入端與讀取端任一處對 customerId / storeId / status 的判斷不一致，
 *   這條 test 就會 fail。它直接擋掉「資料寫入成功但前台/後台看不到」這整族 bug。
 *
 * 測試矩陣：
 *   - session 一致 vs stale（stale 模擬實際 production 場景）
 *   - 顧客查得到 + 後台查得到（同一筆）
 *   - customerId / storeId / bookingStatus 全對齊
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const REAL_CUSTOMER_ID = "ck0000000000000000000001";
const STALE_SESSION_CUSTOMER_ID = "ck0000000000000000000099";
const USER_ID = "ck0000000000000000000010";
const WALLET_ID = "ck0000000000000000000020";
const STAFF_USER_ID = "ck0000000000000000000051";

// ── In-memory booking store ── 模擬「寫入後可讀取」的最小 prisma 行為
type BookingRow = {
  id: string;
  customerId: string;
  storeId: string;
  bookingDate: Date;
  slotTime: string;
  bookingStatus: string;
  isMakeup: boolean;
  isCheckedIn: boolean;
  people: number;
  revenueStaffId: string | null;
  bookedByType: string;
  bookedByStaffId: string | null;
  bookingType: string;
  servicePlanId: string | null;
  customerPlanWalletId: string | null;
  makeupCreditId: string | null;
  notes: string | null;
  createdAt: Date;
};

const bookingsStore: BookingRow[] = [];

function matchWhere(row: BookingRow, where: Record<string, unknown>): boolean {
  // storeId
  if (where.storeId && where.storeId !== row.storeId) return false;
  // customer
  const customerWhere = where.customer as { id?: string } | undefined;
  if (customerWhere?.id && customerWhere.id !== row.customerId) return false;
  // customerId
  if (typeof where.customerId === "string" && where.customerId !== row.customerId) return false;
  // bookingStatus { in: [...] }
  const statusFilter = where.bookingStatus as { in?: string[] } | undefined;
  if (statusFilter?.in && !statusFilter.in.includes(row.bookingStatus)) return false;
  // bookingDate (Date or { gte, lte })
  if (where.bookingDate instanceof Date) {
    if (where.bookingDate.toISOString() !== row.bookingDate.toISOString()) return false;
  } else if (typeof where.bookingDate === "object" && where.bookingDate) {
    const r = where.bookingDate as { gte?: Date; lte?: Date };
    if (r.gte && row.bookingDate < r.gte) return false;
    if (r.lte && row.bookingDate > r.lte) return false;
  }
  return true;
}

const mockPrisma = {
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
        isCheckedIn: false,
        people: data.people ?? 1,
        revenueStaffId: data.revenueStaffId ?? null,
        bookedByType: data.bookedByType ?? "CUSTOMER",
        bookedByStaffId: data.bookedByStaffId ?? null,
        bookingType: data.bookingType ?? "PACKAGE_SESSION",
        servicePlanId: data.servicePlanId ?? null,
        customerPlanWalletId: data.customerPlanWalletId ?? null,
        makeupCreditId: data.makeupCreditId ?? null,
        notes: data.notes ?? null,
        createdAt: new Date(),
      };
      bookingsStore.push(row);
      return row;
    }),
    findMany: vi.fn(async (args: { where?: Record<string, unknown>; include?: unknown }) => {
      const where = args.where ?? {};
      return bookingsStore
        .filter((r) => matchWhere(r, where))
        .map((r) => ({ ...r, customer: null, revenueStaff: null, serviceStaff: null, servicePlan: null }));
    }),
    findFirst: vi.fn(async (args: { where?: Record<string, unknown> }) => {
      const where = args.where ?? {};
      return bookingsStore.find((r) => matchWhere(r, where)) ?? null;
    }),
    findUnique: vi.fn(async (args: { where: { id: string } }) =>
      bookingsStore.find((r) => r.id === args.where.id) ?? null,
    ),
    count: vi.fn(async (args: { where?: Record<string, unknown> }) => {
      const where = args.where ?? {};
      return bookingsStore.filter((r) => matchWhere(r, where)).length;
    }),
    aggregate: vi.fn(async () => ({ _sum: { people: 0 } })),
  },
  customer: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(async () => []),
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
  staff: {
    findMany: vi.fn(async () => []),
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
  getActiveStoreForRead: vi.fn(async (u: { storeId?: string | null }) => u.storeId ?? STORE_A),
}));

vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: vi.fn(),
  getStoreFilter: (u: { storeId?: string | null }) => ({ storeId: u.storeId ?? null }),
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
  planWallets: [{ id: WALLET_ID, remainingSessions: 5, expiryDate: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  bookingsStore.length = 0;
});

describe("Booking write-read contract — createBooking → listBookings → getDayBookings", () => {
  it("Customer createBooking 後，同一筆 booking 在顧客 upcoming 與後台 dashboard 都可見", async () => {
    // ── 1. CUSTOMER session（一致場景） ──
    mockRequireSession.mockResolvedValueOnce({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: REAL_CUSTOMER_ID,
      id: USER_ID,
      email: "real@x.com",
    });
    mockPrisma.customer.findUnique.mockResolvedValue(REAL_CUSTOMER_RECORD);

    const { createBooking } = await import("@/server/actions/booking");
    const writeResult = await createBooking({
      customerId: REAL_CUSTOMER_ID,
      bookingDate: "2026-04-27",
      slotTime: "10:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: WALLET_ID,
      people: 1,
    });

    expect(writeResult.success).toBe(true);
    expect(bookingsStore).toHaveLength(1);
    const written = bookingsStore[0];
    expect(written.customerId).toBe(REAL_CUSTOMER_ID);
    expect(written.storeId).toBe(STORE_A);
    expect(written.bookingStatus).toBe("PENDING");

    // ── 2. CUSTOMER 即將到來（listBookings） ──
    mockRequireSession.mockResolvedValueOnce({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: REAL_CUSTOMER_ID,
      id: USER_ID,
      email: "real@x.com",
    });
    const { listBookings } = await import("@/server/queries/booking");
    const list = await listBookings({ pageSize: 50 });
    expect(list.bookings.length).toBe(1);
    expect(list.bookings[0].id).toBe(written.id);
    expect(list.bookings[0].customerId).toBe(REAL_CUSTOMER_ID);
    expect(list.bookings[0].bookingStatus).toBe("PENDING");

    // ── 3. 後台 today bookings（getDayBookings） ──
    mockRequireSession.mockResolvedValueOnce({
      role: "OWNER",
      storeId: STORE_A,
      staffId: "ck0000000000000000000050",
      id: STAFF_USER_ID,
      email: "owner@x.com",
    });
    const { getDayBookings } = await import("@/server/queries/booking");
    const dashboardList = await getDayBookings("2026-04-27", STORE_A);
    expect(dashboardList.length).toBe(1);
    expect(dashboardList[0].id).toBe(written.id);
    expect(dashboardList[0].customerId).toBe(REAL_CUSTOMER_ID);
    expect(dashboardList[0].storeId).toBe(STORE_A);
  });

  it("session.customerId STALE 但 userId 找得到 → 寫入用 canonical，讀取也用 canonical，三處仍同步", async () => {
    // 讀取時 prisma.customer.findUnique 對 stale id 回 null，對 canonical id 回 record
    mockPrisma.customer.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === STALE_SESSION_CUSTOMER_ID) return null;
      if (args.where.id === REAL_CUSTOMER_ID) return REAL_CUSTOMER_RECORD;
      return null;
    });
    // resolveCustomerForUser 走 path B：Customer.userId = USER_ID 找到 canonical
    mockPrisma.customer.findFirst.mockImplementation(async (args: { where: { userId?: string } }) => {
      if (args.where.userId === USER_ID) return REAL_CUSTOMER_RECORD;
      return null;
    });

    // ── 1. CUSTOMER session（stale） + createBooking ──
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: STALE_SESSION_CUSTOMER_ID, // ⚠ stale
      id: USER_ID,
      email: "real@x.com",
    });

    const { createBooking } = await import("@/server/actions/booking");
    const writeResult = await createBooking({
      customerId: STALE_SESSION_CUSTOMER_ID, // client 帶上 stale id
      bookingDate: "2026-04-27",
      slotTime: "10:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: WALLET_ID,
      people: 1,
    });
    expect(writeResult.success).toBe(true);
    expect(bookingsStore).toHaveLength(1);
    // 寫入端：以 canonical id 寫，不是 stale id
    expect(bookingsStore[0].customerId).toBe(REAL_CUSTOMER_ID);

    // ── 2. listBookings 仍用 stale session 呼叫，但讀取端走 canonical resolver → 應查到 ──
    const { listBookings } = await import("@/server/queries/booking");
    const list = await listBookings({ pageSize: 50 });
    expect(list.bookings.length).toBe(1);
    expect(list.bookings[0].id).toBe(bookingsStore[0].id);
    expect(list.bookings[0].customerId).toBe(REAL_CUSTOMER_ID);

    // ── 3. 後台 dashboard（不受 customerId resolver 影響，store-scoped） ──
    mockRequireSession.mockResolvedValueOnce({
      role: "OWNER",
      storeId: STORE_A,
      staffId: "ck0000000000000000000050",
      id: STAFF_USER_ID,
      email: "owner@x.com",
    });
    const { getDayBookings } = await import("@/server/queries/booking");
    const dashboardList = await getDayBookings("2026-04-27", STORE_A);
    expect(dashboardList.length).toBe(1);
    expect(dashboardList[0].customerId).toBe(REAL_CUSTOMER_ID);
  });

  it("status enum 契約：PENDING booking 必須出現在 BOOKING_UPCOMING 集合查詢中", async () => {
    const { BOOKING_UPCOMING, ACTIVE_BOOKING_STATUSES } = await import("@/lib/booking-constants");
    // 直接驗證集合，避免 inline 字串 drift
    expect(BOOKING_UPCOMING).toContain("PENDING");
    expect(BOOKING_UPCOMING).toContain("CONFIRMED");
    expect(ACTIVE_BOOKING_STATUSES).toContain("PENDING");
    expect(ACTIVE_BOOKING_STATUSES).toContain("COMPLETED");
    expect(ACTIVE_BOOKING_STATUSES).not.toContain("CANCELLED");
  });
});
