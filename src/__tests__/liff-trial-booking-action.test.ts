/**
 * submitLiffTrialBooking server action (PR-D1A) 行為測試
 *
 * 涵蓋的 status 分支：
 *   - ok                       (success path)
 *   - already_has_trial        (R1 重複 booking 防禦)
 *   - invalid_input            (bookingDate / slotTime 格式錯)
 *   - no_customer              (session 缺、role 非 CUSTOMER、canonical resolve null、storeId null)
 *   - slot_full                (createBooking 回容量訊息)
 *   - slot_unavailable         (公休、disabled、duty、過期、bookable window、店家停用 trial)
 *   - booking_limit_reached    (FREE 方案上限 / 月度上限)
 *   - service_unavailable      (duplicate check throw / ensureTrialPlan throw / unmapped error)
 *
 * Mock 範圍：
 *   - @/lib/session (requireSession)
 *   - @/lib/customer-identity (getCanonicalCustomerIdForSession)
 *   - @/lib/db (prisma.booking.findFirst)
 *   - @/lib/shop-config (getTrialSettings)
 *   - @/server/services/trial-plan (ensureTrialPlan)
 *   - @/server/actions/booking (createBooking)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks (必須在 import action 之前) ──
const mockRequireSession = vi.fn();
const mockGetCanonicalId = vi.fn();
const mockBookingFindFirst = vi.fn();
const mockGetTrialSettings = vi.fn();
const mockEnsureTrialPlan = vi.fn();
const mockCreateBooking = vi.fn();

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
      findFirst: (...args: unknown[]) => mockBookingFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/shop-config", () => ({
  getTrialSettings: (...args: unknown[]) => mockGetTrialSettings(...args),
}));

vi.mock("@/server/services/trial-plan", () => ({
  ensureTrialPlan: (...args: unknown[]) => mockEnsureTrialPlan(...args),
}));

vi.mock("@/server/actions/booking", () => ({
  createBooking: (...args: unknown[]) => mockCreateBooking(...args),
}));

import { submitLiffTrialBooking } from "@/server/actions/liff-trial-booking";

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
const STORE_ID = "store-zhubei";
const TRIAL_PLAN_ID = "plan-trial-001";

const VALID_INPUT = { bookingDate: "2026-05-25", slotTime: "10:00" };

const DEFAULT_TRIAL_SETTINGS = {
  trialEnabled: true,
  trialDefaultPrice: 499,
  trialAllowPriceEdit: false,
  trialMinPrice: 499,
  trialMaxPrice: 499,
};

function setupHappyPathPreconditions() {
  mockRequireSession.mockResolvedValue(CUSTOMER_USER);
  mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
  mockBookingFindFirst.mockResolvedValue(null); // no duplicate
  mockGetTrialSettings.mockResolvedValue(DEFAULT_TRIAL_SETTINGS);
  mockEnsureTrialPlan.mockResolvedValue({ id: TRIAL_PLAN_ID });
}

describe("submitLiffTrialBooking action (PR-D1A)", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetCanonicalId.mockReset();
    mockBookingFindFirst.mockReset();
    mockGetTrialSettings.mockReset();
    mockEnsureTrialPlan.mockReset();
    mockCreateBooking.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────
  // Happy path
  // ────────────────────────────────────────────────────────

  describe("success path → ok", () => {
    it("creates booking and returns ok with bookingId/date/slot", async () => {
      setupHappyPathPreconditions();
      mockCreateBooking.mockResolvedValue({
        success: true,
        data: { bookingId: "book-001" },
      });

      const r = await submitLiffTrialBooking(VALID_INPUT);

      expect(r).toEqual({
        status: "ok",
        bookingId: "book-001",
        bookingDate: "2026-05-25",
        slotTime: "10:00",
      });
    });

    it("calls createBooking with FIRST_TRIAL + canonical customerId + no expectedAmount/wallet", async () => {
      setupHappyPathPreconditions();
      mockCreateBooking.mockResolvedValue({
        success: true,
        data: { bookingId: "book-001" },
      });

      await submitLiffTrialBooking(VALID_INPUT);

      expect(mockCreateBooking).toHaveBeenCalledWith({
        customerId: CANONICAL_CUSTOMER_ID,
        bookingDate: "2026-05-25",
        slotTime: "10:00",
        bookingType: "FIRST_TRIAL",
        servicePlanId: TRIAL_PLAN_ID,
      });
      // 確認沒傳 expectedAmount / customerPlanWalletId / isMakeup
      const call = mockCreateBooking.mock.calls[0][0];
      expect(call.expectedAmount).toBeUndefined();
      expect(call.customerPlanWalletId).toBeUndefined();
      expect(call.isMakeup).toBeUndefined();
      expect(call.makeupCreditId).toBeUndefined();
    });

    it("looks up canonical customer (does not trust client)", async () => {
      setupHappyPathPreconditions();
      mockCreateBooking.mockResolvedValue({
        success: true,
        data: { bookingId: "book-001" },
      });

      await submitLiffTrialBooking(VALID_INPUT);

      expect(mockGetCanonicalId).toHaveBeenCalledWith(CUSTOMER_USER);
    });

    it("queries duplicate trial scoped to canonical customerId + FIRST_TRIAL + A2 statuses", async () => {
      setupHappyPathPreconditions();
      mockCreateBooking.mockResolvedValue({
        success: true,
        data: { bookingId: "book-001" },
      });

      await submitLiffTrialBooking(VALID_INPUT);

      const findFirstCall = mockBookingFindFirst.mock.calls[0][0];
      expect(findFirstCall.where).toMatchObject({
        customerId: CANONICAL_CUSTOMER_ID,
        bookingType: "FIRST_TRIAL",
      });
      // A2 規則：PENDING / CONFIRMED / COMPLETED 擋；CANCELLED / NO_SHOW 不擋
      expect(findFirstCall.where.bookingStatus).toEqual({
        in: ["PENDING", "CONFIRMED", "COMPLETED"],
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // Already has trial
  // ────────────────────────────────────────────────────────

  it("already PENDING trial → already_has_trial with existing booking detail", async () => {
    mockRequireSession.mockResolvedValue(CUSTOMER_USER);
    mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
    mockBookingFindFirst.mockResolvedValue({
      id: "book-existing",
      bookingDate: new Date("2026-05-30T00:00:00Z"),
      slotTime: "14:00",
    });

    const r = await submitLiffTrialBooking(VALID_INPUT);

    expect(r).toEqual({
      status: "already_has_trial",
      existingBookingId: "book-existing",
      existingBookingDate: "2026-05-30",
      existingSlotTime: "14:00",
    });
    expect(mockEnsureTrialPlan).not.toHaveBeenCalled();
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it("already CONFIRMED trial → also blocked", async () => {
    mockRequireSession.mockResolvedValue(CUSTOMER_USER);
    mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
    mockBookingFindFirst.mockResolvedValue({
      id: "book-confirmed",
      bookingDate: new Date("2026-06-01T00:00:00Z"),
      slotTime: "11:00",
    });

    const r = await submitLiffTrialBooking(VALID_INPUT);

    expect(r.status).toBe("already_has_trial");
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  // ── A2 規則新增 ────────────────────────────────────────
  it("already COMPLETED trial → blocked (A2 規則：真的體驗過就不再自助)", async () => {
    mockRequireSession.mockResolvedValue(CUSTOMER_USER);
    mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
    // 模擬 DB layer 已用 where filter 命中 COMPLETED row
    mockBookingFindFirst.mockResolvedValue({
      id: "book-completed",
      bookingDate: new Date("2026-04-10T00:00:00Z"),
      slotTime: "15:00",
    });

    const r = await submitLiffTrialBooking(VALID_INPUT);

    expect(r).toEqual({
      status: "already_has_trial",
      existingBookingId: "book-completed",
      existingBookingDate: "2026-04-10",
      existingSlotTime: "15:00",
    });
    expect(mockEnsureTrialPlan).not.toHaveBeenCalled();
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it("previous CANCELLED trial → NOT blocked, proceeds to createBooking (A2 規則)", async () => {
    setupHappyPathPreconditions();
    // CANCELLED 不在 where filter 內 → DB 不會回；mock null 模擬 filter 已剔除
    mockBookingFindFirst.mockResolvedValue(null);
    mockCreateBooking.mockResolvedValue({
      success: true,
      data: { bookingId: "book-retry" },
    });

    const r = await submitLiffTrialBooking(VALID_INPUT);

    expect(r.status).toBe("ok");
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  });

  it("previous NO_SHOW trial → NOT blocked, proceeds to createBooking (A2 規則)", async () => {
    setupHappyPathPreconditions();
    mockBookingFindFirst.mockResolvedValue(null);
    mockCreateBooking.mockResolvedValue({
      success: true,
      data: { bookingId: "book-retry" },
    });

    const r = await submitLiffTrialBooking(VALID_INPUT);

    expect(r.status).toBe("ok");
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  });

  it("duplicate-check 不查 CANCELLED / NO_SHOW (where filter 合約)", async () => {
    setupHappyPathPreconditions();
    mockCreateBooking.mockResolvedValue({
      success: true,
      data: { bookingId: "book-001" },
    });

    await submitLiffTrialBooking(VALID_INPUT);

    const findFirstCall = mockBookingFindFirst.mock.calls[0][0];
    const statusList = findFirstCall.where.bookingStatus.in as string[];
    expect(statusList).toContain("PENDING");
    expect(statusList).toContain("CONFIRMED");
    expect(statusList).toContain("COMPLETED");
    expect(statusList).not.toContain("CANCELLED");
    expect(statusList).not.toContain("NO_SHOW");
  });

  // ────────────────────────────────────────────────────────
  // invalid_input
  // ────────────────────────────────────────────────────────

  describe("invalid_input", () => {
    it("malformed bookingDate → invalid_input field=bookingDate", async () => {
      const r = await submitLiffTrialBooking({
        bookingDate: "2026/05/25",
        slotTime: "10:00",
      });
      expect(r).toEqual({ status: "invalid_input", field: "bookingDate" });
      expect(mockRequireSession).not.toHaveBeenCalled();
    });

    it("malformed slotTime → invalid_input field=slotTime", async () => {
      const r = await submitLiffTrialBooking({
        bookingDate: "2026-05-25",
        slotTime: "10am",
      });
      expect(r).toEqual({ status: "invalid_input", field: "slotTime" });
    });

    it("empty bookingDate → invalid_input", async () => {
      const r = await submitLiffTrialBooking({
        bookingDate: "",
        slotTime: "10:00",
      });
      expect(r.status).toBe("invalid_input");
    });
  });

  // ────────────────────────────────────────────────────────
  // no_customer
  // ────────────────────────────────────────────────────────

  describe("no_customer", () => {
    it("session missing (requireSession throws) → no_customer", async () => {
      mockRequireSession.mockRejectedValue(new Error("no session"));
      const r = await submitLiffTrialBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
    });

    it("staff role blocked (use createTrialBooking instead)", async () => {
      mockRequireSession.mockResolvedValue({
        ...CUSTOMER_USER,
        role: "OWNER",
        customerId: null,
      });
      const r = await submitLiffTrialBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
      expect(mockGetCanonicalId).not.toHaveBeenCalled();
    });

    it("ADMIN role blocked", async () => {
      mockRequireSession.mockResolvedValue({
        ...CUSTOMER_USER,
        role: "ADMIN",
        storeId: null,
      });
      const r = await submitLiffTrialBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
    });

    it("canonical customerId resolves null → no_customer", async () => {
      mockRequireSession.mockResolvedValue(CUSTOMER_USER);
      mockGetCanonicalId.mockResolvedValue(null);
      const r = await submitLiffTrialBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
    });

    it("session.storeId null → no_customer", async () => {
      mockRequireSession.mockResolvedValue({
        ...CUSTOMER_USER,
        storeId: null,
      });
      mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
      const r = await submitLiffTrialBooking(VALID_INPUT);
      expect(r).toEqual({ status: "no_customer" });
    });

    it("createBooking 回「顧客不存在」→ no_customer (race condition)", async () => {
      setupHappyPathPreconditions();
      mockCreateBooking.mockResolvedValue({
        success: false,
        error: "顧客不存在",
      });
      const r = await submitLiffTrialBooking(VALID_INPUT);
      expect(r.status).toBe("no_customer");
    });
  });

  // ────────────────────────────────────────────────────────
  // slot_full / slot_unavailable / booking_limit_reached mapping
  // ────────────────────────────────────────────────────────

  describe("createBooking error mapping", () => {
    it.each([
      ["體驗版預約上限 100 筆已達", "booking_limit_reached"],
      ["已超過 PricingPlan 月度預約上限", "booking_limit_reached"],
      ["該時段已額滿，請選擇其他時段", "slot_full"],
      ["該時段剩餘 1 位，無法預約 2 位", "slot_full"],
      ["2026-05-25 為公休日，無法預約", "slot_unavailable"],
      ["2026-05-25 為進修日，無法預約", "slot_unavailable"],
      ["2026-05-25 10:00 時段已被手動關閉", "slot_unavailable"],
      ["2026-05-25 10:00 尚無值班人員安排，無法預約", "slot_unavailable"],
      ["10:00 在該日不是有效時段", "slot_unavailable"],
      ["不可預約過去的日期", "slot_unavailable"],
      ["不可預約已過時段（10:00 已過）", "slot_unavailable"],
      ["次月預約時段尚未開放，請等候店長通知。", "slot_unavailable"],
    ])("createBooking error %s → status=%s", async (errorMsg, expectedStatus) => {
      setupHappyPathPreconditions();
      mockCreateBooking.mockResolvedValue({ success: false, error: errorMsg });
      const r = await submitLiffTrialBooking(VALID_INPUT);
      expect(r.status).toBe(expectedStatus);
    });

    it("unmapped error → service_unavailable + console.warn", async () => {
      setupHappyPathPreconditions();
      mockCreateBooking.mockResolvedValue({
        success: false,
        error: "預期外錯誤訊息 xxx",
      });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const r = await submitLiffTrialBooking(VALID_INPUT);
      expect(r.status).toBe("service_unavailable");
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("empty error string → service_unavailable", async () => {
      setupHappyPathPreconditions();
      mockCreateBooking.mockResolvedValue({ success: false, error: "" });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const r = await submitLiffTrialBooking(VALID_INPUT);
      expect(r.status).toBe("service_unavailable");
      warnSpy.mockRestore();
    });
  });

  // ────────────────────────────────────────────────────────
  // trial plan / settings edges
  // ────────────────────────────────────────────────────────

  describe("trial plan / settings", () => {
    it("trialEnabled=false → slot_unavailable (店家暫停)", async () => {
      mockRequireSession.mockResolvedValue(CUSTOMER_USER);
      mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
      mockBookingFindFirst.mockResolvedValue(null);
      mockGetTrialSettings.mockResolvedValue({
        ...DEFAULT_TRIAL_SETTINGS,
        trialEnabled: false,
      });

      const r = await submitLiffTrialBooking(VALID_INPUT);
      expect(r.status).toBe("slot_unavailable");
      expect(mockEnsureTrialPlan).not.toHaveBeenCalled();
      expect(mockCreateBooking).not.toHaveBeenCalled();
    });

    it("ensureTrialPlan throws → service_unavailable", async () => {
      mockRequireSession.mockResolvedValue(CUSTOMER_USER);
      mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
      mockBookingFindFirst.mockResolvedValue(null);
      mockGetTrialSettings.mockResolvedValue(DEFAULT_TRIAL_SETTINGS);
      mockEnsureTrialPlan.mockRejectedValue(new Error("db down"));

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const r = await submitLiffTrialBooking(VALID_INPUT);
      expect(r.status).toBe("service_unavailable");
      expect(mockCreateBooking).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("getTrialSettings throws → service_unavailable", async () => {
      mockRequireSession.mockResolvedValue(CUSTOMER_USER);
      mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
      mockBookingFindFirst.mockResolvedValue(null);
      mockGetTrialSettings.mockRejectedValue(new Error("config fetch failed"));

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const r = await submitLiffTrialBooking(VALID_INPUT);
      expect(r.status).toBe("service_unavailable");
      errorSpy.mockRestore();
    });
  });

  // ────────────────────────────────────────────────────────
  // Duplicate check throw
  // ────────────────────────────────────────────────────────

  it("duplicate-check throws (DB transient) → service_unavailable", async () => {
    mockRequireSession.mockResolvedValue(CUSTOMER_USER);
    mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
    mockBookingFindFirst.mockRejectedValue(new Error("conn reset"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await submitLiffTrialBooking(VALID_INPUT);
    expect(r.status).toBe("service_unavailable");
    expect(mockCreateBooking).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // ────────────────────────────────────────────────────────
  // Cross-store / dirty data safety
  // ────────────────────────────────────────────────────────

  it("session storeId 不變地傳給 ensureTrialPlan + duplicate check 仍 customer-scoped", async () => {
    setupHappyPathPreconditions();
    mockCreateBooking.mockResolvedValue({
      success: true,
      data: { bookingId: "book-001" },
    });

    await submitLiffTrialBooking(VALID_INPUT);

    expect(mockGetTrialSettings).toHaveBeenCalledWith(STORE_ID);
    expect(mockEnsureTrialPlan).toHaveBeenCalledWith(STORE_ID, 499);
    // duplicate check: 用 canonical customerId（不 query by storeId — booking 表本身 customer-scoped）
    const findFirstCall = mockBookingFindFirst.mock.calls[0][0];
    expect(findFirstCall.where.customerId).toBe(CANONICAL_CUSTOMER_ID);
  });
});
