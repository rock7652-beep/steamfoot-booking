/**
 * getTrialFollowUpList — query unit tests
 *
 * 對應 docs：P0-B 前置 audit §1（query 設計）
 *
 * Coverage：
 *   - SUCCESS TRIAL + convertedAt=null → 出現
 *   - convertedAt 已設 → 不出現
 *   - mergedIntoCustomerId 已設 → 不出現
 *   - User SUSPENDED → 不出現
 *   - 已有有效 PACKAGE wallet → 不出現
 *   - VOIDED TRIAL → 不出現
 *   - REFUNDED TRIAL → 不出現
 *   - 同顧客 2 筆 SUCCESS TRIAL → 只回最近 paidAt
 *   - withinDays filter 套用
 *   - assignedStaffId filter 套用
 *   - getStoreFilter 套用
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTxGroupBy = vi.fn();
const mockTxFindMany = vi.fn();
const mockGetStoreFilter = vi.fn();

function throwIfCalled(name: string) {
  return vi.fn(() => {
    throw new Error(`[guard] unexpected ${name}() — query 應該是 read-only`);
  });
}

vi.mock("@/lib/db", () => ({
  prisma: {
    transaction: {
      groupBy: (...a: unknown[]) => mockTxGroupBy(...a),
      findMany: (...a: unknown[]) => mockTxFindMany(...a),
      create: throwIfCalled("transaction.create"),
      update: throwIfCalled("transaction.update"),
      delete: throwIfCalled("transaction.delete"),
    },
    customer: {
      update: throwIfCalled("customer.update"),
      create: throwIfCalled("customer.create"),
    },
    booking: {
      update: throwIfCalled("booking.update"),
    },
  },
}));

vi.mock("@/lib/manager-visibility", () => ({
  getStoreFilter: (...a: unknown[]) => mockGetStoreFilter(...a),
}));

import { getTrialFollowUpList } from "@/server/queries/trial-follow-up";

const STORE_A = "store-zhubei";
const STORE_B = "store-other";
const STAFF_A = "staff-aaa";

const NOW = new Date("2026-05-27T10:00:00+08:00").getTime();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mockGetStoreFilter.mockReturnValue({ storeId: STORE_A });
});

function fakeOwner() {
  return { role: "OWNER", storeId: STORE_A, staffId: null };
}

function makeGroup(customerId: string, paidAt: Date | null, createdAt?: Date) {
  return {
    customerId,
    _max: {
      paidAt,
      createdAt: createdAt ?? paidAt ?? new Date(NOW),
    },
  };
}

function makeRow(opts: {
  customerId: string;
  customerName?: string;
  phone?: string | null;
  customerStage?: string;
  paidAt: Date | null;
  createdAt?: Date;
  amount?: number;
  paymentMethod?: string;
  bookingDate?: Date | null;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
}) {
  return {
    id: "tx-" + opts.customerId,
    amount: opts.amount ?? 499,
    paymentMethod: opts.paymentMethod ?? "CASH",
    paidAt: opts.paidAt,
    createdAt: opts.createdAt ?? opts.paidAt ?? new Date(NOW),
    booking: opts.bookingDate ? { bookingDate: opts.bookingDate } : null,
    customer: {
      id: opts.customerId,
      name: opts.customerName ?? "Test",
      phone: opts.phone ?? "0912345678",
      customerStage: opts.customerStage ?? "LEAD",
      assignedStaffId: opts.assignedStaffId ?? null,
      assignedStaff: opts.assignedStaffName
        ? {
            id: opts.assignedStaffId ?? "staff-x",
            displayName: opts.assignedStaffName,
            colorCode: "#000",
          }
        : null,
    },
  };
}

describe("getTrialFollowUpList", () => {
  it("returns empty when no SUCCESS TRIAL_PURCHASE matches", async () => {
    mockTxGroupBy.mockResolvedValueOnce([]);
    const result = await getTrialFollowUpList(fakeOwner(), null);
    expect(result).toEqual([]);
    expect(mockTxFindMany).not.toHaveBeenCalled();
  });

  it("returns 1 customer when there is 1 SUCCESS TRIAL + convertedAt=null", async () => {
    const paid = new Date("2026-05-26T14:00:00+08:00");
    mockTxGroupBy.mockResolvedValueOnce([makeGroup("c-1", paid)]);
    mockTxFindMany.mockResolvedValueOnce([
      makeRow({ customerId: "c-1", customerName: "顧客一", paidAt: paid }),
    ]);

    const result = await getTrialFollowUpList(fakeOwner(), null);
    expect(result).toHaveLength(1);
    expect(result[0].customerId).toBe("c-1");
    expect(result[0].customerName).toBe("顧客一");
    expect(result[0].trialAmount).toBe(499);
    expect(result[0].trialPaymentMethod).toBe("CASH");
  });

  it("passes correct where conditions to groupBy (excludes converted / merged / suspended / valid PACKAGE)", async () => {
    mockTxGroupBy.mockResolvedValueOnce([]);
    await getTrialFollowUpList(fakeOwner(), null);

    expect(mockTxGroupBy).toHaveBeenCalledTimes(1);
    const args = mockTxGroupBy.mock.calls[0][0];
    expect(args.where.transactionType).toBe("TRIAL_PURCHASE");
    expect(args.where.status).toBe("SUCCESS");
    expect(args.where.storeId).toBe(STORE_A); // store isolation from mocked getStoreFilter
    expect(args.where.customer.convertedAt).toBe(null);
    expect(args.where.customer.mergedIntoCustomerId).toBe(null);
    // user SUSPENDED 排除 — relation filter exists
    expect(args.where.customer.NOT).toBeDefined();
    // 已有有效正式方案的顧客不可出現在「待追蹤體驗客」
    expect(args.where.customer.planWallets.none).toMatchObject({
      status: "ACTIVE",
      remainingSessions: { gt: 0 },
      plan: { category: "PACKAGE" },
    });
    expect(args.where.customer.planWallets.none.OR[0]).toEqual({ expiryDate: null });
    expect(args.where.customer.planWallets.none.OR[1].expiryDate.gte).toBeInstanceOf(Date);
  });

  it("excludes customers with SUCCESS TRIAL_PURCHASE and convertedAt=null when they already have an active PACKAGE wallet", async () => {
    mockTxGroupBy.mockResolvedValueOnce([]);
    await getTrialFollowUpList(fakeOwner(), null);

    const args = mockTxGroupBy.mock.calls[0][0];
    expect(args.where.transactionType).toBe("TRIAL_PURCHASE");
    expect(args.where.status).toBe("SUCCESS");
    expect(args.where.customer.convertedAt).toBe(null);
    expect(args.where.customer.planWallets.none).toMatchObject({
      status: "ACTIVE",
      remainingSessions: { gt: 0 },
      plan: { category: "PACKAGE" },
    });
  });

  it("dedupes when same customer has >1 SUCCESS TRIAL (only latest paidAt)", async () => {
    const latest = new Date("2026-05-26T14:00:00+08:00");
    // groupBy 已經做 dedup → 只回一筆 _max paidAt
    mockTxGroupBy.mockResolvedValueOnce([makeGroup("c-1", latest)]);
    // findMany 可能因為 OR 條件還是回多筆同 customerId（防禦性測試）
    mockTxFindMany.mockResolvedValueOnce([
      makeRow({ customerId: "c-1", paidAt: latest }),
      makeRow({ customerId: "c-1", paidAt: latest }), // 重複 — 第二次應被丟掉
    ]);

    const result = await getTrialFollowUpList(fakeOwner(), null);
    expect(result).toHaveLength(1);
    expect(result[0].customerId).toBe("c-1");
  });

  it("applies withinDays cutoff to groupBy where clause", async () => {
    mockTxGroupBy.mockResolvedValueOnce([]);
    await getTrialFollowUpList(fakeOwner(), null, { withinDays: 7 });
    const args = mockTxGroupBy.mock.calls[0][0];
    expect(args.where.paidAt).toBeDefined();
    expect(args.where.paidAt.gte).toBeInstanceOf(Date);
    const cutoff = (args.where.paidAt.gte as Date).getTime();
    const expected = NOW - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff - expected)).toBeLessThan(1000); // within 1 sec
  });

  it("applies assignedStaffId filter to customer relation when given", async () => {
    mockTxGroupBy.mockResolvedValueOnce([]);
    await getTrialFollowUpList(fakeOwner(), null, { assignedStaffId: STAFF_A });
    const args = mockTxGroupBy.mock.calls[0][0];
    expect(args.where.customer.assignedStaffId).toBe(STAFF_A);
  });

  it("respects getStoreFilter — does not leak to wrong store", async () => {
    // simulate STAFF in a different store
    mockGetStoreFilter.mockReturnValueOnce({ storeId: STORE_B });
    mockTxGroupBy.mockResolvedValueOnce([]);
    await getTrialFollowUpList(
      { role: "STAFF", storeId: STORE_B, staffId: STAFF_A },
      null,
    );
    const args = mockTxGroupBy.mock.calls[0][0];
    expect(args.where.storeId).toBe(STORE_B);
  });

  it("sorts by paidAt desc then createdAt desc", async () => {
    mockTxGroupBy.mockResolvedValueOnce([
      makeGroup("c-1", new Date("2026-05-26T10:00:00+08:00")),
      makeGroup("c-2", new Date("2026-05-25T10:00:00+08:00")),
    ]);
    mockTxFindMany.mockResolvedValueOnce([]);

    await getTrialFollowUpList(fakeOwner(), null);

    const args = mockTxFindMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([
      { paidAt: "desc" },
      { createdAt: "desc" },
    ]);
    expect(args.take).toBe(200);
  });

  it("uses status=SUCCESS in findMany so VOIDED/REFUNDED auto-excluded", async () => {
    mockTxGroupBy.mockResolvedValueOnce([
      makeGroup("c-1", new Date("2026-05-26T10:00:00+08:00")),
    ]);
    mockTxFindMany.mockResolvedValueOnce([]);

    await getTrialFollowUpList(fakeOwner(), null);

    const args = mockTxFindMany.mock.calls[0][0];
    expect(args.where.transactionType).toBe("TRIAL_PURCHASE");
    expect(args.where.status).toBe("SUCCESS");
    expect(args.where.customer.planWallets.none.plan).toEqual({ category: "PACKAGE" });
  });

  it("handles paidAt=null group by falling back to createdAt", async () => {
    const created = new Date("2026-05-26T10:00:00+08:00");
    mockTxGroupBy.mockResolvedValueOnce([makeGroup("c-1", null, created)]);
    mockTxFindMany.mockResolvedValueOnce([
      makeRow({
        customerId: "c-1",
        paidAt: null,
        createdAt: created,
      }),
    ]);

    const result = await getTrialFollowUpList(fakeOwner(), null);
    expect(result).toHaveLength(1);
    expect(result[0].trialPaidAt).toBeNull();
    expect(result[0].trialCreatedAt.getTime()).toBe(created.getTime());
  });
});
