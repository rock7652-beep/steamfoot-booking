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
const mockCustomerUpdateMany = vi.fn(); // PR-G5.2.b: B4 pre-update (name)
const mockCustomerFindUnique = vi.fn(); // PR-G5.2.b: D5 preflight
const mockUserCreate = vi.fn();
const mockTx = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findMany: (...args: unknown[]) => mockCustomerFindMany(...args),
      // PR-G5.2.b: B4 path's name pre-update goes here.
      updateMany: (...args: unknown[]) => mockCustomerUpdateMany(...args),
      // PR-G5.2.b: D5 (activatePrecreatedCustomerWithLine) preflight load.
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
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

/**
 * PR-G5.2.b: B4 branch now delegates to D5 (`activatePrecreatedCustomerWithLine`).
 *
 * This fixture sets up the tx mock for a successful D5 activation:
 *   - tx.customer.findFirst returns the precreated row (in-tx guard pass)
 *   - tx.user.create returns the new User
 *   - tx.account.create returns the new Account[line]
 *   - tx.customer.updateMany returns count:1 (D5's CAS succeeds)
 *
 * Caller is responsible for also priming `mockCustomerFindUnique` (D5's
 * preflight load — runs OUTSIDE tx, returns the precreated customer with
 * id/storeId/userId:null/lineUserId:null/lineLinkStatus/mergedIntoCustomerId
 * /name/phone).
 */
function setupTransactionForD5Activation(opts: {
  newUserId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
}) {
  mockTx.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      user: {
        create: vi.fn().mockResolvedValueOnce({ id: opts.newUserId }),
      },
      customer: {
        findFirst: vi.fn().mockResolvedValueOnce({
          id: opts.customerId,
          name: opts.customerName,
          phone: opts.customerPhone,
        }),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }),
      },
      account: {
        create: vi.fn().mockResolvedValueOnce({ id: "new-account-line-id" }),
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
    mockCustomerUpdateMany.mockReset();
    mockCustomerFindUnique.mockReset();
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

    // ── PR-F1: P2002 guardrail ──
    // The 0-candidate create tx can race against a concurrent bind on the same
    // (storeId, phone) or (storeId, lineUserId) compound unique. We MUST NOT
    // surface this as an uncaught throw to LIFF — return a controlled status.
    it("returns unique_conflict (no throw) when tx hits Prisma P2002", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([]);
      mockTx.mockImplementationOnce(async () => {
        const e: Error & { code?: string; meta?: { target?: string[] } } = new Error(
          "Unique constraint failed",
        );
        e.code = "P2002";
        e.meta = { target: ["storeId", "phone"] };
        throw e;
      });
      const r = await bindLineToCustomerInStore(makeValidInput());
      expect(r.status).toBe("unique_conflict");
      if (r.status === "unique_conflict") {
        expect(r.conflictTarget).toBe("storeId,phone");
      }
      // Side-effect helpers must not have run — the tx never committed.
      expect(mockSyncLineAccount).not.toHaveBeenCalled();
      expect(mockRepair).not.toHaveBeenCalled();
      expect(mockAwardReferrer).not.toHaveBeenCalled();
    });

    it("returns unique_conflict with target=unknown when P2002 lacks meta.target", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([]);
      mockTx.mockImplementationOnce(async () => {
        const e: Error & { code?: string } = new Error("Unique constraint failed");
        e.code = "P2002";
        throw e;
      });
      const r = await bindLineToCustomerInStore(makeValidInput());
      expect(r.status).toBe("unique_conflict");
      if (r.status === "unique_conflict") {
        expect(r.conflictTarget).toBe("unknown");
      }
    });

    it("re-throws non-P2002 errors from the tx (unknown failures stay visible)", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([]);
      mockTx.mockImplementationOnce(async () => {
        throw new Error("connection terminated");
      });
      await expect(bindLineToCustomerInStore(makeValidInput())).rejects.toThrow(
        "connection terminated",
      );
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

  describe("bound_existing (staff-created Customer, no User, no LINE) — PR-G5.2.b delegates to D5 activatePrecreatedCustomerWithLine", () => {
    /**
     * PR-G5.2.b: B4 path (1 candidate, userId null, lineUserId null)
     * now delegates to `activatePrecreatedCustomerWithLine` (D5). The
     * tests below verify the new atomic flow:
     *   - D5 preflight reads Customer via `prisma.customer.findUnique`
     *   - D5 in-tx: customer.findFirst guard → user.create → account.create → customer.updateMany (CAS)
     *   - finalize maps D5's `activated` → B4's `bound_existing` return shape
     *   - syncLineAccountForUser is NO LONGER called (Account[line] now atomic in D5's tx)
     */

    it("delegates to D5; returns bound_existing + userCreated:true + lineAccountSync:created; NO outer Customer.name pre-update (round 2 — Codex P2)", async () => {
      // Candidates returned by B4's phone-lookup.
      mockCustomerFindMany.mockResolvedValueOnce([
        {
          id: "cust-staff",
          userId: null,
          lineUserId: null,
          lineLinkStatus: "UNLINKED",
          lineName: null,
        },
      ]);
      // D5's preflight load (prisma.customer.findUnique). Round 2: the
      // outer caller does NOT pre-update Customer.name — D5 reads
      // whatever is in storage (here: same as input → atomic write
      // becomes a no-op).
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: null,
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: NAME,
        phone: PHONE,
      });
      // D5's in-tx surface (findFirst guard + user.create + account.create + customer.updateMany).
      setupTransactionForD5Activation({
        newUserId: "user-bound",
        customerId: "cust-staff",
        customerName: NAME,
        customerPhone: PHONE,
      });

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r).toMatchObject({
        status: "bound_existing",
        customerId: "cust-staff",
        userId: "user-bound",
        userCreated: true,
        lineAccountSync: "created",
      });
      // Round 2: prisma.customer.updateMany at the outer caller is
      // REMOVED. Any call here would indicate the non-atomic
      // pre-update regressed.
      expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
      // Legacy `prisma.customer.update` path (pre-PR-G5.2.b) is gone.
      expect(mockCustomerUpdate).not.toHaveBeenCalled();
      // PR-G5.2.b: Account[line] now written inside D5's tx, not via
      // post-tx best-effort syncLineAccountForUser.
      expect(mockSyncLineAccount).not.toHaveBeenCalled();
    });

    it("Customer.name is written INSIDE D5's Serializable tx (atomic with User+Account) when LIFF input differs from snapshot (was '未命名' staff placeholder) — round 2 (Codex P2)", async () => {
      const PLACEHOLDER_NAME = "未命名";
      mockCustomerFindMany.mockResolvedValueOnce([
        {
          id: "cust-staff",
          userId: null,
          lineUserId: null,
          lineLinkStatus: "UNLINKED",
          lineName: null,
        },
      ]);
      // Round 2: snapshot at preflight = staff placeholder, ≠ input.name.
      // D5 must atomically rewrite Customer.name inside its tx.
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: null,
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: PLACEHOLDER_NAME,
        phone: PHONE,
      });
      // Capture D5's in-tx user.create + customer.updateMany calls to
      // verify the atomic name write.
      const txUserCreate = vi.fn().mockResolvedValueOnce({ id: "user-bound" });
      const txCustomerUpdateMany = vi.fn().mockResolvedValueOnce({ count: 1 });
      mockTx.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { create: txUserCreate },
          customer: {
            // In-tx findFirst guard returns the placeholder snapshot.
            findFirst: vi
              .fn()
              .mockResolvedValueOnce({
                id: "cust-staff",
                name: PLACEHOLDER_NAME,
                phone: PHONE,
              }),
            updateMany: txCustomerUpdateMany,
          },
          account: { create: vi.fn().mockResolvedValueOnce({ id: "acc-line" }) },
        };
        return cb(tx);
      });

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r.status).toBe("bound_existing");

      // Round 2 invariant: outer prisma.customer.updateMany NEVER called.
      // The Customer.name change is INSIDE D5's tx, not before it.
      expect(mockCustomerUpdateMany).not.toHaveBeenCalled();

      // D5's in-tx Customer.updateMany data includes `name: NAME`
      // — the override rides on the same Serializable tx that creates
      // User + Account. On rollback, Customer.name is reverted.
      expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
      const customerUpdateData = txCustomerUpdateMany.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(customerUpdateData.data.name).toBe(NAME);
      // Other Customer link metadata still written together.
      expect(customerUpdateData.data.userId).toBe("user-bound");
      expect(customerUpdateData.data.lineUserId).toBe(LINE_USER_ID);
      expect(customerUpdateData.data.lineLinkStatus).toBe("LINKED");
      expect(customerUpdateData.data.authSource).toBe("LINE");

      // Round 2: User.name is also built from the override (NOT the
      // staff placeholder) so the new User row reflects the LIFF input.
      expect(txUserCreate).toHaveBeenCalledTimes(1);
      const userCreateData = txUserCreate.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(userCreateData.data.name).toBe(NAME);
    });

    it("calls D5 with synthesized OAuth shape AND customerNameOverride=input.name (round 2 contract)", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([
        {
          id: "cust-staff",
          userId: null,
          lineUserId: null,
          lineLinkStatus: "UNLINKED",
          lineName: null,
        },
      ]);
      // Capture D5's in-tx calls to verify the synthesized inputs flowed through.
      const txAccountCreate = vi.fn().mockResolvedValueOnce({ id: "acc-line" });
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: null,
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: NAME,
        phone: PHONE,
      });
      mockTx.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { create: vi.fn().mockResolvedValueOnce({ id: "user-bound" }) },
          customer: {
            findFirst: vi
              .fn()
              .mockResolvedValueOnce({ id: "cust-staff", name: NAME, phone: PHONE }),
            updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }),
          },
          account: { create: txAccountCreate },
        };
        return cb(tx);
      });

      await bindLineToCustomerInStore(makeValidInput());

      // D5's tx.account.create receives the synthesized Account[line] data
      // with PR-G5.2.a-round-17 canonical literals (provider:"line",
      // providerAccountId:input.lineUserId) and all token fields null.
      expect(txAccountCreate).toHaveBeenCalledTimes(1);
      const accountData = txAccountCreate.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(accountData.data.provider).toBe("line");
      expect(accountData.data.providerAccountId).toBe(LINE_USER_ID);
      expect(accountData.data.access_token).toBeNull();
      expect(accountData.data.refresh_token).toBeNull();
      expect(accountData.data.id_token).toBeNull();
      expect(accountData.data.expires_at).toBeNull();
      expect(accountData.data.scope).toBeNull();
      expect(accountData.data.token_type).toBeNull();
    });

    it("calls repair + referrer best-effort AFTER successful D5 activation (sync no longer called — D5 wrote Account in-tx)", async () => {
      mockCustomerFindMany.mockResolvedValueOnce([
        {
          id: "cust-staff",
          userId: null,
          lineUserId: null,
          lineLinkStatus: "UNLINKED",
          lineName: null,
          name: NAME,
        },
      ]);
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: null,
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: NAME,
        phone: PHONE,
      });
      setupTransactionForD5Activation({
        newUserId: "user-bound",
        customerId: "cust-staff",
        customerName: NAME,
        customerPhone: PHONE,
      });

      await bindLineToCustomerInStore(makeValidInput());

      // Post-tx best-effort side effects still fire (identity-repair + referrer-award).
      expect(mockRepair).toHaveBeenCalled();
      expect(mockAwardReferrer).toHaveBeenCalled();
      // Account-sync is no longer called from B4 — D5's tx wrote Account[line] atomically.
      expect(mockSyncLineAccount).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────
  // 7.5  PR-G5.2.b: B4 → D5 status-mapping coverage
  // ─────────────────────────────────────────────────────
  //
  // The 4 rejection branches of D5 (`activatePrecreatedCustomerWithLine`)
  // each get mapped to a specific BindLineResult shape by B4's switch.
  // These tests drive each D5 rejection by shaping
  // `mockCustomerFindUnique` (D5's preflight load) or by throwing Prisma
  // P2002 / P2034 from D5's tx callback.
  //
  // Status mapping invariants (see src/server/services/bind-line-to-customer.ts
  // lines 384-462):
  //   D5 status                                 → B4 BindLineResult
  //   -----------------------------------------------------------------
  //   activated                                 → bound_existing
  //   customer_already_linked_to_other_line     → already_bound_to_other_line
  //   customer_already_has_user                 → phone_taken_by_other_user (§7.1 safe)
  //   stale_customer_link  ┐
  //   store_mismatch       ├─────────────────── → unique_conflict (conflictTarget="activation_<D5-status>")
  //   write_conflict       ┘
  //   unique_conflict                           → unique_conflict (pass-through, conflictTarget from D5)
  //   line_account_mismatch                     → throws (unreachable; we synthesize inline)

  describe("PR-G5.2.b: B4 → D5 rejection status mapping", () => {
    // Shared B4-precondition: candidates = 1 row with userId === null + lineUserId === null
    // → bindLineToCustomerInStore enters the B4 branch and delegates to D5.
    function primeCandidates() {
      mockCustomerFindMany.mockResolvedValueOnce([
        {
          id: "cust-staff",
          userId: null,
          lineUserId: null,
          lineLinkStatus: "UNLINKED",
          lineName: null,
          name: NAME, // matches → no pre-update
        },
      ]);
    }

    function makeP2002(target: string[]) {
      const err: Error & { code?: string; meta?: { target?: string[] } } =
        new Error("Unique constraint failed");
      err.code = "P2002";
      err.meta = { target };
      return err;
    }

    function makeP2034() {
      const err: Error & { code?: string } = new Error(
        "Transaction failed due to a write conflict or a deadlock",
      );
      err.code = "P2034";
      return err;
    }

    it("D5 customer_already_linked_to_other_line → already_bound_to_other_line (preserves existingLineUserId)", async () => {
      primeCandidates();
      // D5's preflight sees customer.lineUserId already pointing at a
      // different LINE userId (race: another binder set it between B4's
      // candidate read and D5's preflight). D5 returns
      // customer_already_linked_to_other_line; B4 maps to
      // already_bound_to_other_line with the existing LINE.
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: null,
        lineUserId: "U_other_line", // ≠ input.lineUserId
        lineLinkStatus: "LINKED",
        mergedIntoCustomerId: null,
        name: NAME,
        phone: PHONE,
      });

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r).toEqual({
        status: "already_bound_to_other_line",
        customerId: "cust-staff",
        existingLineUserId: "U_other_line",
      });
      // No tx writes: D5 rejected at preflight.
      expect(mockTx).not.toHaveBeenCalled();
      // No post-bind side effects on rejection.
      expect(mockSyncLineAccount).not.toHaveBeenCalled();
      expect(mockRepair).not.toHaveBeenCalled();
      expect(mockAwardReferrer).not.toHaveBeenCalled();
    });

    it("D5 customer_already_has_user → phone_taken_by_other_user (§7.1 anti-hijack safe default sameLineUserId:false)", async () => {
      primeCandidates();
      // D5's preflight sees customer.userId !== null (race: another binder
      // activated this Customer between candidate read and preflight).
      // D5 returns customer_already_has_user; B4 maps to B3-style
      // phone_taken_by_other_user refusal (preserves §7.1 anti-hijack).
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: "user-other", // freshly activated by a concurrent flow
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: NAME,
        phone: PHONE,
      });

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r).toEqual({
        status: "phone_taken_by_other_user",
        customerId: "cust-staff",
        sameLineUserId: false,
      });
      expect(mockTx).not.toHaveBeenCalled();
      expect(mockSyncLineAccount).not.toHaveBeenCalled();
      expect(mockRepair).not.toHaveBeenCalled();
      expect(mockAwardReferrer).not.toHaveBeenCalled();
    });

    it("D5 stale_customer_link (preflight: mergedIntoCustomerId set) → unique_conflict with conflictTarget='activation_stale_customer_link'", async () => {
      primeCandidates();
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: null,
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: "cust-canonical", // merged shell
        name: NAME,
        phone: PHONE,
      });

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r).toEqual({
        status: "unique_conflict",
        conflictTarget: "activation_stale_customer_link",
      });
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("D5 store_mismatch (preflight: customer.storeId !== input.storeId) → unique_conflict with conflictTarget='activation_store_mismatch'", async () => {
      primeCandidates();
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: "store-other", // ≠ input.storeId — real authz boundary
        userId: null,
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: NAME,
        phone: PHONE,
      });

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r).toEqual({
        status: "unique_conflict",
        conflictTarget: "activation_store_mismatch",
      });
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("D5 write_conflict (P2034 from tx) → unique_conflict with conflictTarget='activation_write_conflict'", async () => {
      primeCandidates();
      // Preflight passes — all 5 invariants satisfied.
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: null,
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: NAME,
        phone: PHONE,
      });
      // tx throws P2034 (Serializable retry) — D5's shared translator
      // converts to write_conflict; B4 maps to unique_conflict.
      mockTx.mockImplementationOnce(async () => {
        throw makeP2034();
      });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r).toEqual({
        status: "unique_conflict",
        conflictTarget: "activation_write_conflict",
      });
      expect(mockSyncLineAccount).not.toHaveBeenCalled();
      expect(mockRepair).not.toHaveBeenCalled();
      expect(mockAwardReferrer).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("D5 unique_conflict (P2002 from tx) → unique_conflict pass-through (conflictTarget mirrors D5's)", async () => {
      primeCandidates();
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: null,
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: NAME,
        phone: PHONE,
      });
      // Account.create P2002 — concurrent OAuth linking from another
      // path raced us and inserted Account[line] for the same
      // provider/providerAccountId pair.
      mockTx.mockImplementationOnce(async () => {
        throw makeP2002(["provider", "providerAccountId"]);
      });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const r = await bindLineToCustomerInStore(makeValidInput());

      // PR-G5.2.b: B4's `case "unique_conflict"` passes the conflictTarget
      // through verbatim from D5 — the caller (LIFF action) sees the
      // exact unique constraint that hit.
      expect(r).toMatchObject({
        status: "unique_conflict",
        conflictTarget: expect.stringContaining("provider"),
      });
      expect(mockSyncLineAccount).not.toHaveBeenCalled();
      expect(mockRepair).not.toHaveBeenCalled();
      expect(mockAwardReferrer).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  // ─────────────────────────────────────────────────────
  // 7.6  PR-G5.2.b round 2 (Codex P2): atomic Customer.name guard
  // ─────────────────────────────────────────────────────
  //
  // Round 2 closes a non-atomic-write hole: round 1's outer
  // `prisma.customer.updateMany({...name: input.name})` ran BEFORE D5,
  // so any D5 failure (write_conflict / P2002 / store_mismatch / stale)
  // left Customer.name overwritten with no User+Account activation
  // backing it. Round 2 removes the outer pre-update and moves the
  // name override INSIDE D5's Serializable tx — failure now rolls back
  // the name change atomically.
  //
  // These tests sweep every D5-rejection branch and assert the outer
  // prisma.customer.updateMany is NEVER called. They are the explicit
  // regression-detector for the Codex P2 finding.

  describe("PR-G5.2.b round 2: Customer.name pre-update is NEVER attempted before D5 (atomic rollback contract)", () => {
    function primeB4Candidate() {
      mockCustomerFindMany.mockResolvedValueOnce([
        {
          id: "cust-staff",
          userId: null,
          lineUserId: null,
          lineLinkStatus: "UNLINKED",
          lineName: null,
        },
      ]);
    }
    function makeP2002(target: string[]) {
      const err: Error & { code?: string; meta?: { target?: string[] } } =
        new Error("Unique constraint failed");
      err.code = "P2002";
      err.meta = { target };
      return err;
    }
    function makeP2034() {
      const err: Error & { code?: string } = new Error(
        "Transaction failed due to a write conflict or a deadlock",
      );
      err.code = "P2034";
      return err;
    }

    it("D5 store_mismatch (preflight rejects) → outer Customer.name pre-update NEVER called", async () => {
      primeB4Candidate();
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: "store-other",
        userId: null,
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: "未命名",
        phone: PHONE,
      });

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r.status).toBe("unique_conflict");
      // Codex P2 regression guard: name MUST NOT change on D5 failure.
      expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("D5 customer_already_has_user (preflight rejects) → outer Customer.name pre-update NEVER called", async () => {
      primeB4Candidate();
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: "user-other",
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: "未命名",
        phone: PHONE,
      });

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r.status).toBe("phone_taken_by_other_user");
      expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("D5 customer_already_linked_to_other_line (preflight rejects) → outer Customer.name pre-update NEVER called", async () => {
      primeB4Candidate();
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: null,
        lineUserId: "U_other_line",
        lineLinkStatus: "LINKED",
        mergedIntoCustomerId: null,
        name: "未命名",
        phone: PHONE,
      });

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r.status).toBe("already_bound_to_other_line");
      expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("D5 stale_customer_link (preflight: merged) → outer Customer.name pre-update NEVER called", async () => {
      primeB4Candidate();
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: null,
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: "cust-canonical",
        name: "未命名",
        phone: PHONE,
      });

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r.status).toBe("unique_conflict");
      expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
      expect(mockTx).not.toHaveBeenCalled();
    });

    it("D5 write_conflict (P2034 inside tx) → outer Customer.name pre-update NEVER called (round 2 core regression: name change MUST NOT survive a tx rollback)", async () => {
      primeB4Candidate();
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: null,
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: "未命名", // ← placeholder; round 1 would have overwritten this
        phone: PHONE,
      });
      mockTx.mockImplementationOnce(async () => {
        throw makeP2034();
      });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r.status).toBe("unique_conflict");
      // Codex P2 core finding: round 1 would have overwritten Customer.name
      // BEFORE this P2034. Round 2's contract is that the outer
      // prisma.customer.updateMany never runs.
      expect(mockCustomerUpdateMany).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("D5 unique_conflict (P2002 from Account.create) → outer Customer.name pre-update NEVER called", async () => {
      primeB4Candidate();
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: "cust-staff",
        storeId: STORE_ID,
        userId: null,
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: "未命名",
        phone: PHONE,
      });
      mockTx.mockImplementationOnce(async () => {
        throw makeP2002(["provider", "providerAccountId"]);
      });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r.status).toBe("unique_conflict");
      expect(mockCustomerUpdateMany).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  // ─────────────────────────────────────────────────────
  // 7.7  PR-G5.2.b round 2 (Codex P2): B3 anti-hijack still holds
  // ─────────────────────────────────────────────────────
  //
  // Defense-in-depth: round 2 only changes B4 (D5 wiring). B3 (existing
  // User + no LINE) must continue refusing without changing Customer.name
  // and without binding LINE. This test is a regression guard that
  // round-2's "atomic name in D5" did not accidentally apply to B3.

  describe("PR-G5.2.b round 2: B3 phone_taken_by_other_user — no name change, no LINE binding", () => {
    it("existing-User Customer (B3) refuses with phone_taken_by_other_user; NO Customer.name write; NO D5 call; NO tx", async () => {
      const PLACEHOLDER_NAME = "未命名";
      mockCustomerFindMany.mockResolvedValueOnce([
        {
          id: "cust-existing",
          userId: "user-existing",
          lineUserId: null, // B3 precondition: existing User, no LINE
          lineLinkStatus: "UNLINKED",
          lineName: null,
        },
      ]);
      // Even though placeholder name exists, B3 must not invoke any
      // overwrite.
      mockCustomerFindUnique.mockResolvedValue({
        id: "cust-existing",
        storeId: STORE_ID,
        userId: "user-existing",
        lineUserId: null,
        lineLinkStatus: "UNLINKED",
        mergedIntoCustomerId: null,
        name: PLACEHOLDER_NAME,
        phone: PHONE,
      });

      const r = await bindLineToCustomerInStore(makeValidInput());

      expect(r).toMatchObject({
        status: "phone_taken_by_other_user",
        customerId: "cust-existing",
      });
      // §7.1 anti-hijack: no Customer.name write, no D5 call, no tx.
      expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
      expect(mockCustomerUpdate).not.toHaveBeenCalled();
      // findUnique (D5's preflight) MUST NOT be called — B3 short-circuits
      // before ever reaching D5.
      expect(mockCustomerFindUnique).not.toHaveBeenCalled();
      expect(mockTx).not.toHaveBeenCalled();
      // No LINE binding side effects.
      expect(mockSyncLineAccount).not.toHaveBeenCalled();
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
