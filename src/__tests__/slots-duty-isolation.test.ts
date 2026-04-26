/**
 * Regression: 前台月曆/單日時段必須帶 storeId 過濾 duty / shopConfig
 *
 * 防止以下歷史 bug 復發：
 *   1. fetchMonthAvailability / fetchDaySlots 呼叫 isDutySchedulingEnabled() 不帶 storeId
 *      → fallback 至 DEFAULT_STORE_ID（demo 店）讀 ShopConfig，造成全系統前台都被 duty filter 影響
 *   2. dutyAssignment.findMany 沒有 storeId where → 跨店資料污染，
 *      竹北店前台讀到 demo 店的值班，篩選後當日 totalCapacity = 0，月曆顯示「公休」
 *
 * 場景：竹北 (storeA) 5/5 weekly 營業；demo (storeB) 開啟 dutyScheduling 但竹北沒開。
 *      竹北顧客打開前台月曆，5/5 必須顯示營業（不被 demo 店設定影響）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock prisma 全 collection ──
const mockBusinessHoursFindMany = vi.fn();
const mockBusinessHoursFindFirst = vi.fn();
const mockSpecialDayFindMany = vi.fn();
const mockSpecialDayFindFirst = vi.fn();
const mockSlotOverrideFindMany = vi.fn();
const mockBookingGroupBy = vi.fn();
const mockDutyFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    businessHours: {
      findMany: (...a: unknown[]) => mockBusinessHoursFindMany(...a),
      findFirst: (...a: unknown[]) => mockBusinessHoursFindFirst(...a),
    },
    specialBusinessDay: {
      findMany: (...a: unknown[]) => mockSpecialDayFindMany(...a),
      findFirst: (...a: unknown[]) => mockSpecialDayFindFirst(...a),
    },
    slotOverride: {
      findMany: (...a: unknown[]) => mockSlotOverrideFindMany(...a),
    },
    booking: {
      groupBy: (...a: unknown[]) => mockBookingGroupBy(...a),
    },
    dutyAssignment: {
      findMany: (...a: unknown[]) => mockDutyFindMany(...a),
    },
  },
}));

// ── Mock session：登入為竹北 OWNER ──
const STORE_A = "store-zhubei";
const STORE_B = "store-demo";

vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    role: "OWNER",
    storeId: STORE_A,
    staffId: "staff-1",
    customerId: null,
    userId: "u1",
  })),
}));

// ── Mock store helpers ──
vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? "default",
  getActiveStoreForRead: vi.fn(),
  DEFAULT_STORE_ID: STORE_B, // demo 為 default —— 重現「無 storeId 時 fallback」的場景
}));

// ── Mock manager-visibility ──
vi.mock("@/lib/manager-visibility", () => ({
  getStoreFilter: (u: { storeId?: string | null }) => ({ storeId: u.storeId ?? null }),
}));

// ── Mock shop-config：竹北未開、demo 開啟 ──
const mockIsDutyEnabled = vi.fn(async (storeId?: string | null) => {
  // 重現舊 bug：若呼叫端沒傳 storeId，會 fallback 到 demo（true）
  const sid = storeId ?? STORE_B;
  return sid === STORE_B;
});
vi.mock("@/lib/shop-config", () => ({
  isDutySchedulingEnabled: (sid?: string | null) => mockIsDutyEnabled(sid),
}));

// ── Mock errors / date-utils 透傳 ──
vi.mock("@/lib/errors", () => ({
  AppError: class AppError extends Error {
    constructor(public code: string, msg: string) { super(msg); }
  },
}));

vi.mock("@/lib/date-utils", () => ({
  toLocalDateStr: () => "2026-04-26", // 固定「今天」避免 isPast 影響
  getNowTaipeiHHmm: () => "00:00",
}));

beforeEach(() => {
  vi.clearAllMocks();

  // 重置 mockIsDutyEnabled 為預設實作（前一測試可能用 mockImplementation 改寫）
  mockIsDutyEnabled.mockImplementation(async (storeId?: string | null) => {
    const sid = storeId ?? STORE_B;
    return sid === STORE_B;
  });

  // 預設：竹北 BusinessHours 整週營業 (10:00-22:00, 60min, 6 ppl)
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
    dayOfWeek: 2,
    isOpen: true,
    openTime: "10:00",
    closeTime: "22:00",
    slotInterval: 60,
    defaultCapacity: 6,
  });
  mockSpecialDayFindMany.mockResolvedValue([]);
  mockSpecialDayFindFirst.mockResolvedValue(null);
  mockSlotOverrideFindMany.mockResolvedValue([]);
  mockBookingGroupBy.mockResolvedValue([]);
  // 預設：竹北沒有任何 DutyAssignment（demo 店有，但被 storeId 隔離掉）
  mockDutyFindMany.mockResolvedValue([]);
});

// ── 測試 ──

describe("fetchMonthAvailability — duty storeId 隔離", () => {
  it("呼叫 isDutySchedulingEnabled 時必須傳 storeId（避免 fallback 至 demo）", async () => {
    const { fetchMonthAvailability } = await import("@/server/actions/slots");
    await fetchMonthAvailability(2026, 5);

    expect(mockIsDutyEnabled).toHaveBeenCalled();
    // 至少一次帶 storeA
    const callsWithStoreA = mockIsDutyEnabled.mock.calls.filter((c) => c[0] === STORE_A);
    expect(callsWithStoreA.length).toBeGreaterThan(0);
  });

  it("竹北未開 duty 時，不應查 dutyAssignment", async () => {
    const { fetchMonthAvailability } = await import("@/server/actions/slots");
    await fetchMonthAvailability(2026, 5);

    // 竹北 isDutySchedulingEnabled = false → 不需查 duty
    expect(mockDutyFindMany).not.toHaveBeenCalled();
  });

  it("竹北未開 duty + 5 月 weekly 全營業 → 5/5 totalCapacity > 0（不會被誤判公休）", async () => {
    const { fetchMonthAvailability } = await import("@/server/actions/slots");
    const result = await fetchMonthAvailability(2026, 5);

    expect(result.days["2026-05-05"]).toBeDefined();
    expect(result.days["2026-05-05"].totalCapacity).toBeGreaterThan(0);
    expect(result.days["2026-05-05"].slots.length).toBeGreaterThan(0);
  });

  it("若該店開啟 duty，dutyAssignment 查詢必帶 storeId", async () => {
    // 模擬竹北也開啟 duty
    mockIsDutyEnabled.mockImplementation(async () => true);

    const { fetchMonthAvailability } = await import("@/server/actions/slots");
    await fetchMonthAvailability(2026, 5);

    expect(mockDutyFindMany).toHaveBeenCalled();
    const dutyArgs = mockDutyFindMany.mock.calls[0][0];
    expect(dutyArgs.where).toMatchObject({ storeId: STORE_A });
  });
});

describe("fetchDaySlots — duty storeId 隔離", () => {
  it("呼叫 isDutySchedulingEnabled 時必須傳 storeId", async () => {
    mockSpecialDayFindFirst.mockResolvedValue(null);

    const { fetchDaySlots } = await import("@/server/actions/slots");
    await fetchDaySlots("2026-05-05");

    const callsWithStoreA = mockIsDutyEnabled.mock.calls.filter((c) => c[0] === STORE_A);
    expect(callsWithStoreA.length).toBeGreaterThan(0);
  });

  it("若該店開啟 duty，dutyAssignment 查詢必帶 storeId", async () => {
    mockIsDutyEnabled.mockImplementation(async () => true);
    mockSpecialDayFindFirst.mockResolvedValue(null);

    const { fetchDaySlots } = await import("@/server/actions/slots");
    await fetchDaySlots("2026-05-05");

    expect(mockDutyFindMany).toHaveBeenCalled();
    const dutyArgs = mockDutyFindMany.mock.calls[0][0];
    expect(dutyArgs.where).toMatchObject({ storeId: STORE_A });
  });

  it("竹北未開 duty + 5/5 weekly 營業 → 回傳的 slots 不為空", async () => {
    mockSpecialDayFindFirst.mockResolvedValue(null);

    const { fetchDaySlots } = await import("@/server/actions/slots");
    const result = await fetchDaySlots("2026-05-05");

    expect(result.slots.length).toBeGreaterThan(0);
  });
});

describe("loadMonthBusinessHoursContext — 後台與前台讀取相同資料", () => {
  it("查詢 BusinessHours / SpecialBusinessDay / SlotOverride 全部帶 storeId", async () => {
    const { loadMonthBusinessHoursContext } = await import("@/lib/business-hours-resolver");
    await loadMonthBusinessHoursContext(STORE_A, 2026, 5);

    expect(mockBusinessHoursFindMany).toHaveBeenCalledWith({ where: { storeId: STORE_A } });
    expect(mockSpecialDayFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ storeId: STORE_A }) }),
    );
    expect(mockSlotOverrideFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ storeId: STORE_A }) }),
    );
  });
});
