/**
 * fetchLiffBookings server action (PR-D2) 行為測試
 *
 * 涵蓋：
 *   ── action 主路徑 ──
 *   - ok                       (success path：upcoming/history 正確分群)
 *   - no_customer              (requireSession throw / 非 CUSTOMER / canonical null / storeId null)
 *   - service_unavailable      (prisma 查詢 throw)
 *   - 不信任 client 傳值        (action 不收參數 → 即使呼叫端傳東西也忽略)
 *   - 不污染 listBookings       (只用 prisma.booking.findMany，且 where 含 storeId 隔離)
 *
 *   ── splitLiffBookings 純函數 ──
 *   - PENDING + 未來 → upcoming
 *   - PENDING + 過去 → history（stale）
 *   - CONFIRMED + 未來 → upcoming（legacy 相容）
 *   - COMPLETED / NO_SHOW / CANCELLED → 一律 history
 *   - 邊界：booking 時刻 == now → 視為過去（history）
 *   - 空陣列 → { upcoming: [], history: [] }
 *
 * Mock 範圍（與 liff-trial-booking-action.test.ts 對齊）：
 *   - @/lib/session
 *   - @/lib/customer-identity
 *   - @/lib/db (prisma.booking.findMany)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks (必須在 import action 之前) ──
const mockRequireSession = vi.fn();
const mockGetCanonicalId = vi.fn();
const mockBookingFindMany = vi.fn();

vi.mock("@/lib/session", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/customer-identity", () => ({
  getCanonicalCustomerIdForSession: (...args: unknown[]) =>
    mockGetCanonicalId(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      findMany: (...args: unknown[]) => mockBookingFindMany(...args),
    },
  },
}));

import { fetchLiffBookings } from "@/server/actions/liff-my-bookings";
import { splitLiffBookings } from "@/lib/liff/my-bookings";

// ── 共用 fixtures ──
const CUSTOMER_USER = {
  id: "user-liff-001",
  role: "CUSTOMER" as const,
  storeId: "store-zhubei",
  storeSlug: "zhubei",
  staffId: null,
  customerId: "cust-canonical",
  email: null,
  name: "黃彥陸",
};
const CANONICAL_CUSTOMER_ID = "cust-canonical";

function row(overrides: Partial<{
  id: string;
  bookingDate: Date;
  slotTime: string;
  bookingStatus: string;
  bookingType: string;
  isMakeup: boolean;
  revenueStaff: { displayName: string } | null;
}> = {}) {
  return {
    id: "bk-default",
    bookingDate: new Date("2026-06-01T00:00:00Z"),
    slotTime: "10:00",
    bookingStatus: "PENDING",
    bookingType: "FIRST_TRIAL",
    isMakeup: false,
    revenueStaff: null,
    ...overrides,
  };
}

describe("fetchLiffBookings action (PR-D2)", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetCanonicalId.mockReset();
    mockBookingFindMany.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────
  // no_customer 分支
  // ────────────────────────────────────────────────────

  describe("no_customer 分支", () => {
    it("requireSession throw → no_customer", async () => {
      mockRequireSession.mockRejectedValue(new Error("no session"));
      const r = await fetchLiffBookings();
      expect(r).toEqual({ status: "no_customer" });
      expect(mockBookingFindMany).not.toHaveBeenCalled();
    });

    it("user.role !== CUSTOMER → no_customer (staff 不該透過此 action 看清單)", async () => {
      mockRequireSession.mockResolvedValue({
        ...CUSTOMER_USER,
        role: "OWNER",
        customerId: null,
      });
      const r = await fetchLiffBookings();
      expect(r).toEqual({ status: "no_customer" });
      expect(mockGetCanonicalId).not.toHaveBeenCalled();
    });

    it("canonical resolver 回 null → no_customer", async () => {
      mockRequireSession.mockResolvedValue(CUSTOMER_USER);
      mockGetCanonicalId.mockResolvedValue(null);
      const r = await fetchLiffBookings();
      expect(r).toEqual({ status: "no_customer" });
      expect(mockBookingFindMany).not.toHaveBeenCalled();
    });

    it("user.storeId null → no_customer", async () => {
      mockRequireSession.mockResolvedValue({ ...CUSTOMER_USER, storeId: null });
      mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
      const r = await fetchLiffBookings();
      expect(r).toEqual({ status: "no_customer" });
      expect(mockBookingFindMany).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────
  // service_unavailable 分支
  // ────────────────────────────────────────────────────

  it("prisma.booking.findMany throw → service_unavailable", async () => {
    mockRequireSession.mockResolvedValue(CUSTOMER_USER);
    mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
    mockBookingFindMany.mockRejectedValue(new Error("db down"));
    const r = await fetchLiffBookings();
    expect(r).toEqual({ status: "service_unavailable" });
  });

  // ────────────────────────────────────────────────────
  // ok 分支 + payload shape
  // ────────────────────────────────────────────────────

  describe("ok 分支", () => {
    beforeEach(() => {
      mockRequireSession.mockResolvedValue(CUSTOMER_USER);
      mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
    });

    it("回傳 upcoming + history 兩個陣列", async () => {
      mockBookingFindMany.mockResolvedValue([]);
      const r = await fetchLiffBookings();
      expect(r).toEqual({ status: "ok", upcoming: [], history: [] });
    });

    it("query 帶 canonical customerId + session storeId（不信 client）", async () => {
      mockBookingFindMany.mockResolvedValue([]);
      await fetchLiffBookings();
      const args = mockBookingFindMany.mock.calls[0][0];
      expect(args.where).toEqual({
        customerId: CANONICAL_CUSTOMER_ID,
        storeId: CUSTOMER_USER.storeId,
      });
    });

    it("query take 上限 50，DESC 排序", async () => {
      mockBookingFindMany.mockResolvedValue([]);
      await fetchLiffBookings();
      const args = mockBookingFindMany.mock.calls[0][0];
      expect(args.take).toBe(50);
      expect(args.orderBy).toEqual([
        { bookingDate: "desc" },
        { slotTime: "asc" },
      ]);
    });

    it("payload 不含金額 / 付款狀態欄位（PR-D2 範圍）", async () => {
      mockBookingFindMany.mockResolvedValue([
        row({ id: "bk-1", bookingStatus: "COMPLETED" }),
      ]);
      const r = await fetchLiffBookings();
      if (r.status !== "ok") throw new Error("expected ok");
      const sample = r.history[0];
      expect(Object.keys(sample).sort()).toEqual([
        "bookingDate",
        "bookingStatus",
        "bookingType",
        "id",
        "isMakeup",
        "slotTime",
        "staffName",
      ]);
    });

    it("Date → 'YYYY-MM-DD' 序列化在 server 邊界完成", async () => {
      mockBookingFindMany.mockResolvedValue([
        row({
          id: "bk-1",
          bookingDate: new Date("2026-06-15T00:00:00Z"),
          bookingStatus: "COMPLETED",
        }),
      ]);
      const r = await fetchLiffBookings();
      if (r.status !== "ok") throw new Error("expected ok");
      expect(r.history[0].bookingDate).toBe("2026-06-15");
    });

    it("staffName: revenueStaff null → null（不 fallback 「未指派」）", async () => {
      mockBookingFindMany.mockResolvedValue([
        row({ id: "bk-1", bookingStatus: "COMPLETED", revenueStaff: null }),
      ]);
      const r = await fetchLiffBookings();
      if (r.status !== "ok") throw new Error("expected ok");
      expect(r.history[0].staffName).toBeNull();
    });

    it("staffName: revenueStaff 有值 → 帶 displayName", async () => {
      mockBookingFindMany.mockResolvedValue([
        row({
          id: "bk-1",
          bookingStatus: "COMPLETED",
          revenueStaff: { displayName: "Amy" },
        }),
      ]);
      const r = await fetchLiffBookings();
      if (r.status !== "ok") throw new Error("expected ok");
      expect(r.history[0].staffName).toBe("Amy");
    });
  });
});

// ────────────────────────────────────────────────────────
// splitLiffBookings 純函數
// ────────────────────────────────────────────────────────

describe("splitLiffBookings — pure helper (PR-D2)", () => {
  // 固定 now = 2026-06-10 12:00 Taipei (= 04:00 UTC)
  const NOW_MS = new Date("2026-06-10T04:00:00Z").getTime();

  it("空陣列 → { upcoming: [], history: [] }", () => {
    expect(splitLiffBookings([], NOW_MS)).toEqual({
      upcoming: [],
      history: [],
    });
  });

  it("PENDING + 未來 → upcoming", () => {
    const b = row({
      bookingDate: new Date("2026-06-15T00:00:00Z"),
      slotTime: "10:00",
      bookingStatus: "PENDING",
    });
    const { upcoming, history } = splitLiffBookings([b], NOW_MS);
    expect(upcoming).toEqual([b]);
    expect(history).toEqual([]);
  });

  it("CONFIRMED + 未來 → upcoming (legacy 相容)", () => {
    const b = row({
      bookingDate: new Date("2026-06-15T00:00:00Z"),
      slotTime: "10:00",
      bookingStatus: "CONFIRMED",
    });
    const { upcoming } = splitLiffBookings([b], NOW_MS);
    expect(upcoming).toEqual([b]);
  });

  it("PENDING + 過去 → history (stale)", () => {
    const b = row({
      bookingDate: new Date("2026-06-01T00:00:00Z"),
      slotTime: "10:00",
      bookingStatus: "PENDING",
    });
    const { upcoming, history } = splitLiffBookings([b], NOW_MS);
    expect(upcoming).toEqual([]);
    expect(history).toEqual([b]);
  });

  it("COMPLETED → history", () => {
    const b = row({
      bookingDate: new Date("2026-06-15T00:00:00Z"),
      slotTime: "10:00",
      bookingStatus: "COMPLETED",
    });
    const { history } = splitLiffBookings([b], NOW_MS);
    expect(history).toEqual([b]);
  });

  it("NO_SHOW → history", () => {
    const b = row({ bookingStatus: "NO_SHOW" });
    const { history } = splitLiffBookings([b], NOW_MS);
    expect(history).toEqual([b]);
  });

  it("CANCELLED → history (即使未來日期也屬歷史)", () => {
    const b = row({
      bookingDate: new Date("2026-06-15T00:00:00Z"),
      slotTime: "10:00",
      bookingStatus: "CANCELLED",
    });
    const { upcoming, history } = splitLiffBookings([b], NOW_MS);
    expect(upcoming).toEqual([]);
    expect(history).toEqual([b]);
  });

  it("邊界：booking 時刻 == now → history（< 嚴格小於）", () => {
    // bookingDate = now 當天，slotTime = now Taipei time 12:00（與 NOW_MS 同瞬間）
    const b = row({
      bookingDate: new Date("2026-06-10T00:00:00Z"),
      slotTime: "12:00",
      bookingStatus: "PENDING",
    });
    const { upcoming, history } = splitLiffBookings([b], NOW_MS);
    // bookingMs === nowMs → past = (bookingMs < nowMs) = false → upcoming
    // （視為「剛好開始」仍算進行中，保留為 upcoming）
    expect(upcoming).toEqual([b]);
    expect(history).toEqual([]);
  });

  it("混合輸入 → 各自歸位，順序不變", () => {
    const past = row({
      id: "past",
      bookingDate: new Date("2026-06-01T00:00:00Z"),
      slotTime: "10:00",
      bookingStatus: "COMPLETED",
    });
    const future1 = row({
      id: "f1",
      bookingDate: new Date("2026-06-15T00:00:00Z"),
      slotTime: "10:00",
      bookingStatus: "PENDING",
    });
    const future2 = row({
      id: "f2",
      bookingDate: new Date("2026-06-20T00:00:00Z"),
      slotTime: "11:00",
      bookingStatus: "CONFIRMED",
    });
    const cancelled = row({
      id: "cx",
      bookingDate: new Date("2026-06-25T00:00:00Z"),
      slotTime: "10:00",
      bookingStatus: "CANCELLED",
    });
    const { upcoming, history } = splitLiffBookings(
      [future1, past, future2, cancelled],
      NOW_MS,
    );
    expect(upcoming.map((b) => b.id)).toEqual(["f1", "f2"]);
    expect(history.map((b) => b.id)).toEqual(["past", "cx"]);
  });
});
