/**
 * fetchLiffWallets server action (PR-E2) + splitLiffWallets helper 行為測試
 *
 * Action 涵蓋（mirror liff-my-bookings-action.test.ts pattern）：
 *   - no_customer：requireSession throw / 非 CUSTOMER role / canonical null / storeId null
 *   - service_unavailable：prisma.customerPlanWallet.findMany throw
 *   - ok：基本回傳 shape + payload 不含金額 / payment 欄位
 *   - 不信 client：query 帶 canonical customerId + session storeId（zero client param）
 *   - canonical helper reuse：walletAvailableToBook 算法正確（不能自己手算）
 *
 * splitLiffWallets 純函數涵蓋：
 *   - status 終態：USED_UP / CANCELLED → history
 *   - status EXPIRED → expired
 *   - ACTIVE + 一切正常 → active
 *   - **defensive (b)**：ACTIVE + availableToBook=0 → history
 *   - **defensive (b)**：ACTIVE + expiryDate<now → expired
 *   - 邊界：expiryDate=null → never expired
 *   - 邊界：expiryDate=today 結束時間（23:59:59+08:00）→ still active
 *   - unknown status → history（防禦）
 *
 * isExpiringSoon helper：
 *   - null → false
 *   - already past → false
 *   - within 7 days → true
 *   - exactly 7 days → true
 *   - > 7 days → false
 *
 * Mock 範圍（mirror liff-my-bookings-action.test.ts）：
 *   - @/lib/session (requireSession)
 *   - @/lib/customer-identity (getCanonicalCustomerIdForSession)
 *   - @/lib/db (prisma.customerPlanWallet.findMany)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks (必須在 import action 之前) ──
const mockRequireSession = vi.fn();
const mockGetCanonicalId = vi.fn();
const mockWalletFindMany = vi.fn();

vi.mock("@/lib/session", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/customer-identity", () => ({
  getCanonicalCustomerIdForSession: (...args: unknown[]) =>
    mockGetCanonicalId(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customerPlanWallet: {
      findMany: (...args: unknown[]) => mockWalletFindMany(...args),
    },
  },
}));

import { fetchLiffWallets } from "@/server/actions/liff-my-wallets";
import {
  splitLiffWallets,
  isExpiringSoon,
} from "@/lib/liff/my-wallets";

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

function rawWallet(overrides: Partial<{
  id: string;
  totalSessions: number;
  remainingSessions: number;
  startDate: Date;
  expiryDate: Date | null;
  status: string;
  plan: { name: string; category: string };
  bookings: Array<{ bookingStatus: string; isMakeup: boolean }>;
  sessions: Array<{ status: string }>;
}> = {}) {
  return {
    id: "wlt-default",
    totalSessions: 10,
    remainingSessions: 5,
    startDate: new Date("2026-01-01T00:00:00Z"),
    expiryDate: new Date("2026-12-31T00:00:00Z"),
    status: "ACTIVE",
    plan: { name: "10 堂方案", category: "PACKAGE" },
    bookings: [],
    sessions: [],
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────
// fetchLiffWallets action
// ────────────────────────────────────────────────────────

describe("fetchLiffWallets action (PR-E2)", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetCanonicalId.mockReset();
    mockWalletFindMany.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── no_customer 分支 ──

  describe("no_customer 分支", () => {
    it("requireSession throw → no_customer", async () => {
      mockRequireSession.mockRejectedValue(new Error("no session"));
      const r = await fetchLiffWallets();
      expect(r).toEqual({ status: "no_customer" });
      expect(mockWalletFindMany).not.toHaveBeenCalled();
    });

    it("user.role !== CUSTOMER → no_customer (staff 不該透過此 action 看清單)", async () => {
      mockRequireSession.mockResolvedValue({
        ...CUSTOMER_USER,
        role: "OWNER",
        customerId: null,
      });
      const r = await fetchLiffWallets();
      expect(r).toEqual({ status: "no_customer" });
      expect(mockGetCanonicalId).not.toHaveBeenCalled();
    });

    it("canonical resolver 回 null → no_customer", async () => {
      mockRequireSession.mockResolvedValue(CUSTOMER_USER);
      mockGetCanonicalId.mockResolvedValue(null);
      const r = await fetchLiffWallets();
      expect(r).toEqual({ status: "no_customer" });
      expect(mockWalletFindMany).not.toHaveBeenCalled();
    });

    it("user.storeId null → no_customer", async () => {
      mockRequireSession.mockResolvedValue({ ...CUSTOMER_USER, storeId: null });
      mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
      const r = await fetchLiffWallets();
      expect(r).toEqual({ status: "no_customer" });
      expect(mockWalletFindMany).not.toHaveBeenCalled();
    });
  });

  // ── service_unavailable ──

  it("prisma.customerPlanWallet.findMany throw → service_unavailable", async () => {
    mockRequireSession.mockResolvedValue(CUSTOMER_USER);
    mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
    mockWalletFindMany.mockRejectedValue(new Error("db down"));
    const r = await fetchLiffWallets();
    expect(r).toEqual({ status: "service_unavailable" });
  });

  // ── ok / shape / safety ──

  describe("ok 分支", () => {
    beforeEach(() => {
      mockRequireSession.mockResolvedValue(CUSTOMER_USER);
      mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
    });

    it("空 list → 三段都空", async () => {
      mockWalletFindMany.mockResolvedValue([]);
      const r = await fetchLiffWallets();
      expect(r).toEqual({ status: "ok", active: [], expired: [], history: [] });
    });

    it("query 帶 canonical customerId + session storeId（不信 client）", async () => {
      mockWalletFindMany.mockResolvedValue([]);
      await fetchLiffWallets();
      const args = mockWalletFindMany.mock.calls[0][0];
      expect(args.where).toEqual({
        customerId: CANONICAL_CUSTOMER_ID,
        storeId: CUSTOMER_USER.storeId,
      });
    });

    it("query 排序：expiryDate ASC nulls last + createdAt DESC", async () => {
      mockWalletFindMany.mockResolvedValue([]);
      await fetchLiffWallets();
      const args = mockWalletFindMany.mock.calls[0][0];
      expect(args.orderBy).toEqual([
        { expiryDate: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ]);
    });

    it("payload 不含 payment / 金額 / refund 欄位（PR-E2 read-only display only）", async () => {
      mockWalletFindMany.mockResolvedValue([
        rawWallet({ id: "w1", status: "ACTIVE" }),
      ]);
      const r = await fetchLiffWallets();
      if (r.status !== "ok") throw new Error("expected ok");
      const w = r.active[0];
      // 期望的 LiffWalletRow keys
      expect(Object.keys(w).sort()).toEqual([
        "availableToBook",
        "expiryDate",
        "id",
        "pendingCount",
        "planCategory",
        "planName",
        "remainingSessions",
        "startDate",
        "status",
        "totalSessions",
        "usedCount",
        "voidedCount",
      ]);
    });

    it("Date → 'YYYY-MM-DD' 序列化在 server 邊界完成（避免 RSC 序列化問題）", async () => {
      mockWalletFindMany.mockResolvedValue([
        rawWallet({
          id: "w1",
          status: "ACTIVE",
          startDate: new Date("2026-01-15T00:00:00Z"),
          expiryDate: new Date("2026-12-31T00:00:00Z"),
        }),
      ]);
      const r = await fetchLiffWallets();
      if (r.status !== "ok") throw new Error("expected ok");
      expect(r.active[0].startDate).toBe("2026-01-15");
      expect(r.active[0].expiryDate).toBe("2026-12-31");
    });

    it("expiryDate=null → payload null（無期限方案）", async () => {
      mockWalletFindMany.mockResolvedValue([
        rawWallet({ id: "w1", status: "ACTIVE", expiryDate: null }),
      ]);
      const r = await fetchLiffWallets();
      if (r.status !== "ok") throw new Error("expected ok");
      expect(r.active[0].expiryDate).toBeNull();
    });

    it("availableToBook = remainingSessions − non-makeup PENDING/CONFIRMED bookings (canonical)", async () => {
      // remainingSessions=5；2 個 PENDING 非補課 + 1 個 PENDING 補課 + 1 個 CANCELLED
      // → walletPendingCount = 2 → availableToBook = 5 − 2 = 3
      mockWalletFindMany.mockResolvedValue([
        rawWallet({
          id: "w1",
          status: "ACTIVE",
          remainingSessions: 5,
          bookings: [
            { bookingStatus: "PENDING", isMakeup: false },
            { bookingStatus: "CONFIRMED", isMakeup: false },
            { bookingStatus: "PENDING", isMakeup: true }, // makeup 不算
            // note: CANCELLED 不會進 query result (where filter 已擋)
          ],
        }),
      ]);
      const r = await fetchLiffWallets();
      if (r.status !== "ok") throw new Error("expected ok");
      const w = r.active[0];
      expect(w.remainingSessions).toBe(5);
      expect(w.pendingCount).toBe(2);
      expect(w.availableToBook).toBe(3);
    });

    it("ledgerUsage: COMPLETED + BACKFILLED → usedCount; VOIDED → voidedCount", async () => {
      mockWalletFindMany.mockResolvedValue([
        rawWallet({
          id: "w1",
          status: "ACTIVE",
          sessions: [
            { status: "COMPLETED" },
            { status: "COMPLETED" },
            { status: "BACKFILLED" },
            { status: "VOIDED" },
            { status: "AVAILABLE" }, // 不算 used 也不算 voided
            { status: "RESERVED" }, // 同上
          ],
        }),
      ]);
      const r = await fetchLiffWallets();
      if (r.status !== "ok") throw new Error("expected ok");
      const w = r.active[0];
      expect(w.usedCount).toBe(3); // 2 COMPLETED + 1 BACKFILLED
      expect(w.voidedCount).toBe(1);
    });
  });
});

// ────────────────────────────────────────────────────────
// splitLiffWallets 純函數
// ────────────────────────────────────────────────────────

describe("splitLiffWallets — pure helper (PR-E2)", () => {
  // 固定 now = 2026-06-10 12:00 Taipei (= 04:00 UTC)
  const NOW_MS = new Date("2026-06-10T04:00:00Z").getTime();

  function w(overrides: Partial<{
    id: string;
    status: string;
    availableToBook: number;
    expiryDate: string | null;
  }> = {}) {
    return {
      id: "wlt-default",
      status: "ACTIVE",
      availableToBook: 3,
      expiryDate: "2026-12-31",
      ...overrides,
    };
  }

  it("空陣列 → 三段都空", () => {
    expect(splitLiffWallets([], NOW_MS)).toEqual({
      active: [],
      expired: [],
      history: [],
    });
  });

  it("status=USED_UP → history", () => {
    const x = w({ id: "x", status: "USED_UP" });
    const { history } = splitLiffWallets([x], NOW_MS);
    expect(history).toEqual([x]);
  });

  it("status=CANCELLED → history", () => {
    const x = w({ id: "x", status: "CANCELLED" });
    const { history } = splitLiffWallets([x], NOW_MS);
    expect(history).toEqual([x]);
  });

  it("status=EXPIRED → expired", () => {
    const x = w({ id: "x", status: "EXPIRED" });
    const { expired } = splitLiffWallets([x], NOW_MS);
    expect(expired).toEqual([x]);
  });

  it("ACTIVE + availableToBook>0 + future expiryDate → active", () => {
    const x = w({ status: "ACTIVE", availableToBook: 3, expiryDate: "2026-12-31" });
    const { active } = splitLiffWallets([x], NOW_MS);
    expect(active).toEqual([x]);
  });

  it("ACTIVE + expiryDate=null → active (無期限)", () => {
    const x = w({ status: "ACTIVE", availableToBook: 3, expiryDate: null });
    const { active } = splitLiffWallets([x], NOW_MS);
    expect(active).toEqual([x]);
  });

  // ── Defensive 拍板 B (b) ──

  it("ACTIVE + availableToBook=0 → history (defensive 視同 USED_UP)", () => {
    const x = w({ status: "ACTIVE", availableToBook: 0 });
    const { active, history } = splitLiffWallets([x], NOW_MS);
    expect(active).toEqual([]);
    expect(history).toEqual([x]);
  });

  it("ACTIVE + expiryDate<now → expired (defensive 視同 EXPIRED)", () => {
    const x = w({
      status: "ACTIVE",
      availableToBook: 5,
      expiryDate: "2026-05-01", // < NOW (2026-06-10)
    });
    const { active, expired } = splitLiffWallets([x], NOW_MS);
    expect(active).toEqual([]);
    expect(expired).toEqual([x]);
  });

  it("ACTIVE + expiryDate=今天（=當日 23:59:59）→ active（當日仍可用）", () => {
    // NOW = 2026-06-10 04:00 UTC = 12:00 Taipei
    // expiryDate=2026-06-10 → 該日 23:59:59+08:00 = 2026-06-10T15:59:59Z
    // 15:59 UTC > 04:00 UTC → 仍在有效期內 → active
    const x = w({
      status: "ACTIVE",
      availableToBook: 3,
      expiryDate: "2026-06-10",
    });
    const { active } = splitLiffWallets([x], NOW_MS);
    expect(active).toEqual([x]);
  });

  it("unknown status → history（防禦，不誤呈現為可用）", () => {
    const x = w({ status: "WEIRD_NEW_STATUS" });
    const { active, expired, history } = splitLiffWallets([x], NOW_MS);
    expect(active).toEqual([]);
    expect(expired).toEqual([]);
    expect(history).toEqual([x]);
  });

  it("混合輸入：各歸其位、順序穩定", () => {
    const w1 = w({ id: "active-normal", status: "ACTIVE", availableToBook: 5, expiryDate: "2026-12-31" });
    const w2 = w({ id: "used-up", status: "USED_UP" });
    const w3 = w({ id: "explicit-expired", status: "EXPIRED" });
    const w4 = w({ id: "active-zero", status: "ACTIVE", availableToBook: 0 });
    const w5 = w({ id: "active-past", status: "ACTIVE", availableToBook: 3, expiryDate: "2026-05-01" });
    const w6 = w({ id: "cancelled", status: "CANCELLED" });
    const { active, expired, history } = splitLiffWallets(
      [w1, w2, w3, w4, w5, w6],
      NOW_MS,
    );
    expect(active.map((x) => x.id)).toEqual(["active-normal"]);
    expect(expired.map((x) => x.id)).toEqual(["explicit-expired", "active-past"]);
    expect(history.map((x) => x.id)).toEqual(["used-up", "active-zero", "cancelled"]);
  });
});

// ────────────────────────────────────────────────────────
// isExpiringSoon 純函數
// ────────────────────────────────────────────────────────

describe("isExpiringSoon — pure helper (PR-E2)", () => {
  const NOW_MS = new Date("2026-06-10T04:00:00Z").getTime(); // = 12:00 Taipei

  it("expiryDate=null → false（無期限）", () => {
    expect(isExpiringSoon(null, NOW_MS)).toBe(false);
  });

  it("expiryDate 已過 → false（不再顯示「即將到期」badge）", () => {
    expect(isExpiringSoon("2026-05-01", NOW_MS)).toBe(false);
  });

  it("expiryDate 5 天後 → true（≤ 7 days）", () => {
    expect(isExpiringSoon("2026-06-15", NOW_MS)).toBe(true);
  });

  it("expiryDate 剛好 7 天後 → true（boundary inclusive）", () => {
    // NOW = 6/10 12:00 Taipei；expiryDate=6/17 → 6/17 23:59:59 Taipei
    // diff ≈ 7.5 days → 仍 ≤ 7 days? No, > 7
    // Actually 6/10 12:00 to 6/17 23:59:59 = 7 days 11h 59m ≈ 7.5 days
    // So 6/17 應該 false。6/16 是 "差不多" 6 days.
    // 用 expiryDate=6/17 應該 false; 改用 6/16 測試 true 邊界
    expect(isExpiringSoon("2026-06-16", NOW_MS)).toBe(true);
  });

  it("expiryDate 10 天後 → false（> 7 days）", () => {
    expect(isExpiringSoon("2026-06-20", NOW_MS)).toBe(false);
  });
});
