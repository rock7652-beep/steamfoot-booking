/**
 * Regression: 顧客自助流程「寫入 vs 查詢」必須對齊到同一個 canonical customerId。
 *
 * 防止以下歷史 bug 復發：
 *   - createBooking 寫入用 canonical（resolveCustomerForUser），但
 *     listBookings 用 session.user.customerId（stale）→ 顧客「即將到來」tab 空空
 *   - 同樣的 stale 情境也會讓 getBookingDetail / cancelBooking 查不到/拒絕
 *
 * 守則：
 *   1. 顧客自助流程的所有 booking query 都走 resolveCustomerForUser
 *   2. session.customerId stale 時，仍能透過 userId fallback 找到 canonical customer
 *   3. canonical 找不到時，回空清單而不是拋例外
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const REAL_CUSTOMER_ID = "ck0000000000000000000001";
const STALE_SESSION_CUSTOMER_ID = "ck0000000000000000000099";
const USER_ID = "ck0000000000000000000010";

const mockBookingFindMany = vi.fn();
const mockBookingCount = vi.fn();
const mockBookingFindFirst = vi.fn();
const mockBookingFindUnique = vi.fn();
const mockCustomerFindUnique = vi.fn();
const mockCustomerFindFirst = vi.fn();
const mockCustomerFindMany = vi.fn();
const mockRequireSession = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      findMany: (...a: unknown[]) => mockBookingFindMany(...a),
      count: (...a: unknown[]) => mockBookingCount(...a),
      findFirst: (...a: unknown[]) => mockBookingFindFirst(...a),
      findUnique: (...a: unknown[]) => mockBookingFindUnique(...a),
    },
    customer: {
      findUnique: (...a: unknown[]) => mockCustomerFindUnique(...a),
      findFirst: (...a: unknown[]) => mockCustomerFindFirst(...a),
      findMany: (...a: unknown[]) => mockCustomerFindMany(...a),
    },
  },
}));

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
  requireStaffSession: vi.fn(async () => {
    throw new Error("CUSTOMER must not hit requireStaffSession");
  }),
}));

vi.mock("@/lib/manager-visibility", () => ({
  getStoreFilter: (u: { storeId?: string | null }) => ({ storeId: u.storeId ?? null }),
  getManagerCustomerFilter: vi.fn(() => ({})),
  assertStoreAccess: vi.fn(),
}));

vi.mock("@/lib/errors", async () => {
  const actual = await vi.importActual<typeof import("@/lib/errors")>("@/lib/errors");
  return actual;
});

const REAL_CUSTOMER_RECORD = {
  id: REAL_CUSTOMER_ID,
  storeId: STORE_A,
  selfBookingEnabled: true,
  email: "real@x.com",
  phone: "0911000111",
  name: "Real",
  birthday: null,
  gender: null,
  userId: USER_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBookingCount.mockResolvedValue(1);
  mockBookingFindMany.mockResolvedValue([
    {
      id: "ck0000000000000000000088",
      customerId: REAL_CUSTOMER_ID,
      bookingDate: new Date("2026-04-27T00:00:00Z"),
      slotTime: "10:00",
      bookingStatus: "PENDING",
      people: 1,
      isMakeup: false,
      isCheckedIn: false,
      revenueStaff: null,
      servicePlan: null,
    },
  ]);
});

// ── Test 1：listBookings stale session 仍能讀到 canonical 的預約 ──
describe("listBookings (CUSTOMER) — canonical customerId resolver", () => {
  it("session.customerId 與 user 一致時，正常查到預約", async () => {
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: REAL_CUSTOMER_ID,
      id: USER_ID,
      email: "real@x.com",
    });
    mockCustomerFindUnique.mockResolvedValue(REAL_CUSTOMER_RECORD);

    const { listBookings } = await import("@/server/queries/booking");
    const result = await listBookings({ pageSize: 50 });

    expect(result.bookings.length).toBe(1);
    // 確認 query 用 canonical customerId
    const findArgs = mockBookingFindMany.mock.calls[0][0];
    expect(findArgs.where.customer).toEqual({ id: REAL_CUSTOMER_ID });
  });

  it("session.customerId STALE，userId 找得到 → 仍查得到該 customer 的預約", async () => {
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: STALE_SESSION_CUSTOMER_ID, // ⚠ stale
      id: USER_ID,
      email: "real@x.com",
    });
    mockCustomerFindUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === STALE_SESSION_CUSTOMER_ID) return null; // stale
      if (args.where.id === REAL_CUSTOMER_ID) return REAL_CUSTOMER_RECORD;
      return null;
    });
    mockCustomerFindFirst.mockImplementation(async (args: { where: { userId?: string } }) => {
      if (args.where.userId === USER_ID) return REAL_CUSTOMER_RECORD;
      return null;
    });

    const { listBookings } = await import("@/server/queries/booking");
    const result = await listBookings({ pageSize: 50 });

    expect(result.bookings.length).toBe(1);
    // query 使用 canonical customerId（不是 stale 的）
    const findArgs = mockBookingFindMany.mock.calls[0][0];
    expect(findArgs.where.customer).toEqual({ id: REAL_CUSTOMER_ID });
    expect(findArgs.where.customer).not.toEqual({ id: STALE_SESSION_CUSTOMER_ID });
  });

  it("canonical 找不到（session 全 stale 且 userId 也無 match） → 回空清單，不拋例外", async () => {
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: null,
      id: USER_ID,
      email: null,
    });
    mockCustomerFindUnique.mockResolvedValue(null);
    mockCustomerFindFirst.mockResolvedValue(null);
    mockCustomerFindMany.mockResolvedValue([]);

    const { listBookings } = await import("@/server/queries/booking");
    const result = await listBookings({ pageSize: 50 });

    expect(result.bookings).toEqual([]);
    expect(result.total).toBe(0);
    // 不該打到 prisma.booking.findMany
    expect(mockBookingFindMany).not.toHaveBeenCalled();
  });
});

// ── Test 2：getBookingDetail 同樣對齊 canonical ──
describe("getBookingDetail (CUSTOMER) — canonical customerId 對齊", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBookingFindFirst.mockResolvedValue({
      id: "ck0000000000000000000088",
      customerId: REAL_CUSTOMER_ID,
      storeId: STORE_A,
      bookingDate: new Date("2026-04-27T00:00:00Z"),
      slotTime: "10:00",
      bookingStatus: "PENDING",
      customer: { id: REAL_CUSTOMER_ID, name: "Real", phone: "0911000111", assignedStaffId: null },
      revenueStaff: null,
      serviceStaff: null,
      servicePlan: null,
      customerPlanWallet: null,
    });
  });

  it("session.customerId STALE，但屬於同一 user → ownership check 通過", async () => {
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: STALE_SESSION_CUSTOMER_ID, // ⚠ stale
      id: USER_ID,
      email: "real@x.com",
    });
    mockCustomerFindUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === STALE_SESSION_CUSTOMER_ID) return null;
      if (args.where.id === REAL_CUSTOMER_ID) return REAL_CUSTOMER_RECORD;
      return null;
    });
    mockCustomerFindFirst.mockImplementation(async (args: { where: { userId?: string } }) => {
      if (args.where.userId === USER_ID) return REAL_CUSTOMER_RECORD;
      return null;
    });

    const { getBookingDetail } = await import("@/server/queries/booking");
    const result = await getBookingDetail("ck0000000000000000000088");
    expect(result.customerId).toBe(REAL_CUSTOMER_ID);
  });

  it("canonical 找不到 → throw FORBIDDEN（不是「找不到」誤導）", async () => {
    mockRequireSession.mockResolvedValue({
      role: "CUSTOMER",
      storeId: STORE_A,
      customerId: null,
      id: USER_ID,
      email: null,
    });
    mockCustomerFindUnique.mockResolvedValue(null);
    mockCustomerFindFirst.mockResolvedValue(null);
    mockCustomerFindMany.mockResolvedValue([]);

    const { getBookingDetail } = await import("@/server/queries/booking");
    await expect(getBookingDetail("ck0000000000000000000088")).rejects.toThrow(
      /只能查看自己的預約/,
    );
  });
});
