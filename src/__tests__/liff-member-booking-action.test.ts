/**
 * submitLiffMemberBooking server action (PR-G2) 行為測試
 *
 * 涵蓋（per 拍板 14 cases）：
 *   ── auth / input gate ──
 *   1. requireSession throw → no_customer
 *   2. non-CUSTOMER role → no_customer
 *   3. canonical resolver null → no_customer
 *   4. user.storeId null → no_customer
 *   5. invalid bookingDate / slotTime → invalid_input
 *
 *   ── delegate happy path ──
 *   6. success：createBooking 呼叫帶正確 args（canonical customerId / PACKAGE_SESSION /
 *      無 customerPlanWalletId / 無 servicePlanId / 無 isMakeup）
 *
 *   ── error mapping (PACKAGE_SESSION 專屬) ──
 *   7. createBooking BUSINESS_RULE 「沒有可使用的方案」 → no_wallet_available
 *   8. createBooking BUSINESS_RULE 「票券期限不足」 → wallet_expired
 *   9. createBooking BUSINESS_RULE 「方案次數不足」 → insufficient_sessions
 *
 *   ── error mapping (general，mirror submitLiffTrialBooking) ──
 *   10. createBooking 「已額滿」 → slot_full
 *   11. createBooking 「公休 / 進修 / 時段已被手動關閉」 → slot_unavailable
 *   12. createBooking 「體驗版預約上限 / 月度預約」 → booking_limit_reached
 *   13. createBooking unmapped error → service_unavailable
 *
 *   ── 防誤觸副作用 ──
 *   14. 不呼叫 Transaction / payment / wallet purchase services
 *       (driven by inputs：嚴格 verify createBooking 沒收到 expectedAmount /
 *       customerPlanWalletId / isMakeup 等可能觸發財務 side effect 的欄位)
 *
 * Mock 範圍：
 *   - @/lib/session (requireSession)
 *   - @/lib/customer-identity (getCanonicalCustomerIdForSession)
 *   - @/server/actions/booking (createBooking)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks (必須在 import action 之前) ──
const mockRequireSession = vi.fn();
const mockGetCanonicalId = vi.fn();
const mockCreateBooking = vi.fn();
const mockBookingFindFirst = vi.fn();

vi.mock("@/lib/session", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/customer-identity", () => ({
  getCanonicalCustomerIdForSession: (...args: unknown[]) =>
    mockGetCanonicalId(...args),
}));

vi.mock("@/server/actions/booking", () => ({
  createBooking: (...args: unknown[]) => mockCreateBooking(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      findFirst: (...args: unknown[]) => mockBookingFindFirst(...args),
    },
  },
}));

import { submitLiffMemberBooking } from "@/server/actions/liff-member-booking";

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

const VALID_INPUT = { bookingDate: "2026-06-15", slotTime: "10:00" };

function setupHappyPathPreconditions() {
  mockRequireSession.mockResolvedValue(CUSTOMER_USER);
  mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
}

describe("submitLiffMemberBooking action (PR-G2)", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetCanonicalId.mockReset();
    mockCreateBooking.mockReset();
    mockBookingFindFirst.mockReset();
    mockBookingFindFirst.mockResolvedValue({ isMakeup: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────
  // 1-4. no_customer 分支
  // ────────────────────────────────────────────────────────

  describe("no_customer 分支", () => {
    it("1. requireSession throw → no_customer", async () => {
      mockRequireSession.mockRejectedValue(new Error("no session"));
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
      expect(mockCreateBooking).not.toHaveBeenCalled();
    });

    it("2. non-CUSTOMER role (OWNER) → no_customer", async () => {
      mockRequireSession.mockResolvedValue({ ...CUSTOMER_USER, role: "OWNER" });
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
      expect(mockGetCanonicalId).not.toHaveBeenCalled();
      expect(mockCreateBooking).not.toHaveBeenCalled();
    });

    it("3. canonical resolver 回 null → no_customer", async () => {
      mockRequireSession.mockResolvedValue(CUSTOMER_USER);
      mockGetCanonicalId.mockResolvedValue(null);
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
      expect(mockCreateBooking).not.toHaveBeenCalled();
    });

    it("4. user.storeId null → no_customer", async () => {
      mockRequireSession.mockResolvedValue({ ...CUSTOMER_USER, storeId: null });
      mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
      expect(mockCreateBooking).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────
  // 5. invalid_input
  // ────────────────────────────────────────────────────────

  describe("invalid_input 分支", () => {
    it("5a. 無效 bookingDate → invalid_input (field=bookingDate)", async () => {
      const r = await submitLiffMemberBooking({
        bookingDate: "2026/06/15", // wrong format
        slotTime: "10:00",
      });
      expect(r).toEqual({ status: "invalid_input", field: "bookingDate" });
      expect(mockRequireSession).not.toHaveBeenCalled();
    });

    it("5b. 無效 slotTime → invalid_input (field=slotTime)", async () => {
      const r = await submitLiffMemberBooking({
        bookingDate: "2026-06-15",
        slotTime: "10am", // wrong format
      });
      expect(r).toEqual({ status: "invalid_input", field: "slotTime" });
      expect(mockRequireSession).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────
  // 6 + 14. success path + no payment side effects
  // ────────────────────────────────────────────────────────

  describe("success path → ok", () => {
    beforeEach(() => {
      setupHappyPathPreconditions();
    });

    it("6. createBooking returns success → ok with bookingId/date/slot", async () => {
      mockCreateBooking.mockResolvedValue({
        success: true,
        data: { bookingId: "book-mem-001" },
      });

      const r = await submitLiffMemberBooking(VALID_INPUT);

      expect(r).toEqual({
        status: "ok",
        bookingId: "book-mem-001",
        bookingDate: "2026-06-15",
        slotTime: "10:00",
        usedMakeup: false,
      });
    });

    it("6m. persisted booking 有補課券關聯 → 回 ok usedMakeup:true (PR-NoShow-2)", async () => {
      mockCreateBooking.mockResolvedValue({
        success: true,
        data: { bookingId: "book-makeup-001" },
      });
      mockBookingFindFirst.mockResolvedValue({ isMakeup: true });

      const r = await submitLiffMemberBooking(VALID_INPUT);

      expect(mockCreateBooking).toHaveBeenCalledWith({
        customerId: CANONICAL_CUSTOMER_ID,
        bookingDate: "2026-06-15",
        slotTime: "10:00",
        bookingType: "PACKAGE_SESSION",
        people: 1,
      });
      expect(r).toEqual({
        status: "ok",
        bookingId: "book-makeup-001",
        bookingDate: "2026-06-15",
        slotTime: "10:00",
        usedMakeup: true,
      });
    });

    it("keyed replay derives usedMakeup from the original booking instead of current credits", async () => {
      const requestKey = "liff_member_replay_01234567";
      mockCreateBooking.mockResolvedValue({
        success: true,
        data: { bookingId: "book-makeup-replay" },
      });
      mockBookingFindFirst.mockResolvedValue({ isMakeup: true });

      const first = await submitLiffMemberBooking({ ...VALID_INPUT, requestKey });
      const replay = await submitLiffMemberBooking({ ...VALID_INPUT, requestKey });

      expect(first).toMatchObject({
        status: "ok",
        bookingId: "book-makeup-replay",
        usedMakeup: true,
      });
      expect(replay).toEqual(first);
      expect(mockCreateBooking).toHaveBeenCalledTimes(2);
      expect(mockBookingFindFirst).toHaveBeenCalledTimes(2);
    });

    it("6a. createBooking called with PACKAGE_SESSION + canonical customerId + zero wallet/staff/payment fields", async () => {
      mockCreateBooking.mockResolvedValue({
        success: true,
        data: { bookingId: "book-mem-001" },
      });

      await submitLiffMemberBooking(VALID_INPUT);

      expect(mockCreateBooking).toHaveBeenCalledTimes(1);
      expect(mockCreateBooking).toHaveBeenCalledWith({
        customerId: CANONICAL_CUSTOMER_ID,
        bookingDate: "2026-06-15",
        slotTime: "10:00",
        bookingType: "PACKAGE_SESSION",
        people: 1,
      });
    });

    it("forwards an optional request key without changing the booking intent type", async () => {
      const requestKey = "liff_member_0123456789abcdef";
      mockCreateBooking.mockResolvedValue({
        success: true,
        data: { bookingId: "book-mem-keyed" },
      });
      const r = await submitLiffMemberBooking({ ...VALID_INPUT, requestKey });
      expect(r.status).toBe("ok");
      expect(mockCreateBooking).toHaveBeenCalledWith(
        expect.objectContaining({ bookingType: "PACKAGE_SESSION" }),
        { requestKey, source: "liff-member" },
      );
    });

    it("14. 嚴格驗證不傳任何 wallet / payment / makeup 欄位", async () => {
      mockCreateBooking.mockResolvedValue({
        success: true,
        data: { bookingId: "book-mem-001" },
      });

      await submitLiffMemberBooking(VALID_INPUT);

      const call = mockCreateBooking.mock.calls[0][0];
      // PACKAGE_SESSION 必要欄位 ✓
      expect(call.bookingType).toBe("PACKAGE_SESSION");
      expect(call.customerId).toBe(CANONICAL_CUSTOMER_ID);
      // 不可傳的欄位 — 確保沒副作用 / 沒繞過 FEFO
      expect(call.customerPlanWalletId).toBeUndefined();
      expect(call.servicePlanId).toBeUndefined();
      expect(call.isMakeup).toBeUndefined();
      expect(call.makeupCreditId).toBeUndefined();
      expect(call.expectedAmount).toBeUndefined();
      // 不指定 staff — 依 createBooking 內 snapshotRevenueStaffForBooking 自動處理
      expect(call.staffId).toBeUndefined();
      // PR-NoShow-2：人數由 action 帶入（未選預設 1）
      expect(call.people).toBe(1);
      // notes 不給顧客填（per 拍板 C）
      expect(call.notes).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────
  // 7-13. error mapping (PACKAGE_SESSION 專屬 + general)
  // ────────────────────────────────────────────────────────

  describe("error mapping", () => {
    beforeEach(() => {
      setupHappyPathPreconditions();
    });

    // ── PACKAGE_SESSION 專屬 errors (booking.ts:247-307) ──

    it.each([
      "目前沒有可使用的方案，請先購買課程方案或聯繫店家協助",
      "此顧客目前沒有可用方案，請先指派或購買方案後再建立預約",
      "找不到可用方案，請先指派或購買方案後再建立預約",
    ])("7. wallet 不存在 → no_wallet_available (%s)", async (msg) => {
      mockCreateBooking.mockResolvedValue({ success: false, error: msg });
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_wallet_available" });
    });

    it.each([
      "票券期限不足，方案有效期限至 2026-06-01，請選擇期限內日期",
      "方案已超過可使用期限，請聯繫店家協助",
    ])("8. wallet 過期 → wallet_expired (%s)", async (msg) => {
      mockCreateBooking.mockResolvedValue({ success: false, error: msg });
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "wallet_expired" });
    });

    it("9. 方案次數不足 → insufficient_sessions", async () => {
      mockCreateBooking.mockResolvedValue({
        success: false,
        error:
          "方案次數不足，無法預約 2 人。目前可使用次數僅剩 1 次，請調整預約人數或聯繫店家",
      });
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "insufficient_sessions" });
    });

    // ── General booking errors (mirror submitLiffTrialBooking) ──

    it.each([
      "該時段已額滿，請選擇其他時段",
      "該時段剩餘 0 個名額",
    ])("10. slot 已滿 → slot_full (%s)", async (msg) => {
      mockCreateBooking.mockResolvedValue({ success: false, error: msg });
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "slot_full" });
    });

    it.each([
      "2026-06-15 為公休日，無法預約",
      "2026-06-15 為進修日，無法預約",
      "2026-06-15 10:00 時段已被手動關閉",
      "尚無值班人員",
      "10:00 在該日不是有效時段",
      "不可預約過去的日期",
      "已過時段",
      "次月預約時段尚未開放，請等候店長通知。",
    ])("11. slot 不可用 → slot_unavailable (%s)", async (msg) => {
      mockCreateBooking.mockResolvedValue({ success: false, error: msg });
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "slot_unavailable" });
    });

    it.each([
      "本月已達體驗版預約上限",
      "已達月度預約上限",
    ])("12. 預約上限 → booking_limit_reached (%s)", async (msg) => {
      mockCreateBooking.mockResolvedValue({ success: false, error: msg });
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "booking_limit_reached" });
    });

    it("13. unmapped error → service_unavailable (fallback + warn)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockCreateBooking.mockResolvedValue({
        success: false,
        error: "未預期的內部錯誤訊息（測試用 unmapped string）",
      });
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "service_unavailable" });
      // drift 監控 — 確認有 warn log
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("13b. error 為 undefined → service_unavailable (defensive)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockCreateBooking.mockResolvedValue({
        success: false,
        error: undefined as unknown as string,
      });
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "service_unavailable" });
      warnSpy.mockRestore();
    });

    // ── canonical resolver internal failure 也對 ──

    it("13c. createBooking 內部 canonical 解析失敗 → no_customer", async () => {
      // booking.ts:174 throws「找不到您的顧客資料，請重新登入後再試」
      mockCreateBooking.mockResolvedValue({
        success: false,
        error: "找不到您的顧客資料，請重新登入後再試",
      });
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
    });

    it("13d. createBooking 顧客不存在 → no_customer", async () => {
      mockCreateBooking.mockResolvedValue({
        success: false,
        error: "顧客不存在",
      });
      const r = await submitLiffMemberBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
    });
  });
});
