/**
 * previewStaffSettlement — PR-2 試算 query 行為測試
 *
 * 覆蓋：
 *   - 空 range → 空 summary / details
 *   - 全 regular booking → summary 1 列
 *   - regular + makeup 混合 → 分開 count
 *   - 多店長 group → summary 依 totalCount desc 排序
 *   - revenueStaffId=null → "(歸店家)" 排最下面
 *   - staffId 篩選：全部 / UNASSIGNED_STAFF_TOKEN / 特定 staff
 *   - PARTNER 不可透過 staffId 篩選看他人資料（manager visibility 不被覆蓋）
 *   - serviceStaffId 只影響顯示，不影響歸屬
 *   - counted flag：null → false, 有值 → true
 *   - 不寫入任何資料（守門：所有 prisma write 動詞被攔截）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const STAFF_A = "staff-aaa";
const STAFF_B = "staff-bbb";

const mockBookingFindMany = vi.fn();

function throwIfCalled(name: string) {
  return vi.fn((...args: unknown[]) => {
    throw new Error(`[guard] unexpected ${name}(${JSON.stringify(args)})`);
  });
}

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      findMany: (...a: unknown[]) => mockBookingFindMany(...a),
      // Write guards
      create: throwIfCalled("booking.create"),
      update: throwIfCalled("booking.update"),
      updateMany: throwIfCalled("booking.updateMany"),
      delete: throwIfCalled("booking.delete"),
      upsert: throwIfCalled("booking.upsert"),
    },
    // Other models should never be touched by this query
    customer: { update: throwIfCalled("customer.update") },
    transaction: { create: throwIfCalled("transaction.create") },
    customerPlanWallet: { update: throwIfCalled("wallet.update") },
    walletSession: { update: throwIfCalled("session.update") },
  },
}));

// requireStaffSession returns a fake user; tests override per-case to simulate
// different roles (OWNER vs PARTNER).
const mockRequireStaffSession = vi.fn();
vi.mock("@/lib/session", () => ({
  requireStaffSession: () => mockRequireStaffSession(),
}));

// Mock manager-visibility to simulate SELF_ONLY vs OWNER visibility deterministically
const mockGetManagerReadFilter = vi.fn();
vi.mock("@/lib/manager-visibility", () => ({
  getManagerReadFilter: (...a: unknown[]) => mockGetManagerReadFilter(...a),
}));

// ── Import after mocks ────────────────────────────────────────────────
import {
  previewStaffSettlement,
  UNASSIGNED_STAFF_TOKEN,
} from "@/server/queries/staff-settlement";

// ── Test data factory ─────────────────────────────────────────────────

function bookingRow(opts: {
  id: string;
  date: string; // YYYY-MM-DD
  slot?: string;
  customerName?: string;
  bookingType?: "PACKAGE_SESSION" | "SINGLE" | "FIRST_TRIAL";
  isMakeup?: boolean;
  revenueStaffId: string | null;
  revenueStaffName?: string | null;
  serviceStaffId?: string | null;
  serviceStaffName?: string | null;
}) {
  return {
    id: opts.id,
    bookingDate: new Date(`${opts.date}T00:00:00.000Z`),
    slotTime: opts.slot ?? "10:00",
    bookingType: opts.bookingType ?? "PACKAGE_SESSION",
    isMakeup: opts.isMakeup ?? false,
    revenueStaffId: opts.revenueStaffId,
    serviceStaffId: opts.serviceStaffId ?? null,
    customer: { name: opts.customerName ?? "Test Customer" },
    revenueStaff: opts.revenueStaffId
      ? { id: opts.revenueStaffId, displayName: opts.revenueStaffName ?? "Staff X" }
      : null,
    serviceStaff: opts.serviceStaffId
      ? { id: opts.serviceStaffId, displayName: opts.serviceStaffName ?? "Service X" }
      : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // 預設：OWNER 視角（無 manager 限制）
  mockRequireStaffSession.mockResolvedValue({
    role: "OWNER",
    staffId: STAFF_A,
    storeId: STORE_A,
  });
  mockGetManagerReadFilter.mockReturnValue({ storeId: STORE_A });
  mockBookingFindMany.mockResolvedValue([]);
});

// ── 基本路徑 ────────────────────────────────────────────────────────

describe("previewStaffSettlement — basics", () => {
  it("空 range → 空 summary 與 details", async () => {
    mockBookingFindMany.mockResolvedValueOnce([]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r).toEqual({ summary: [], details: [] });
  });

  it("全 regular booking → summary 1 列，regularCount=N, makeupCount=0", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      bookingRow({ id: "b1", date: "2026-05-01", revenueStaffId: STAFF_A, revenueStaffName: "芊芊" }),
      bookingRow({ id: "b2", date: "2026-05-02", revenueStaffId: STAFF_A, revenueStaffName: "芊芊" }),
      bookingRow({ id: "b3", date: "2026-05-03", revenueStaffId: STAFF_A, revenueStaffName: "芊芊" }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.summary).toEqual([
      { staffId: STAFF_A, staffName: "芊芊", regularCount: 3, makeupCount: 0, totalCount: 3 },
    ]);
    expect(r.details).toHaveLength(3);
    expect(r.details.every((d) => d.counted)).toBe(true);
  });

  it("regular + makeup 混合 → 分開 count", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      bookingRow({ id: "b1", date: "2026-05-01", revenueStaffId: STAFF_A, revenueStaffName: "芊芊", isMakeup: false }),
      bookingRow({ id: "b2", date: "2026-05-02", revenueStaffId: STAFF_A, revenueStaffName: "芊芊", isMakeup: true }),
      bookingRow({ id: "b3", date: "2026-05-03", revenueStaffId: STAFF_A, revenueStaffName: "芊芊", isMakeup: true }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.summary).toEqual([
      { staffId: STAFF_A, staffName: "芊芊", regularCount: 1, makeupCount: 2, totalCount: 3 },
    ]);
  });
});

// ── 多店長 group + 排序 ────────────────────────────────────────────

describe("previewStaffSettlement — grouping & sorting", () => {
  it("多店長 → 依 totalCount desc 排序", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      bookingRow({ id: "b1", date: "2026-05-01", revenueStaffId: STAFF_B, revenueStaffName: "Beta" }),
      bookingRow({ id: "b2", date: "2026-05-02", revenueStaffId: STAFF_A, revenueStaffName: "Alpha" }),
      bookingRow({ id: "b3", date: "2026-05-03", revenueStaffId: STAFF_A, revenueStaffName: "Alpha" }),
      bookingRow({ id: "b4", date: "2026-05-04", revenueStaffId: STAFF_A, revenueStaffName: "Alpha" }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.summary.map((s) => s.staffId)).toEqual([STAFF_A, STAFF_B]);
    expect(r.summary[0].totalCount).toBe(3);
    expect(r.summary[1].totalCount).toBe(1);
  });

  it("null revenueStaffId → \"(歸店家)\" 排最下面", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      bookingRow({ id: "b1", date: "2026-05-01", revenueStaffId: null }),
      bookingRow({ id: "b2", date: "2026-05-02", revenueStaffId: null }),
      bookingRow({ id: "b3", date: "2026-05-03", revenueStaffId: STAFF_A, revenueStaffName: "Alpha" }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.summary).toHaveLength(2);
    expect(r.summary[0].staffId).toBe(STAFF_A);
    expect(r.summary[1].staffId).toBeNull();
    expect(r.summary[1].staffName).toBe("(歸店家)");
    // 即使「歸店家」row 的 count 比較高，也應排在最後（語意：最後檢查項）
  });

  it("即使歸店家 count 更高，仍排最下面", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      bookingRow({ id: "b1", date: "2026-05-01", revenueStaffId: null }),
      bookingRow({ id: "b2", date: "2026-05-02", revenueStaffId: null }),
      bookingRow({ id: "b3", date: "2026-05-03", revenueStaffId: null }),
      bookingRow({ id: "b4", date: "2026-05-04", revenueStaffId: STAFF_A, revenueStaffName: "Alpha" }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.summary[0].staffId).toBe(STAFF_A);
    expect(r.summary[1].staffId).toBeNull();
  });

  it("counted flag: null → false, 有值 → true", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      bookingRow({ id: "b1", date: "2026-05-01", revenueStaffId: STAFF_A, revenueStaffName: "A" }),
      bookingRow({ id: "b2", date: "2026-05-02", revenueStaffId: null }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.details[0].counted).toBe(true);
    expect(r.details[1].counted).toBe(false);
  });

  it("serviceStaffId 只影響顯示，不影響歸屬 (counted 仍看 revenueStaffId)", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      bookingRow({
        id: "b1",
        date: "2026-05-01",
        revenueStaffId: null,
        serviceStaffId: STAFF_B,
        serviceStaffName: "Beta",
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.summary).toEqual([
      { staffId: null, staffName: "(歸店家)", regularCount: 1, makeupCount: 0, totalCount: 1 },
    ]);
    expect(r.details[0].counted).toBe(false);
    expect(r.details[0].serviceStaffName).toBe("Beta");
    expect(r.details[0].revenueStaffName).toBe("(歸店家)");
  });
});

// ── Staff 篩選 ──────────────────────────────────────────────────────

describe("previewStaffSettlement — staff filter", () => {
  it("staffId 為 undefined → where 內無 revenueStaffId 限制", async () => {
    mockBookingFindMany.mockResolvedValueOnce([]);
    await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    const [callArg] = mockBookingFindMany.mock.calls[0];
    expect(callArg.where).not.toHaveProperty("revenueStaffId");
  });

  it("staffId = UNASSIGNED_STAFF_TOKEN → where.revenueStaffId = null", async () => {
    mockBookingFindMany.mockResolvedValueOnce([]);
    await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      staffId: UNASSIGNED_STAFF_TOKEN,
    });
    const [callArg] = mockBookingFindMany.mock.calls[0];
    expect(callArg.where.revenueStaffId).toBeNull();
  });

  it("staffId = 特定 cuid → where.revenueStaffId = 該 cuid", async () => {
    mockBookingFindMany.mockResolvedValueOnce([]);
    await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      staffId: STAFF_A,
    });
    const [callArg] = mockBookingFindMany.mock.calls[0];
    expect(callArg.where.revenueStaffId).toBe(STAFF_A);
  });
});

// ── PARTNER manager visibility 不被覆蓋 ─────────────────────────────

describe("previewStaffSettlement — PARTNER visibility lockdown", () => {
  it("PARTNER manager filter 已綁定 revenueStaffId → 即使 URL 傳他人 staffId 也不可覆蓋", async () => {
    // Simulate PARTNER SELF_ONLY mode: getManagerReadFilter returns
    // { storeId, revenueStaffId: STAFF_A } (PARTNER is STAFF_A)
    mockRequireStaffSession.mockResolvedValueOnce({
      role: "PARTNER",
      staffId: STAFF_A,
      storeId: STORE_A,
    });
    mockGetManagerReadFilter.mockReturnValueOnce({
      storeId: STORE_A,
      revenueStaffId: STAFF_A, // PARTNER bound to self
    });
    mockBookingFindMany.mockResolvedValueOnce([]);

    // PARTNER 嘗試從 URL 傳 staffId=STAFF_B 想看別人
    await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      staffId: STAFF_B,
    });

    const [callArg] = mockBookingFindMany.mock.calls[0];
    // 最終 where.revenueStaffId 必須仍是 STAFF_A，不可被覆蓋
    expect(callArg.where.revenueStaffId).toBe(STAFF_A);
  });

  it("PARTNER 傳 UNASSIGNED_STAFF_TOKEN 也不可覆蓋 manager filter", async () => {
    mockRequireStaffSession.mockResolvedValueOnce({
      role: "PARTNER",
      staffId: STAFF_A,
      storeId: STORE_A,
    });
    mockGetManagerReadFilter.mockReturnValueOnce({
      storeId: STORE_A,
      revenueStaffId: STAFF_A,
    });
    mockBookingFindMany.mockResolvedValueOnce([]);

    await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      staffId: UNASSIGNED_STAFF_TOKEN,
    });

    const [callArg] = mockBookingFindMany.mock.calls[0];
    expect(callArg.where.revenueStaffId).toBe(STAFF_A);
  });
});

// ── Multi-store scope ────────────────────────────────────────────────

describe("previewStaffSettlement — multi-store scope", () => {
  it("activeStoreId 被帶入 getManagerReadFilter", async () => {
    mockBookingFindMany.mockResolvedValueOnce([]);
    await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      activeStoreId: "store-other",
    });
    // 第 4 個 arg 是 storeId
    expect(mockGetManagerReadFilter).toHaveBeenCalledWith(
      "OWNER",
      STAFF_A,
      "revenueStaffId",
      "store-other",
    );
  });

  it("activeStoreId 為 null → 走 user.storeId fallback", async () => {
    mockBookingFindMany.mockResolvedValueOnce([]);
    await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      activeStoreId: null,
    });
    expect(mockGetManagerReadFilter).toHaveBeenCalledWith(
      "OWNER",
      STAFF_A,
      "revenueStaffId",
      STORE_A,
    );
  });
});
