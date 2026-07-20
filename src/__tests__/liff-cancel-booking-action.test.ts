/**
 * cancelLiffBooking server action (PR-D4A-1) 行為測試
 *
 * 涵蓋：
 *   ── input / auth gate ──
 *   - invalid_input            (bookingId 空字串 / 缺欄位)
 *   - no_customer              (requireSession throw / 非 CUSTOMER role)
 *
 *   ── delegate happy path ──
 *   - ok                       (cancelBooking 回 success → status: ok)
 *   - 呼叫 cancelBooking 時帶 "顧客自行取消" note（與 web 入口一致）
 *
 *   ── error mapping（cancelBooking AppError → LIFF status）──
 *   - not_found                (「預約不存在」)
 *   - status_blocked           (「已出席的預約無法取消」/「預約已取消」)
 *   - forbidden                (「只能取消自己的預約」/「無權存取其他店舖的資料」)
 *   - cutoff_breach            (「開課前 12 小時內無法自行取消，請直接聯繫店家」)
 *   - service_unavailable      (未 mapped 的 error 訊息 → 走 fallback)
 *
 *   ── 不漏側 ──
 *   - 不傳任何金流參數給 cancelBooking（thin wrapper 不污染 SoT 行為）
 *
 * Mock 範圍：
 *   - @/lib/session (requireSession)
 *   - @/server/actions/booking (cancelBooking)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks (必須在 import action 之前) ──
const mockRequireSession = vi.fn();
const mockCancelBooking = vi.fn();
const mockGetCustomerBookingEligibility = vi.fn();

vi.mock("@/lib/session", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/server/actions/booking", () => ({
  cancelBooking: (...args: unknown[]) => mockCancelBooking(...args),
}));

vi.mock("@/lib/customer-booking-eligibility", () => ({
  getCustomerBookingEligibility: (...args: unknown[]) =>
    mockGetCustomerBookingEligibility(...args),
}));

import { cancelLiffBooking } from "@/server/actions/liff-cancel-booking";

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

const VALID_INPUT = { bookingId: "bk-test-001" };

describe("cancelLiffBooking action (PR-D4A-1)", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockCancelBooking.mockReset();
    mockGetCustomerBookingEligibility.mockReset();
    mockGetCustomerBookingEligibility.mockResolvedValue({
      status: "ok", customerId: "cust-canonical", storeId: "store-zhubei",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────
  // invalid_input
  // ────────────────────────────────────────────────────

  describe("invalid_input 分支", () => {
    it("bookingId 為空字串 → invalid_input", async () => {
      const r = await cancelLiffBooking({ bookingId: "" });
      expect(r).toEqual({ status: "invalid_input" });
      expect(mockRequireSession).not.toHaveBeenCalled();
      expect(mockCancelBooking).not.toHaveBeenCalled();
    });

    it("缺 bookingId 欄位 → invalid_input", async () => {
      // @ts-expect-error 故意傳缺欄位
      const r = await cancelLiffBooking({});
      expect(r).toEqual({ status: "invalid_input" });
    });
  });

  // ────────────────────────────────────────────────────
  // no_customer
  // ────────────────────────────────────────────────────

  describe("no_customer 分支", () => {
    it("未完成姓名或有效手機 → profile_incomplete，且不取消預約", async () => {
      mockRequireSession.mockResolvedValue(CUSTOMER_USER);
      mockGetCustomerBookingEligibility.mockResolvedValue({ status: "profile_incomplete" });
      await expect(cancelLiffBooking(VALID_INPUT)).resolves.toEqual({ status: "profile_incomplete" });
      expect(mockCancelBooking).not.toHaveBeenCalled();
    });
    it("requireSession throw → no_customer", async () => {
      mockRequireSession.mockRejectedValue(new Error("no session"));
      const r = await cancelLiffBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
      expect(mockCancelBooking).not.toHaveBeenCalled();
    });

    it("user.role === OWNER → no_customer (staff 不該透過 LIFF 取消)", async () => {
      mockRequireSession.mockResolvedValue({ ...CUSTOMER_USER, role: "OWNER" });
      const r = await cancelLiffBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
      expect(mockCancelBooking).not.toHaveBeenCalled();
    });

    it("user.role === ADMIN → no_customer", async () => {
      mockRequireSession.mockResolvedValue({ ...CUSTOMER_USER, role: "ADMIN" });
      const r = await cancelLiffBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
      expect(mockCancelBooking).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────
  // ok / delegate
  // ────────────────────────────────────────────────────

  describe("ok 分支 + delegate 行為", () => {
    beforeEach(() => {
      mockRequireSession.mockResolvedValue(CUSTOMER_USER);
    });

    it("cancelBooking 回 success → status: ok", async () => {
      mockCancelBooking.mockResolvedValue({ success: true, data: undefined });
      const r = await cancelLiffBooking(VALID_INPUT);
      expect(r).toEqual({ status: "ok" });
    });

    it("delegate 時帶 (bookingId, '顧客自行取消') — 與 web 入口一致", async () => {
      mockCancelBooking.mockResolvedValue({ success: true, data: undefined });
      await cancelLiffBooking(VALID_INPUT);
      expect(mockCancelBooking).toHaveBeenCalledTimes(1);
      expect(mockCancelBooking).toHaveBeenCalledWith(
        "bk-test-001",
        "顧客自行取消",
      );
    });

    it("不傳任何金流參數 (thin wrapper 不污染 SoT)", async () => {
      mockCancelBooking.mockResolvedValue({ success: true, data: undefined });
      await cancelLiffBooking(VALID_INPUT);
      const call = mockCancelBooking.mock.calls[0];
      // call 只有 2 個引數：bookingId, note
      expect(call.length).toBe(2);
      expect(call[0]).toBe("bk-test-001");
      expect(call[1]).toBe("顧客自行取消");
    });
  });

  // ────────────────────────────────────────────────────
  // error mapping
  // ────────────────────────────────────────────────────

  describe("AppError message → status mapping", () => {
    beforeEach(() => {
      mockRequireSession.mockResolvedValue(CUSTOMER_USER);
    });

    // 表驅動：each error msg 對應 each expected status
    // 與 src/server/actions/booking.ts cancelBooking 的 AppError throw 一一對應
    it.each([
      { msg: "預約不存在", expected: "not_found" },
      { msg: "已出席的預約無法取消", expected: "status_blocked" },
      { msg: "預約已取消", expected: "status_blocked" },
      { msg: "只能取消自己的預約", expected: "forbidden" },
      { msg: "無權存取其他店舖的資料", expected: "forbidden" },
      {
        msg: "開課前 12 小時內無法自行取消，請直接聯繫店家",
        expected: "cutoff_breach",
      },
    ])("error '$msg' → status: $expected", async ({ msg, expected }) => {
      mockCancelBooking.mockResolvedValue({ success: false, error: msg });
      const r = await cancelLiffBooking(VALID_INPUT);
      expect(r).toEqual({ status: expected });
    });

    it("未 mapped 的 error → service_unavailable (fallback)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockCancelBooking.mockResolvedValue({
        success: false,
        error: "系統內部錯誤（隨機 unmapped 字串）",
      });
      const r = await cancelLiffBooking(VALID_INPUT);
      expect(r).toEqual({ status: "service_unavailable" });
      // 確認有 warn log（drift 監控）
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("error 為 undefined → service_unavailable (防禦)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockCancelBooking.mockResolvedValue({
        success: false,
        error: undefined as unknown as string,
      });
      const r = await cancelLiffBooking(VALID_INPUT);
      expect(r).toEqual({ status: "service_unavailable" });
      warnSpy.mockRestore();
    });
  });
});
