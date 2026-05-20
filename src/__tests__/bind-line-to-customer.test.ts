/**
 * bindLineToCustomerInStore() 行為測試 (PR-C1)
 *
 * 涵蓋：
 *   - 7 條 status 分支
 *   - validation 路徑（missing input / invalid phone）
 *   - 風險 R1 (phone hijack) / R2 (duplicate) / R5 (LINE already bound)
 *   - side-effect 合約：syncLineAccount / repair / referrer-award 呼叫時機
 *
 * Mock 範圍：
 *   - @/lib/db prisma (customer / user / $transaction)
 *   - @/server/services/line-account-sync
 *   - @/lib/identity-repair
 *   - @/server/services/referral-points
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── prisma mocks ──────────────────────────────────────
const mockCustomerFindMany = vi.fn();
const mockCustomerUpdate = vi.fn();
const mockCustomerCreate = vi.fn();
const mockUserCreate = vi.fn();
const mockTx = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findMany: (...args: unknown[]) => mockCustomerFindMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTx(...args),
  },
}));

// ── side-effect helper mocks ─────────────────────────
const mockSyncLineAccount = vi.fn();
const mockRepair = vi.fn();
const mockAwardReferrer = vi.fn();

vi.mock("@/server/services/line-account-sync", () => ({
  syncLineAccountForUser: (...args: unknown[]) => mockSyncLineAccount(...args),
}));

vi.mock("@/lib/identity-repair", () => ({
  repairCustomerIdentityOnLogin: (...args: unknown[]) => mockRepair(...args),
}));

vi.mock("@/server/services/referral-points", () => ({
  awardLineJoinReferrerIfEligible: (...args: unknown[]) =>
    mockAwardReferrer(...args),
}));

import { bindLineToCustomerInStore } from "@/server/services/bind-line-to-customer";

// ── 共用 fixture ──────────────────────────────────────
const STORE_ID = "store-zhubei";
const LINE_USER_ID = "U_line_abc";
const LINE_NAME = "LINE 暱稱";
const PHONE = "0912345678";
const NAME = "王小明";

function makeValidInput(overrides: Partial<Parameters<typeof bindLineToCustomerInStore>[0]> = {}) {
  return {
    storeId: STORE_ID,
    lineUserId: LINE_USER_ID,
    lineName: LINE_NAME,
    phone: PHONE,
    name: NAME,
    ...overrides,
  };
}

// 預設 transaction 的回呼 fixture：把 tx client 提供 user.create + customer.create + customer.update mocks
function setupTransactionForCreate(newUserId: string, newCustomerId: string) {
  mockTx.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      user: { create: mockUserCreate.mockResolvedValueOnce({ id: newUserId }) },
      customer: {
        create: mockCustomerCreate.mockResolvedValueOnce({ id: newCustomerId }),
        update: mockCustomerUpdate.mockResolvedValueOnce({ id: newCustomerId }),
      },
    };
    return cb(tx);
  });
}

describe("bindLineToCustomerInStore", () => {
  beforeEach(() => {
    mockCustomerFindMany.mockReset();
    mockCustomerUpdate.mockReset();
    mockCustomerCreate.mockReset();
    mockUserCreate.mockReset();
    mockTx.mockReset();
    mockSyncLineAccount.mockReset();
    mockRepair.mockReset();
    mockAwardReferrer.mockReset();

    // sane defaults
    mockSyncLineAccount.mockResolvedValue({ status: "created" });
    mockRepair.mockResolvedValue({ customerId: null, action: "skip-no-match" });
    mockAwardReferrer.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────
  // 1. Validation errors
  // ─────────────────────────────────────────────────────

  describe("validation", () => {
    it("rejects missing storeId", async () => {
      const r = await bindLineToCustomerInStore(makeValidInput({ storeId: "" }));
      expect(r).toEqual({ status: "validation_error", reason: "missing_input" });
      expect(mockCustomerFindMany).not.toHaveBeenCalled();
    });

    it("rejects missing lineUserId", async () => {
      const r = await bindLineToCustomerInStore(makeValidInput({ lineUserId: "" }));
      expect(r).toEqual({ status: "validation_error", reason: "missing_input" });
    });

    it("rejects missing name", async () => {
      const r = await bindLineToCustomerInStore(makeValidInput({ name: "" }));
      expect(r).toEqual({ status: "validation_error", reason: "missing_input" });
    });

    it("rejects invalid phone (too short)", async () => {
      const r = await bindLineToCustomerInStore(makeValidInput({ phone: "0912" }));
      expect(r).toEqual({ status: "validation_error", reason: "invalid_phone" });
    });

    it("rejects invalid phone (non-09 prefix)", async () => {
      const r = await bindLineToCustomerInStore(makeValidInput({ phone: "1234567890" }));
      expect(r).toEqual({ status: "validation_error", reason: "invalid_phone" });
    });

    it("normalizes +886 prefix and accepts", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([]);
      setupTransactionForCreate("user-new", "cust-new");
      const r = await bindLineToCustomerInStore(
        makeValidInput({ phone: "+886912345678" })
      );
      expect(r.status).toBe("created_new");
      // 確認被 normalize 成 09xxxxxxxx 用於查詢
      const findManyCall = mockCustomerFindMany.mock.calls[0][0];
      expect(findManyCall.where.phone).toBe("0912345678");
    });

    it("normalizes 0912-345-678 with dashes", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([]);
      setupTransactionForCreate("user-new", "cust-new");
      const r = await bindLineToCustomerInStore(
        makeValidInput({ phone: "0912-345-678" })
      );
      expect(r.status).toBe("created_new");
    });
  });

  // ─────────────────────────────────────────────────────
  // 2. ambiguous_multiple_candidates (R2: dirty data)
  // ─────────────────────────────────────────────────────

  it("rejects when same phone matches 2+ candidates (ambiguous)", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      { id: "cust-1", userId: null, lineUserId: null, lineLinkStatus: "UNLINKED", lineName: null },
      { id: "cust-2", userId: null, lineUserId: null, lineLinkStatus: "UNLINKED", lineName: null },
    ]);
    const r = await bindLineToCustomerInStore(makeValidInput());
    expect(r.status).toBe("ambiguous_multiple_candidates");
    if (r.status === "ambiguous_multiple_candidates") {
      expect(r.candidateIds).toEqual(["cust-1", "cust-2"]);
    }
    expect(mockTx).not.toHaveBeenCalled();
    expect(mockSyncLineAccount).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────
  // 3. created_new (候選 = 0)
  // ─────────────────────────────────────────────────────

  describe("created_new (no candidates)", () => {
    it("creates User + Customer + Account in transaction, returns created_new", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([]);
      setupTransactionForCreate("user-new-1", "cust-new-1");

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r).toMatchObject({
        status: "created_new",
        customerId: "cust-new-1",
        userId: "user-new-1",
        lineAccountSync: "created",
      });
      expect(mockTx).toHaveBeenCalledTimes(1);
      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: NAME,
            phone: PHONE,
            role: "CUSTOMER",
            status: "ACTIVE",
          }),
        })
      );
      expect(mockCustomerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: NAME,
            phone: PHONE,
            storeId: STORE_ID,
            userId: "user-new-1",
            authSource: "LINE",
            lineUserId: LINE_USER_ID,
            lineLinkStatus: "LINKED",
          }),
        })
      );
    });

    it("calls syncLineAccountForUser after transaction", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([]);
      setupTransactionForCreate("user-new", "cust-new");
      await bindLineToCustomerInStore(makeValidInput());
      expect(mockSyncLineAccount).toHaveBeenCalledWith({
        userId: "user-new",
        lineUserId: LINE_USER_ID,
      });
    });

    it("calls identity-repair + referrer award best-effort", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([]);
      setupTransactionForCreate("user-new", "cust-new");
      await bindLineToCustomerInStore(makeValidInput());
      expect(mockRepair).toHaveBeenCalledWith({
        userId: "user-new",
        storeId: STORE_ID,
        phone: PHONE,
        lineUserId: LINE_USER_ID,
      });
      expect(mockAwardReferrer).toHaveBeenCalledWith({
        customerId: "cust-new",
        storeId: STORE_ID,
      });
    });

    it("still returns created_new even if repair throws", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([]);
      setupTransactionForCreate("user-new", "cust-new");
      mockRepair.mockRejectedValueOnce(new Error("repair failed"));
      const r = await bindLineToCustomerInStore(makeValidInput());
      expect(r.status).toBe("created_new");
    });

    it("still returns created_new even if referrer award throws", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([]);
      setupTransactionForCreate("user-new", "cust-new");
      mockAwardReferrer.mockRejectedValueOnce(new Error("award failed"));
      const r = await bindLineToCustomerInStore(makeValidInput());
      expect(r.status).toBe("created_new");
    });

    it("uses lineName fallback to name when LINE displayName not provided", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([]);
      setupTransactionForCreate("user-new", "cust-new");
      await bindLineToCustomerInStore(makeValidInput({ lineName: null }));
      expect(mockCustomerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lineName: NAME }),
        })
      );
    });

    it("reflects syncLineAccount error state in result", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([]);
      setupTransactionForCreate("user-new", "cust-new");
      mockSyncLineAccount.mockResolvedValueOnce({ status: "error", error: "P2002" });
      const r = await bindLineToCustomerInStore(makeValidInput());
      if (r.status === "created_new") {
        expect(r.lineAccountSync).toBe("error");
      } else {
        throw new Error(`expected created_new, got ${r.status}`);
      }
    });
  });

  // ─────────────────────────────────────────────────────
  // 4. already_synced (idempotent re-bind)
  // ─────────────────────────────────────────────────────

  it("returns already_synced when Customer 已綁同一 lineUserId + 有 userId", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      {
        id: "cust-x",
        userId: "user-x",
        lineUserId: LINE_USER_ID,
        lineLinkStatus: "LINKED",
        lineName: "old name",
      },
    ]);
    const r = await bindLineToCustomerInStore(makeValidInput());
    expect(r).toEqual({
      status: "already_synced",
      customerId: "cust-x",
      userId: "user-x",
    });
    expect(mockTx).not.toHaveBeenCalled();
    expect(mockSyncLineAccount).not.toHaveBeenCalled();
    expect(mockRepair).not.toHaveBeenCalled();
    expect(mockAwardReferrer).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────
  // 5. already_bound_to_other_line (R5)
  // ─────────────────────────────────────────────────────

  it("returns already_bound_to_other_line when phone match 已綁不同 LINE", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      {
        id: "cust-y",
        userId: "user-y",
        lineUserId: "U_some_other_line",
        lineLinkStatus: "LINKED",
        lineName: "other",
      },
    ]);
    const r = await bindLineToCustomerInStore(makeValidInput());
    expect(r).toEqual({
      status: "already_bound_to_other_line",
      customerId: "cust-y",
      existingLineUserId: "U_some_other_line",
    });
    expect(mockTx).not.toHaveBeenCalled();
    expect(mockSyncLineAccount).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────
  // 6. phone_taken_by_other_user (R1: hijack prevention)
  // ─────────────────────────────────────────────────────

  it("refuses auto-bind when phone match 已綁 userId 但無 LINE (R1 hijack)", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      {
        id: "cust-z",
        userId: "existing-web-user",
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        lineName: null,
      },
    ]);
    const r = await bindLineToCustomerInStore(makeValidInput());
    expect(r).toEqual({
      status: "phone_taken_by_other_user",
      customerId: "cust-z",
      sameLineUserId: false,
    });
    expect(mockTx).not.toHaveBeenCalled();
    expect(mockSyncLineAccount).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────
  // 7. bound_existing (Customer.userId=null AND lineUserId=null)
  // ─────────────────────────────────────────────────────

  describe("bound_existing (staff-created Customer, no User, no LINE)", () => {
    it("creates User + binds Customer", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([
        {
          id: "cust-staff",
          userId: null,
          lineUserId: null,
          lineLinkStatus: "UNLINKED",
          lineName: null,
        },
      ]);
      mockTx.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { create: mockUserCreate.mockResolvedValueOnce({ id: "user-bound" }) },
          customer: { update: mockCustomerUpdate.mockResolvedValueOnce({ id: "cust-staff" }) },
        };
        return cb(tx);
      });

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r).toMatchObject({
        status: "bound_existing",
        customerId: "cust-staff",
        userId: "user-bound",
        userCreated: true,
      });
      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: NAME,
            phone: PHONE,
            role: "CUSTOMER",
          }),
        })
      );
      expect(mockCustomerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "cust-staff" },
          data: expect.objectContaining({
            userId: "user-bound",
            authSource: "LINE",
            lineUserId: LINE_USER_ID,
            lineLinkStatus: "LINKED",
          }),
        })
      );
    });

    it("calls syncLineAccount + repair + referrer best-effort", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([
        {
          id: "cust-staff",
          userId: null,
          lineUserId: null,
          lineLinkStatus: "UNLINKED",
          lineName: null,
        },
      ]);
      mockTx.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { create: vi.fn().mockResolvedValueOnce({ id: "user-bound" }) },
          customer: { update: vi.fn().mockResolvedValueOnce({ id: "cust-staff" }) },
        };
        return cb(tx);
      });

      await bindLineToCustomerInStore(makeValidInput());

      expect(mockSyncLineAccount).toHaveBeenCalledWith({
        userId: "user-bound",
        lineUserId: LINE_USER_ID,
      });
      expect(mockRepair).toHaveBeenCalled();
      expect(mockAwardReferrer).toHaveBeenCalled();
    });

    it("reflects skipped_already_linked_other_user sync state", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([
        {
          id: "cust-staff",
          userId: null,
          lineUserId: null,
          lineLinkStatus: "UNLINKED",
          lineName: null,
        },
      ]);
      mockTx.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { create: vi.fn().mockResolvedValueOnce({ id: "user-bound" }) },
          customer: { update: vi.fn().mockResolvedValueOnce({ id: "cust-staff" }) },
        };
        return cb(tx);
      });
      mockSyncLineAccount.mockResolvedValueOnce({
        status: "skipped_already_linked_other_user",
        existingUserId: "ghost-user",
      });
      const r = await bindLineToCustomerInStore(makeValidInput());
      if (r.status === "bound_existing") {
        expect(r.lineAccountSync).toBe("skipped_already_linked_other_user");
      } else {
        throw new Error(`expected bound_existing, got ${r.status}`);
      }
    });
  });

  // ─────────────────────────────────────────────────────
  // 8. Side-effect 合約：reject 路徑不該呼叫副作用
  // ─────────────────────────────────────────────────────

  describe("side-effect contract (rejection paths skip all writes)", () => {
    it.each([
      [
        "ambiguous",
        () =>
          mockCustomerFindMany.mockResolvedValueOnce([
            { id: "a", userId: null, lineUserId: null, lineLinkStatus: "UNLINKED", lineName: null },
            { id: "b", userId: null, lineUserId: null, lineLinkStatus: "UNLINKED", lineName: null },
          ]),
      ],
      [
        "already_bound_to_other_line",
        () =>
          mockCustomerFindMany.mockResolvedValueOnce([
            { id: "a", userId: "u", lineUserId: "other", lineLinkStatus: "LINKED", lineName: null },
          ]),
      ],
      [
        "phone_taken_by_other_user",
        () =>
          mockCustomerFindMany.mockResolvedValueOnce([
            { id: "a", userId: "u", lineUserId: null, lineLinkStatus: "UNLINKED", lineName: null },
          ]),
      ],
      [
        "already_synced",
        () =>
          mockCustomerFindMany.mockResolvedValueOnce([
            { id: "a", userId: "u", lineUserId: LINE_USER_ID, lineLinkStatus: "LINKED", lineName: null },
          ]),
      ],
    ])(
      "no side effects on %s",
      async (_label, setup) => {
        setup();
        await bindLineToCustomerInStore(makeValidInput());
        expect(mockTx).not.toHaveBeenCalled();
        expect(mockSyncLineAccount).not.toHaveBeenCalled();
        expect(mockRepair).not.toHaveBeenCalled();
        expect(mockAwardReferrer).not.toHaveBeenCalled();
      }
    );
  });

  // ─────────────────────────────────────────────────────
  // 9. Query 合約：findMany take=2，scope 同店
  // ─────────────────────────────────────────────────────

  it("queries with storeId scope and take=2 (ambiguous detection)", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([]);
    setupTransactionForCreate("u", "c");
    await bindLineToCustomerInStore(makeValidInput());
    const call = mockCustomerFindMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ storeId: STORE_ID, phone: PHONE });
    expect(call.take).toBe(2);
  });
});
