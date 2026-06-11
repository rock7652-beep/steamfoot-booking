/**
 * getCustomerCareOverview — read model unit tests (PR-2A)
 *
 * Coverage：
 *   - trialFollowUps 直接 passthrough 自 getTrialFollowUpList
 *   - findMany where：有效 PACKAGE 過濾 + 排除 merged / suspended + store isolation
 *   - booking.groupBy where：bookingStatus = COMPLETED（排除 NO_SHOW / CANCELLED）
 *   - 堂數偏低：sum <= LOW_SESSIONS_THRESHOLD 命中、> 門檻不命中
 *   - 好久不見：> 30 天命中、<= 30 天不命中、無 COMPLETED 紀錄不命中
 *   - 方案快到期：<= 14 天命中、> 14 天不命中、當天到期(0 天)仍命中、null 到期日不列入
 *   - 多 wallet：剩餘堂數加總、取最快到期 wallet
 *   - 同顧客同時命中多區（不跨區去重，各區都回 customerId）
 *   - 純讀：寫入方法被呼叫即 throw（guard）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCustomerFindMany = vi.fn();
const mockBookingGroupBy = vi.fn();
const mockGetStoreFilter = vi.fn();
const mockGetTrialFollowUpList = vi.fn();

function throwIfCalled(name: string) {
  return vi.fn(() => {
    throw new Error(`[guard] unexpected ${name}() — query 應該是 read-only`);
  });
}

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findMany: (...a: unknown[]) => mockCustomerFindMany(...a),
      update: throwIfCalled("customer.update"),
      create: throwIfCalled("customer.create"),
    },
    booking: {
      groupBy: (...a: unknown[]) => mockBookingGroupBy(...a),
      update: throwIfCalled("booking.update"),
      create: throwIfCalled("booking.create"),
    },
    customerPlanWallet: {
      update: throwIfCalled("customerPlanWallet.update"),
    },
  },
}));

vi.mock("@/lib/manager-visibility", () => ({
  getStoreFilter: (...a: unknown[]) => mockGetStoreFilter(...a),
}));

vi.mock("@/server/queries/trial-follow-up", () => ({
  getTrialFollowUpList: (...a: unknown[]) => mockGetTrialFollowUpList(...a),
}));

import {
  getCustomerCareOverview,
  getCustomerCareSummary,
  INACTIVE_AFTER_DAYS,
  EXPIRING_WITHIN_DAYS,
} from "@/server/queries/customer-care";
import { LOW_SESSIONS_THRESHOLD } from "@/lib/remaining-sessions-label";

const STORE_A = "store-zhubei";
const STORE_B = "store-other";

// 固定「今天」= 2026-06-11（Asia/Taipei）
const NOW = new Date("2026-06-11T10:00:00+08:00").getTime();
const TODAY_STR = "2026-06-11";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mockGetStoreFilter.mockReturnValue({ storeId: STORE_A });
  mockGetTrialFollowUpList.mockResolvedValue([]);
  mockBookingGroupBy.mockResolvedValue([]);
});

function fakeOwner() {
  return { role: "OWNER", storeId: STORE_A, staffId: null };
}

/** @db.Date helper：給定 YYYY-MM-DD 回 UTC 午夜 Date */
function dbDate(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00.000Z`);
}

type Wallet = { remainingSessions: number; expiryDate: Date | null };

function makeCustomer(opts: {
  id: string;
  name?: string;
  phone?: string | null;
  assignedStaffName?: string | null;
  wallets: Wallet[];
}) {
  return {
    id: opts.id,
    name: opts.name ?? "顧客",
    phone: opts.phone ?? "0912345678",
    assignedStaffId: opts.assignedStaffName ? "staff-x" : null,
    assignedStaff: opts.assignedStaffName
      ? { id: "staff-x", displayName: opts.assignedStaffName, colorCode: "#000" }
      : null,
    planWallets: opts.wallets,
  };
}

/** booking.groupBy 回傳格式 */
function lastVisit(customerId: string, bookingDate: Date | null) {
  return { customerId, _max: { bookingDate } };
}

describe("getCustomerCareOverview", () => {
  it("passes trialFollowUps through from getTrialFollowUpList and counts them", async () => {
    mockGetTrialFollowUpList.mockResolvedValueOnce([
      { customerId: "t-1" },
      { customerId: "t-2" },
    ]);
    mockCustomerFindMany.mockResolvedValueOnce([]);

    const res = await getCustomerCareOverview(fakeOwner(), null);
    expect(res.trialFollowUps).toHaveLength(2);
    expect(res.summary.trialFollowUps).toBe(2);
    // 無母體 → 其餘三區皆空，且不查 booking
    expect(res.inactiveCustomers).toEqual([]);
    expect(res.lowSessionCustomers).toEqual([]);
    expect(res.expiringPlanCustomers).toEqual([]);
    expect(mockBookingGroupBy).not.toHaveBeenCalled();
  });

  it("findMany where filters valid PACKAGE + excludes merged/suspended + store isolation", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([]);
    await getCustomerCareOverview(fakeOwner(), null);

    const args = mockCustomerFindMany.mock.calls[0][0];
    expect(args.where.storeId).toBe(STORE_A);
    expect(args.where.mergedIntoCustomerId).toBe(null);
    expect(args.where.NOT).toEqual({ user: { is: { status: "SUSPENDED" } } });
    const wallet = args.where.planWallets.some;
    expect(wallet.status).toBe("ACTIVE");
    expect(wallet.remainingSessions).toEqual({ gt: 0 });
    expect(wallet.plan).toEqual({ category: "PACKAGE" });
    // 當天到期仍有效：OR 含 expiryDate gte 今日 00:00
    expect(wallet.OR[0]).toEqual({ expiryDate: null });
    expect(wallet.OR[1].expiryDate.gte).toBeInstanceOf(Date);
  });

  it("booking.groupBy only counts COMPLETED bookings (excludes NO_SHOW/CANCELLED)", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      makeCustomer({ id: "c-1", wallets: [{ remainingSessions: 5, expiryDate: null }] }),
    ]);
    await getCustomerCareOverview(fakeOwner(), null);

    expect(mockBookingGroupBy).toHaveBeenCalledTimes(1);
    const args = mockBookingGroupBy.mock.calls[0][0];
    expect(args.where.bookingStatus).toBe("COMPLETED");
    expect(args.where.customerId).toEqual({ in: ["c-1"] });
  });

  it("respects getStoreFilter — does not leak to wrong store", async () => {
    mockGetStoreFilter.mockReturnValueOnce({ storeId: STORE_B });
    mockCustomerFindMany.mockResolvedValueOnce([]);
    await getCustomerCareOverview(
      { role: "STAFF", storeId: STORE_B, staffId: "staff-a" },
      null,
    );
    const args = mockCustomerFindMany.mock.calls[0][0];
    expect(args.where.storeId).toBe(STORE_B);
  });

  // ---- (3) 堂數偏低 ----
  it("flags low sessions when aggregate <= LOW_SESSIONS_THRESHOLD, not above", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      makeCustomer({ id: "low", wallets: [{ remainingSessions: LOW_SESSIONS_THRESHOLD, expiryDate: null }] }),
      makeCustomer({ id: "high", wallets: [{ remainingSessions: LOW_SESSIONS_THRESHOLD + 1, expiryDate: null }] }),
    ]);
    const res = await getCustomerCareOverview(fakeOwner(), null);
    const ids = res.lowSessionCustomers.map((r) => r.customerId);
    expect(ids).toContain("low");
    expect(ids).not.toContain("high");
    expect(res.lowSessionCustomers.find((r) => r.customerId === "low")?.validPackageSessions).toBe(
      LOW_SESSIONS_THRESHOLD,
    );
  });

  it("aggregates remaining sessions across multiple wallets for low-session check", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      // 1 + 1 = 2 → 偏低
      makeCustomer({ id: "multi", wallets: [
        { remainingSessions: 1, expiryDate: null },
        { remainingSessions: 1, expiryDate: null },
      ] }),
    ]);
    const res = await getCustomerCareOverview(fakeOwner(), null);
    expect(res.lowSessionCustomers).toHaveLength(1);
    expect(res.lowSessionCustomers[0].validPackageSessions).toBe(2);
  });

  // ---- (2) 好久不見 ----
  it("flags inactive when last COMPLETED visit > 30 days ago, not when recent", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      makeCustomer({ id: "stale", wallets: [{ remainingSessions: 5, expiryDate: null }] }),
      makeCustomer({ id: "recent", wallets: [{ remainingSessions: 5, expiryDate: null }] }),
    ]);
    mockBookingGroupBy.mockResolvedValueOnce([
      lastVisit("stale", dbDate("2026-05-02")), // 40 天前
      lastVisit("recent", dbDate("2026-06-01")), // 10 天前
    ]);
    const res = await getCustomerCareOverview(fakeOwner(), null);
    const ids = res.inactiveCustomers.map((r) => r.customerId);
    expect(ids).toContain("stale");
    expect(ids).not.toContain("recent");
    const stale = res.inactiveCustomers.find((r) => r.customerId === "stale")!;
    expect(stale.daysSinceLastVisit).toBe(40);
    expect(stale.daysSinceLastVisit).toBeGreaterThan(INACTIVE_AFTER_DAYS);
    expect(stale.lastVisitAt.getTime()).toBe(dbDate("2026-05-02").getTime());
  });

  it("does NOT flag inactive when customer has no COMPLETED booking", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      makeCustomer({ id: "novisit", wallets: [{ remainingSessions: 5, expiryDate: null }] }),
    ]);
    mockBookingGroupBy.mockResolvedValueOnce([]); // 無 COMPLETED
    const res = await getCustomerCareOverview(fakeOwner(), null);
    expect(res.inactiveCustomers).toEqual([]);
  });

  it("treats exactly 30 days as NOT yet inactive (boundary is > 30)", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      makeCustomer({ id: "edge", wallets: [{ remainingSessions: 5, expiryDate: null }] }),
    ]);
    mockBookingGroupBy.mockResolvedValueOnce([
      lastVisit("edge", dbDate("2026-05-12")), // 恰好 30 天前
    ]);
    const res = await getCustomerCareOverview(fakeOwner(), null);
    expect(res.inactiveCustomers).toEqual([]);
  });

  // ---- (4) 方案快到期 ----
  it("flags expiring within 14 days, not beyond", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      makeCustomer({ id: "soon", wallets: [{ remainingSessions: 5, expiryDate: dbDate("2026-06-16") }] }), // 5 天
      makeCustomer({ id: "far", wallets: [{ remainingSessions: 5, expiryDate: dbDate("2026-07-01") }] }), // 20 天
    ]);
    const res = await getCustomerCareOverview(fakeOwner(), null);
    const ids = res.expiringPlanCustomers.map((r) => r.customerId);
    expect(ids).toContain("soon");
    expect(ids).not.toContain("far");
    const soon = res.expiringPlanCustomers.find((r) => r.customerId === "soon")!;
    expect(soon.daysUntilExpiry).toBe(5);
    expect(soon.daysUntilExpiry).toBeLessThanOrEqual(EXPIRING_WITHIN_DAYS);
    expect(soon.remainingSessions).toBe(5);
  });

  it("treats same-day expiry as still valid (daysUntilExpiry = 0)", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      makeCustomer({ id: "today", wallets: [{ remainingSessions: 2, expiryDate: dbDate(TODAY_STR) }] }),
    ]);
    const res = await getCustomerCareOverview(fakeOwner(), null);
    expect(res.expiringPlanCustomers).toHaveLength(1);
    expect(res.expiringPlanCustomers[0].daysUntilExpiry).toBe(0);
  });

  it("does NOT flag expiring when wallet has null expiryDate (never expires)", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      makeCustomer({ id: "noexp", wallets: [{ remainingSessions: 5, expiryDate: null }] }),
    ]);
    const res = await getCustomerCareOverview(fakeOwner(), null);
    expect(res.expiringPlanCustomers).toEqual([]);
  });

  it("picks the soonest-expiring wallet among multiple valid wallets", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      makeCustomer({ id: "multi", wallets: [
        { remainingSessions: 8, expiryDate: dbDate("2026-06-20") },
        { remainingSessions: 3, expiryDate: dbDate("2026-06-13") }, // 最快到期
      ] }),
    ]);
    const res = await getCustomerCareOverview(fakeOwner(), null);
    expect(res.expiringPlanCustomers).toHaveLength(1);
    const row = res.expiringPlanCustomers[0];
    expect(row.expiryDate.getTime()).toBe(dbDate("2026-06-13").getTime());
    expect(row.daysUntilExpiry).toBe(2);
    expect(row.remainingSessions).toBe(3); // 該最快到期 wallet 的剩餘
    expect(row.validPackageSessions).toBe(11); // 加總
  });

  // ---- 跨區去重：刻意不去重 ----
  it("keeps a customer in multiple regions without cross-region dedup", async () => {
    // 剩 2 堂（偏低）且 3 天後到期（快到期）→ 兩區都該出現
    mockCustomerFindMany.mockResolvedValueOnce([
      makeCustomer({ id: "both", wallets: [{ remainingSessions: 2, expiryDate: dbDate("2026-06-14") }] }),
    ]);
    const res = await getCustomerCareOverview(fakeOwner(), null);
    expect(res.lowSessionCustomers.map((r) => r.customerId)).toContain("both");
    expect(res.expiringPlanCustomers.map((r) => r.customerId)).toContain("both");
    expect(res.summary.lowSessionCustomers).toBe(1);
    expect(res.summary.expiringPlanCustomers).toBe(1);
  });

  it("exposes assigned staff name/color and full phone for UI", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      makeCustomer({ id: "c-1", name: "王小明", phone: "0911222333", assignedStaffName: "店長A", wallets: [{ remainingSessions: 1, expiryDate: null }] }),
    ]);
    const res = await getCustomerCareOverview(fakeOwner(), null);
    const row = res.lowSessionCustomers[0];
    expect(row.customerName).toBe("王小明");
    expect(row.phone).toBe("0911222333");
    expect(row.assignedStaffName).toBe("店長A");
    expect(row.assignedStaffColor).toBe("#000");
  });
});

describe("getCustomerCareSummary", () => {
  it("returns all-zero summary when no trials and no valid-package母體", async () => {
    mockGetTrialFollowUpList.mockResolvedValueOnce([]);
    mockCustomerFindMany.mockResolvedValueOnce([]);
    const res = await getCustomerCareSummary(fakeOwner(), null);
    expect(res).toEqual({
      trialFollowUps: 0,
      inactiveCustomers: 0,
      lowSessionCustomers: 0,
      expiringPlanCustomers: 0,
      totalReminders: 0,
    });
    // 無母體 → 不查 booking
    expect(mockBookingGroupBy).not.toHaveBeenCalled();
  });

  it("counts trialFollowUps as length of getTrialFollowUpList", async () => {
    mockGetTrialFollowUpList.mockResolvedValueOnce([{ customerId: "t-1" }, { customerId: "t-2" }, { customerId: "t-3" }]);
    mockCustomerFindMany.mockResolvedValueOnce([]);
    const res = await getCustomerCareSummary(fakeOwner(), null);
    expect(res.trialFollowUps).toBe(3);
    expect(res.totalReminders).toBe(3);
  });

  it("only selects minimal fields (no name/phone/staff joins) for lightness", async () => {
    mockGetTrialFollowUpList.mockResolvedValueOnce([]);
    mockCustomerFindMany.mockResolvedValueOnce([]);
    await getCustomerCareSummary(fakeOwner(), null);
    const args = mockCustomerFindMany.mock.calls[0][0];
    expect(args.select).toEqual({
      id: true,
      planWallets: {
        where: expect.anything(),
        select: { remainingSessions: true, expiryDate: true },
      },
    });
    // 確認沒有 include 名單顯示欄位
    expect(args.select.name).toBeUndefined();
    expect(args.select.assignedStaff).toBeUndefined();
  });

  it("counts the three wallet-based reminders consistently with overview rules", async () => {
    mockGetTrialFollowUpList.mockResolvedValueOnce([{ customerId: "t-1" }]); // 1 體驗
    mockCustomerFindMany.mockResolvedValueOnce([
      // 偏低（2 堂）且 3 天後到期 → 同時計入 low + expiring
      makeCustomer({ id: "both", wallets: [{ remainingSessions: 2, expiryDate: dbDate("2026-06-14") }] }),
      // 堂數足夠、null 到期日 → 三區都不計（但會用於 inactive 判斷）
      makeCustomer({ id: "stale", wallets: [{ remainingSessions: 8, expiryDate: null }] }),
    ]);
    mockBookingGroupBy.mockResolvedValueOnce([
      lastVisit("both", dbDate("2026-06-10")), // 1 天前 — 不算 inactive
      lastVisit("stale", dbDate("2026-05-02")), // 40 天前 — inactive
    ]);
    const res = await getCustomerCareSummary(fakeOwner(), null);
    expect(res.lowSessionCustomers).toBe(1); // both
    expect(res.expiringPlanCustomers).toBe(1); // both
    expect(res.inactiveCustomers).toBe(1); // stale
    expect(res.trialFollowUps).toBe(1);
    expect(res.totalReminders).toBe(4); // 1+1+1+1
  });

  it("same-day expiry counts; 30-day boundary does NOT count inactive", async () => {
    mockGetTrialFollowUpList.mockResolvedValueOnce([]);
    mockCustomerFindMany.mockResolvedValueOnce([
      makeCustomer({ id: "exp-today", wallets: [{ remainingSessions: 5, expiryDate: dbDate(TODAY_STR) }] }),
      makeCustomer({ id: "edge30", wallets: [{ remainingSessions: 5, expiryDate: null }] }),
    ]);
    mockBookingGroupBy.mockResolvedValueOnce([
      lastVisit("edge30", dbDate("2026-05-12")), // 恰好 30 天
    ]);
    const res = await getCustomerCareSummary(fakeOwner(), null);
    expect(res.expiringPlanCustomers).toBe(1); // 當天到期算
    expect(res.inactiveCustomers).toBe(0); // 30 天不算（門檻 > 30）
  });

  it("respects store isolation via getStoreFilter", async () => {
    mockGetStoreFilter.mockReturnValueOnce({ storeId: STORE_B });
    mockGetTrialFollowUpList.mockResolvedValueOnce([]);
    mockCustomerFindMany.mockResolvedValueOnce([]);
    await getCustomerCareSummary({ role: "STAFF", storeId: STORE_B, staffId: "s" }, null);
    const args = mockCustomerFindMany.mock.calls[0][0];
    expect(args.where.storeId).toBe(STORE_B);
  });
});
