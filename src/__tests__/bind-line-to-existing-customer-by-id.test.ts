/**
 * bindLineToExistingCustomerById() unit tests (PR-G5.1.a)
 *
 * Pure-mock tests for the new customerId-driven helper added in PR-G5.1.a.
 * Conforms strictly to docs/line-identity-binding-pre-audit.md §5.3
 * (existing-user helper) pre-write checklist + atomicity contract.
 *
 * Coverage map:
 *   ── status branches (6) ──
 *     • bound_existing          — happy path: Customer.lineUserId=null,
 *                                  Customer.update + Account.create in tx
 *     • already_synced          — idempotent: Customer.lineUserId matches
 *                                  AND Account[line].userId === customer.userId
 *     • customer_locked         — Customer.lineUserId already set to a
 *                                  different lineUserId
 *     • store_mismatch          — customer.storeId !== input.storeId
 *                                  (plus "(not_found)" sentinel sub-case
 *                                  when customerId resolves to no row)
 *     • customer_has_no_user    — customer.userId === null (Case B path —
 *                                  helper rejects; activation helper handles
 *                                  it separately in PR-G5.5)
 *     • unique_conflict         — Prisma P2002 caught and translated
 *
 *   ── pre-write semantics (PR-G5.0 §5.3 steps 3 / 4) ──
 *     • store_mismatch / customer_has_no_user / customer_locked all
 *       reject **before any DB write**: spy asserts $transaction +
 *       account.create + customer.update are 0 calls
 *
 *   ── atomicity (A3) ──
 *     • account.create throw inside tx → tx callback re-throws → no commit
 *     • Serializable isolation level is requested
 *
 *   ── log masking ──
 *     • on unique_conflict, console.warn payload uses maskId / maskLineUserId;
 *       raw storeId / customerId / userId / lineUserId NEVER present
 *
 *   ── caller-isolation (regression) ──
 *     • no caller files touched: assert by absence in this test's import graph
 *       (covered by repository-level diff scope; not testable inline)
 *
 * Mocks:
 *   - @/lib/db prisma (customer.findUnique, $transaction,
 *                      account.findUnique)
 *   - Existing helper's downstream services (line-account-sync,
 *     identity-repair, referral-points) — mocked even though new helper
 *     doesn't call them, to keep the existing module-level mocks coherent
 *     when both helpers live in the same file.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── prisma mocks ──────────────────────────────────────
const mockCustomerFindUnique = vi.fn();
const mockAccountFindUnique = vi.fn();
const mockTx = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      // existing helper uses findMany; new helper uses findUnique
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
    },
    account: {
      findUnique: (...args: unknown[]) => mockAccountFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTx(...args),
  },
}));

// ── existing helper's downstream-service mocks (kept coherent) ──
vi.mock("@/server/services/line-account-sync", () => ({
  syncLineAccountForUser: vi.fn(),
}));
vi.mock("@/lib/identity-repair", () => ({
  repairCustomerIdentityOnLogin: vi.fn(),
}));
vi.mock("@/server/services/referral-points", () => ({
  awardLineJoinReferrerIfEligible: vi.fn(),
}));

import {
  bindLineToExistingCustomerById,
  type BindLineToExistingCustomerByIdInput,
} from "@/server/services/bind-line-to-customer";

// ── shared fixture constants ──────────────────────────
const STORE_ID = "store-zhubei-id";
const OTHER_STORE_ID = "store-other-id";
const CUSTOMER_ID = "ckcustomer000000000000001";
const USER_ID = "ckuser0000000000000000001";
const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const OTHER_LINE_USER_ID = "U_other_line_user_id_0000000000abcd";
const LINE_NAME = "LINE 暱稱";

function makeValidInput(
  overrides: Partial<BindLineToExistingCustomerByIdInput> = {},
): BindLineToExistingCustomerByIdInput {
  return {
    storeId: STORE_ID,
    customerId: CUSTOMER_ID,
    lineUserId: LINE_USER_ID,
    lineName: LINE_NAME,
    ...overrides,
  };
}

/**
 * Build a fake `tx` client and run the $transaction callback. Returns
 * the spy fns so individual tests can inspect call counts / arguments
 * / configure throws.
 *
 * Both `tx.customer.update` and `tx.customer.updateMany` are spied:
 *  - `txCustomerUpdate`     — should now be 0 calls in every helper
 *                              path (PR-G5.1.a P1 round 1 replaced the
 *                              full-bind write with `updateMany`)
 *  - `txCustomerUpdateMany` — 1 call in the full-bind path; defaults
 *                              to `{ count: 1 }` (happy path). Tests
 *                              that simulate the stale race override
 *                              with `mockResolvedValueOnce({ count: 0 })`.
 *  - `txAccountCreate`      — 1 call in full-bind and Account-only
 *                              repair paths (each invoked from its
 *                              own sibling private fn).
 */
function setupTransaction() {
  const txCustomerUpdate = vi.fn().mockResolvedValue({ id: CUSTOMER_ID });
  const txCustomerUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const txAccountCreate = vi.fn().mockResolvedValue({ id: "new-account-id" });
  let lastIsolationLevel: string | undefined;

  mockTx.mockImplementation(
    async (
      cb: (tx: unknown) => Promise<unknown>,
      opts?: { isolationLevel?: string },
    ) => {
      lastIsolationLevel = opts?.isolationLevel;
      const tx = {
        customer: {
          update: txCustomerUpdate,
          updateMany: txCustomerUpdateMany,
        },
        account: { create: txAccountCreate },
      };
      return cb(tx);
    },
  );

  return {
    txCustomerUpdate,
    txCustomerUpdateMany,
    txAccountCreate,
    getIsolationLevel: () => lastIsolationLevel,
  };
}

beforeEach(() => {
  mockCustomerFindUnique.mockReset();
  mockAccountFindUnique.mockReset();
  mockTx.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. Happy path: bound_existing
// ════════════════════════════════════════════════════════════════════════════

describe("bound_existing (Customer.lineUserId is null, atomic write succeeds)", () => {
  it("writes Customer.updateMany + Account.create in a single Serializable tx (PR-G5.1.a P1 round 1: full-bind now uses conditional updateMany)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const {
      txCustomerUpdate,
      txCustomerUpdateMany,
      txAccountCreate,
      getIsolationLevel,
    } = setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "bound_existing",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });
    expect(mockTx).toHaveBeenCalledTimes(1);
    expect(getIsolationLevel()).toBe("Serializable");

    // Plain `update` MUST NOT be called — would be unsafe under TOCTOU.
    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
    // Conditional `updateMany` with `where: lineUserId: null` is the
    // TOCTOU-safe shape required by PR #242 Codex P1 round 1.
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledWith({
      where: {
        id: CUSTOMER_ID,
        storeId: STORE_ID,
        userId: USER_ID,
        lineUserId: null,
      },
      data: expect.objectContaining({
        lineUserId: LINE_USER_ID,
        lineName: LINE_NAME,
        lineLinkStatus: "LINKED",
        lineLinkedAt: expect.any(Date),
      }),
    });

    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        provider: "line",
        providerAccountId: LINE_USER_ID,
        type: "oauth",
      },
    });
  });

  it("forwards null lineName as null (no string fallback) via updateMany data", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const { txCustomerUpdateMany } = setupTransaction();
    await bindLineToExistingCustomerById(makeValidInput({ lineName: null }));
    expect(txCustomerUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lineName: null }),
      }),
    );
  });

  it("does not consult account.findUnique when Customer.lineUserId is null (skip already_synced fast-path)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    setupTransaction();
    await bindLineToExistingCustomerById(makeValidInput());
    expect(mockAccountFindUnique).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. already_synced (idempotent re-bind)
// ════════════════════════════════════════════════════════════════════════════

describe("already_synced (idempotent: Customer.lineUserId matches + Account[line] points at customer.userId)", () => {
  it("returns already_synced with 0 DB writes", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID, // already matches input
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce({ userId: USER_ID });

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "already_synced",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("returns account_repaired (NOT bound_existing) when Customer.lineUserId matches but Account[line] row is missing — drift repair path, PR-G5.1.a P2 fix #2", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    // Account row missing — drift case PR-F1.2 detects as missing-account
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerUpdate, txAccountCreate, getIsolationLevel } =
      setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "account_repaired",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });
    // Account-only repair: Account.create runs, Customer link metadata
    // (lineLinkedAt / lineName / lineLinkStatus / lineUserId) is preserved
    // — `customer.update` MUST NOT be called in this branch.
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdate).not.toHaveBeenCalled();
    // Account-only repair tx still uses Serializable isolation.
    expect(getIsolationLevel()).toBe("Serializable");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. customer_locked (different LINE already attached)
// ════════════════════════════════════════════════════════════════════════════

describe("customer_locked (Customer.lineUserId set to a different lineUserId)", () => {
  it("rejects with 0 DB writes", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: OTHER_LINE_USER_ID, // not the same as input
      lineLinkStatus: "LINKED",
    });

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "customer_locked",
      customerId: CUSTOMER_ID,
      existingLineUserId: OTHER_LINE_USER_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
    expect(mockAccountFindUnique).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. store_mismatch (cross-store guard — real authorization boundary)
// ════════════════════════════════════════════════════════════════════════════

describe("store_mismatch (helper-internal real authorization boundary, PR-G5.0 §5.3 step 3)", () => {
  it("rejects when customer.storeId !== input.storeId, 0 writes", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: OTHER_STORE_ID, // different store
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "store_mismatch",
      expectedStoreId: STORE_ID,
      actualStoreId: OTHER_STORE_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
    expect(mockAccountFindUnique).not.toHaveBeenCalled();
  });

  it("returns store_mismatch with actualStoreId=(not_found) when customerId resolves to no row", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(null);

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "store_mismatch",
      expectedStoreId: STORE_ID,
      actualStoreId: "(not_found)",
    });
    expect(mockTx).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. customer_has_no_user (Case B path — activation helper handles separately)
// ════════════════════════════════════════════════════════════════════════════

describe("customer_has_no_user (existing-user-only helper rejects userId=null, PR-G5.0 §5.3 step 4)", () => {
  it("rejects with 0 DB writes (no silent User creation)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: null, // staff-precreated Customer, not yet activated
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "customer_has_no_user",
      customerId: CUSTOMER_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
    expect(mockAccountFindUnique).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. unique_conflict (Prisma P2002 caught and translated)
// ════════════════════════════════════════════════════════════════════════════

describe("unique_conflict (Prisma P2002 race or drift)", () => {
  function makeP2002(target: string[]) {
    const err: Error & { code?: string; meta?: { target?: string[] } } =
      new Error("Unique constraint failed");
    err.code = "P2002";
    err.meta = { target };
    return err;
  }

  it("Account.create P2002 → unique_conflict with conflictTarget; tx rolls back", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    // simulate tx throws P2002 from inside the callback
    mockTx.mockImplementationOnce(async () => {
      throw makeP2002(["provider", "providerAccountId"]);
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "unique_conflict",
      conflictTarget: "provider,providerAccountId",
    });
    // tx was attempted (so rollback applies); no follow-up writes
    expect(mockTx).toHaveBeenCalledTimes(1);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("Customer.update P2002 also produces unique_conflict (storeId+lineUserId race)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    mockTx.mockImplementationOnce(async () => {
      throw makeP2002(["storeId", "lineUserId"]);
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "unique_conflict",
      conflictTarget: "storeId,lineUserId",
    });
  });

  it("unique_conflict with no meta.target falls back to conflictTarget='unknown'", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    mockTx.mockImplementationOnce(async () => {
      const err: Error & { code?: string } = new Error("Unique constraint failed");
      err.code = "P2002";
      throw err;
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("unique_conflict");
    if (r.status === "unique_conflict") {
      expect(r.conflictTarget).toBe("unknown");
    }
  });

  it("re-throws non-P2002 errors (unknown DB failures stay visible)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    mockTx.mockImplementationOnce(async () => {
      throw new Error("connection terminated");
    });

    await expect(bindLineToExistingCustomerById(makeValidInput())).rejects.toThrow(
      "connection terminated",
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. Atomicity (A3): Account.create throw inside tx → tx callback re-throws
// ════════════════════════════════════════════════════════════════════════════

describe("A3 atomicity (PR-G5.0 §1.3 / §5.3 step 5)", () => {
  it("when account.create throws inside tx callback, the throw propagates out of $transaction (rollback)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });

    // Realistic Prisma-like behaviour: $transaction(cb) re-throws when cb
    // throws. Full-bind now uses updateMany — set count=1 so we reach
    // account.create.
    const txCustomerUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txAccountCreate = vi.fn().mockRejectedValue(new Error("db-write-fail"));
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          customer: {
            update: vi.fn(),
            updateMany: txCustomerUpdateMany,
          },
          account: { create: txAccountCreate },
        };
        // mimic Prisma: callback throw -> $transaction rejects, no commit
        return cb(tx);
      },
    );

    await expect(bindLineToExistingCustomerById(makeValidInput())).rejects.toThrow(
      "db-write-fail",
    );

    // Both writes were attempted in-callback (so the tx wrapper actually
    // exercised); rollback semantics are Prisma's responsibility.
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("Serializable isolation requested (race protection)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const { getIsolationLevel } = setupTransaction();
    await bindLineToExistingCustomerById(makeValidInput());
    expect(getIsolationLevel()).toBe("Serializable");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. PII / log masking
// ════════════════════════════════════════════════════════════════════════════

describe("PII masking (PR-G5.0 / line-bind-log contract)", () => {
  it("unique_conflict console.warn never contains raw IDs (uses maskId / maskLineUserId)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    mockTx.mockImplementationOnce(async () => {
      const err: Error & { code?: string; meta?: { target?: string[] } } =
        new Error("Unique constraint failed");
      err.code = "P2002";
      err.meta = { target: ["provider", "providerAccountId"] };
      throw err;
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await bindLineToExistingCustomerById(makeValidInput());

    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Flatten every warn-arg into a single inspectable string.
    const dumped = warnSpy.mock.calls
      .flat()
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join("\n");

    // Raw values must NEVER appear; masked forms MUST appear.
    expect(dumped).not.toContain(STORE_ID);
    expect(dumped).not.toContain(CUSTOMER_ID);
    expect(dumped).not.toContain(USER_ID);
    expect(dumped).not.toContain(LINE_USER_ID);
    // first 6 chars + "****" pattern for cuid-like IDs
    expect(dumped).toContain("store-****");
    expect(dumped).toContain("ckcust****");
    expect(dumped).toContain("ckuser****");
    // U-prefix lineUserId mask: first 4 + last 2
    expect(dumped).toContain("U123****ef");

    warnSpy.mockRestore();
  });

  it("happy path does not log anything (caller owns success log)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    setupTransaction();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await bindLineToExistingCustomerById(makeValidInput());

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("rejection branches (store_mismatch / customer_has_no_user / customer_locked) do not log", async () => {
    // store_mismatch
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: OTHER_STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await bindLineToExistingCustomerById(makeValidInput());
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();

    // customer_has_no_user
    mockCustomerFindUnique.mockReset();
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: null,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const warnSpy2 = vi.spyOn(console, "warn").mockImplementation(() => {});
    await bindLineToExistingCustomerById(makeValidInput());
    expect(warnSpy2).not.toHaveBeenCalled();
    warnSpy2.mockRestore();

    // customer_locked
    mockCustomerFindUnique.mockReset();
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: OTHER_LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    const warnSpy3 = vi.spyOn(console, "warn").mockImplementation(() => {});
    await bindLineToExistingCustomerById(makeValidInput());
    expect(warnSpy3).not.toHaveBeenCalled();
    warnSpy3.mockRestore();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. Pre-write contract: rejection branches MUST NOT touch any write API
// ════════════════════════════════════════════════════════════════════════════

describe("pre-write semantics — every rejection branch is 0-DB-write (PR-G5.0 §5.3)", () => {
  it.each([
    [
      "store_mismatch",
      () =>
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          storeId: OTHER_STORE_ID,
          userId: USER_ID,
          lineUserId: null,
          lineLinkStatus: "UNLINKED",
        }),
    ],
    [
      "store_mismatch (customer not found)",
      () => mockCustomerFindUnique.mockResolvedValueOnce(null),
    ],
    [
      "customer_has_no_user",
      () =>
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          storeId: STORE_ID,
          userId: null,
          lineUserId: null,
          lineLinkStatus: "UNLINKED",
        }),
    ],
    [
      "customer_locked",
      () =>
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          storeId: STORE_ID,
          userId: USER_ID,
          lineUserId: OTHER_LINE_USER_ID,
          lineLinkStatus: "LINKED",
        }),
    ],
    [
      "already_synced",
      () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          storeId: STORE_ID,
          userId: USER_ID,
          lineUserId: LINE_USER_ID,
          lineLinkStatus: "LINKED",
        });
        mockAccountFindUnique.mockResolvedValueOnce({ userId: USER_ID });
      },
    ],
  ])("no write happens on %s", async (_label, setup) => {
    setup();
    await bindLineToExistingCustomerById(makeValidInput());
    expect(mockTx).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. P2-1 (PR #242 Codex): Serializable write_conflict (Prisma P2034)
// ════════════════════════════════════════════════════════════════════════════
//
// Concurrent binders touching the same Customer or LINE Account row at
// Serializable isolation can lose the race and surface as Prisma `P2034`
// rather than `P2002`. The helper must translate it into a controlled
// `write_conflict` status — never let it leak as an uncaught throw / 500.

describe("P2-1 (Codex): Serializable write_conflict (Prisma P2034)", () => {
  function makeP2034() {
    const err: Error & { code?: string } = new Error(
      "Transaction failed due to a write conflict or a deadlock",
    );
    err.code = "P2034";
    return err;
  }

  it("full bind tx P2034 → write_conflict status; no uncaught throw", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    mockTx.mockImplementationOnce(async () => {
      throw makeP2034();
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({ status: "write_conflict", code: "P2034" });
    expect(mockTx).toHaveBeenCalledTimes(1);
    // Helper-internal log fires once with masked fields only.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("account-only repair tx P2034 → write_conflict status (Customer metadata still preserved, NOT bound_existing)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID, // already linked
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null); // drift: Account missing
    mockTx.mockImplementationOnce(async () => {
      throw makeP2034();
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({ status: "write_conflict", code: "P2034" });
    // The repair tx was attempted (so the race was real) — caller can retry.
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it("P2034 race → no observable partial Customer write (tx callback ran updateMany then account.create threw; tx rolls back)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    // Simulate P2034 thrown from Account.create inside the tx — Prisma
    // rolls everything back; from the helper's POV, the tx wrapper re-
    // throws and the caller never sees a half-applied Customer row.
    // Full-bind path now does updateMany (count=1 to reach account.create).
    const txCustomerUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txAccountCreate = vi.fn().mockRejectedValue(makeP2034());
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          customer: {
            update: vi.fn(),
            updateMany: txCustomerUpdateMany,
          },
          account: { create: txAccountCreate },
        };
        try {
          return await cb(tx);
        } catch (e) {
          // Realistic Prisma behaviour: throw bubbles out, rollback.
          throw e;
        }
      },
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({ status: "write_conflict", code: "P2034" });
    // tx callback ran updateMany but Prisma rolled it back; the
    // caller-visible state is "no write happened" — which the helper
    // contract communicates via the write_conflict return value.
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("P2034 log payload is masked-only (no raw lineUserId / customerId / userId / storeId)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    mockTx.mockImplementationOnce(async () => {
      throw makeP2034();
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await bindLineToExistingCustomerById(makeValidInput());

    const dumped = warnSpy.mock.calls
      .flat()
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join("\n");
    expect(dumped).toContain("write_conflict");
    expect(dumped).toContain("P2034");
    expect(dumped).not.toContain(STORE_ID);
    expect(dumped).not.toContain(CUSTOMER_ID);
    expect(dumped).not.toContain(USER_ID);
    expect(dumped).not.toContain(LINE_USER_ID);
    // Standard masks present
    expect(dumped).toContain("store-****");
    expect(dumped).toContain("ckcust****");
    expect(dumped).toContain("ckuser****");
    expect(dumped).toContain("U123****ef");
    warnSpy.mockRestore();
  });

  it("P2002 unique_conflict tests still pass (translator dispatches correctly between P2002 and P2034)", async () => {
    // Sanity sentinel — P2034 detection must not regress the P2002 path.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    mockTx.mockImplementationOnce(async () => {
      const err: Error & { code?: string; meta?: { target?: string[] } } =
        new Error("Unique constraint failed");
      err.code = "P2002";
      err.meta = { target: ["provider", "providerAccountId"] };
      throw err;
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "unique_conflict",
      conflictTarget: "provider,providerAccountId",
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. P2-2 (PR #242 Codex): Preserve Customer link metadata during Account repair
// ════════════════════════════════════════════════════════════════════════════
//
// When `customer.lineUserId === input.lineUserId` AND the Account[line]
// row is missing, the helper does an Account-only repair tx — it MUST
// NOT touch Customer link metadata. Overwriting `lineLinkedAt` would
// erase the original bind timestamp; overwriting `lineName` with the
// input value (especially when input is null) would erase a previously
// stored displayName.

describe("P2-2 (Codex): Account-only repair preserves Customer link metadata", () => {
  it("missing-Account drift → repair Account only; customer.update is NEVER called", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID, // already linked
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerUpdate, txAccountCreate } = setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("account_repaired");
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    // The critical invariant: zero writes to Customer in the repair path.
    expect(txCustomerUpdate).not.toHaveBeenCalled();
  });

  it("repair path with input lineName=null does NOT erase existing Customer.lineName (customer.update still skipped)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerUpdate, txAccountCreate } = setupTransaction();

    const r = await bindLineToExistingCustomerById(
      makeValidInput({ lineName: null }),
    );

    expect(r.status).toBe("account_repaired");
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    // If the helper ran customer.update with `lineName: null`, the
    // existing displayName would be nulled out. customer.update MUST
    // not be called at all in the repair branch.
    expect(txCustomerUpdate).not.toHaveBeenCalled();
  });

  it("Account-only repair Account.create args are identical to the full-bind path (correct userId / provider / providerAccountId / type)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txAccountCreate } = setupTransaction();

    await bindLineToExistingCustomerById(makeValidInput());

    expect(txAccountCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        provider: "line",
        providerAccountId: LINE_USER_ID,
        type: "oauth",
      },
    });
  });

  it("Account-only repair Account.create P2002 race → unique_conflict (preserves Customer metadata even on conflict — customer.update never ran)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    mockTx.mockImplementationOnce(async () => {
      const err: Error & { code?: string; meta?: { target?: string[] } } =
        new Error("Unique constraint failed");
      err.code = "P2002";
      err.meta = { target: ["provider", "providerAccountId"] };
      throw err;
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "unique_conflict",
      conflictTarget: "provider,providerAccountId",
    });
    // tx was attempted (and rolled back); critically the helper never
    // even queued a customer.update — Customer row is untouched
    // regardless of the race outcome.
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it("first-time bind (Customer.lineUserId === null) STILL sets lineLinkedAt + lineName via conditional updateMany (regression sentinel for P2-2; updated for P1 round 1)", async () => {
    // Sanity: the metadata-preservation fix MUST NOT regress the happy
    // path — first bind should still write Customer link fields. After
    // PR #242 Codex P1 round 1, the write shape is `updateMany` with a
    // conditional where; data shape is unchanged.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null, // first bind
      lineLinkStatus: "UNLINKED",
    });
    const { txCustomerUpdate, txCustomerUpdateMany, txAccountCreate } =
      setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("bound_existing");
    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: CUSTOMER_ID,
          storeId: STORE_ID,
          userId: USER_ID,
          lineUserId: null,
        },
        data: expect.objectContaining({
          lineUserId: LINE_USER_ID,
          lineName: LINE_NAME,
          lineLinkStatus: "LINKED",
          lineLinkedAt: expect.any(Date),
        }),
      }),
    );
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("already_synced (full sync, no drift) remains a 0-write idempotent return — Customer metadata trivially preserved", async () => {
    // Regression sentinel: the metadata-preservation refactor must not
    // accidentally turn the idempotent fast-path into a write.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce({ userId: USER_ID });

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "already_synced",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 12. P2 round 2 (PR #242 Codex): per-field Customer metadata preservation
// ════════════════════════════════════════════════════════════════════════════
//
// The Account-only repair branch is now extracted into a sibling private
// function `runAccountOnlyRepairTx`. The full-bind `customer.update` data
// block (with `lineUserId` / `lineName` / `lineLinkStatus` / `lineLinkedAt`)
// lives in a different function scope and cannot be reached from the
// repair path. These tests assert each Customer link-metadata field
// individually so a future refactor that ever wires `customer.update`
// back into the repair branch is caught immediately.
//
// Pure-mock invariant: "field unchanged" ≡ "`tx.customer.update` was
// never called". We additionally pin each pre-state value on the
// findUnique fixture so the intent (and the trail in CI logs on a
// regression) is unambiguous.

describe("P2 round 2 (Codex): repair branch preserves Customer metadata per field", () => {
  // Existing metadata recorded at the original successful bind — these
  // values are what MUST survive an Account-only repair call.
  const ORIGINAL_LINKED_AT = new Date("2025-01-15T09:30:00.000Z");
  const ORIGINAL_LINE_NAME = "原始_LINE暱稱";

  function repairFixture(overrides: Record<string, unknown> = {}) {
    return {
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID, // already linked
      lineLinkStatus: "LINKED",
      // `lineLinkedAt` and `lineName` are not in the helper's findUnique
      // select() (helper doesn't need them to make a decision), but we
      // include them on the fixture for documentation: these are the
      // values the DB row currently holds and that the repair tx must
      // not touch.
      lineLinkedAt: ORIGINAL_LINKED_AT,
      lineName: ORIGINAL_LINE_NAME,
      ...overrides,
    };
  }

  it("repair branch: account.create runs once, customer.update is called 0 times (all 4 metadata fields preserved)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(repairFixture());
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerUpdate, txAccountCreate } = setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "account_repaired",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });
    expect(txAccountCreate).toHaveBeenCalledTimes(1);

    // ── per-field invariant: customer.update must NEVER be invoked ──
    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
    // Belt-and-braces: scan all calls to confirm none of the 4 metadata
    // fields appear in any update data payload. If a future refactor
    // adds a `customer.update({ data: { lineLinkedAt: ... } })` call
    // here, this assertion fails immediately.
    const allUpdateCalls = txCustomerUpdate.mock.calls;
    for (const call of allUpdateCalls) {
      const data = (call?.[0] as { data?: Record<string, unknown> })?.data ?? {};
      expect(data).not.toHaveProperty("lineLinkedAt");
      expect(data).not.toHaveProperty("lineName");
      expect(data).not.toHaveProperty("lineLinkStatus");
      expect(data).not.toHaveProperty("lineUserId");
    }
  });

  it("repair branch: lineLinkedAt is NEVER written (original bind timestamp survives)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(repairFixture());
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerUpdate } = setupTransaction();

    await bindLineToExistingCustomerById(makeValidInput());

    // The fixture says the DB row already has ORIGINAL_LINKED_AT; the
    // helper must not overwrite it. Since the only way to overwrite it
    // is via customer.update, asserting "never called with lineLinkedAt"
    // proves the field is preserved.
    const wroteLinkedAt = txCustomerUpdate.mock.calls.some((call) => {
      const data = (call?.[0] as { data?: Record<string, unknown> })?.data ?? {};
      return Object.prototype.hasOwnProperty.call(data, "lineLinkedAt");
    });
    expect(wroteLinkedAt).toBe(false);
  });

  it("repair branch: lineName is NEVER written (original displayName survives)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(repairFixture());
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerUpdate } = setupTransaction();

    await bindLineToExistingCustomerById(makeValidInput());

    const wroteLineName = txCustomerUpdate.mock.calls.some((call) => {
      const data = (call?.[0] as { data?: Record<string, unknown> })?.data ?? {};
      return Object.prototype.hasOwnProperty.call(data, "lineName");
    });
    expect(wroteLineName).toBe(false);
  });

  it("repair branch: lineLinkStatus is NEVER written (preserve historical status)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(repairFixture());
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerUpdate } = setupTransaction();

    await bindLineToExistingCustomerById(makeValidInput());

    const wroteStatus = txCustomerUpdate.mock.calls.some((call) => {
      const data = (call?.[0] as { data?: Record<string, unknown> })?.data ?? {};
      return Object.prototype.hasOwnProperty.call(data, "lineLinkStatus");
    });
    expect(wroteStatus).toBe(false);
  });

  it("repair branch with input lineName=null: existing Customer.lineName NEVER overwritten (no null-stomp regression)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(repairFixture());
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerUpdate, txAccountCreate } = setupTransaction();

    const r = await bindLineToExistingCustomerById(
      makeValidInput({ lineName: null }),
    );

    expect(r.status).toBe("account_repaired");
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    // If the helper passed `lineName: null` to customer.update here,
    // the DB column would be nulled out — exactly the bug Codex flagged.
    // Hard invariant: customer.update is never called in the repair path.
    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
  });

  it("repair branch with input lineLinkedAt=undefined-ish (no field) still does not write lineLinkedAt", async () => {
    // Sanity: even if a future caller forgets to pass something
    // structurally adjacent to lineLinkedAt, the helper never invents
    // a write here. The repair tx body simply has no Customer write
    // shape to populate.
    mockCustomerFindUnique.mockResolvedValueOnce(repairFixture());
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerUpdate } = setupTransaction();

    await bindLineToExistingCustomerById(makeValidInput());

    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
  });

  it("first-time bind (Customer.lineUserId === null) STILL writes lineUserId + lineName + lineLinkStatus + lineLinkedAt via updateMany (regression sentinel; updated for P1 round 1)", async () => {
    // Negative companion: the extract + P1 race fix MUST NOT regress
    // the full-bind path. The first bind continues to populate all 4
    // metadata fields — now via updateMany.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const { txCustomerUpdate, txCustomerUpdateMany, txAccountCreate } =
      setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("bound_existing");
    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);

    const data = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data).toBeDefined();
    expect(data).toHaveProperty("lineUserId", LINE_USER_ID);
    expect(data).toHaveProperty("lineName", LINE_NAME);
    expect(data).toHaveProperty("lineLinkStatus", "LINKED");
    expect(data?.lineLinkedAt).toBeInstanceOf(Date);

    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("already_synced (Customer.lineUserId + Account both match) STILL does 0 writes (regression sentinel)", async () => {
    // Negative companion: the extract MUST NOT make the idempotent
    // fast-path accidentally invoke runAccountOnlyRepairTx or any tx.
    mockCustomerFindUnique.mockResolvedValueOnce(repairFixture());
    mockAccountFindUnique.mockResolvedValueOnce({ userId: USER_ID });

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "already_synced",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("structural assertion: the repair branch and the full-bind branch invoke DIFFERENT tx shapes (full bind = updateMany + account.create; repair = account.create only)", async () => {
    // Direct structural property: repair tx has 1 write (account only),
    // full bind tx has 2 writes (customer updateMany + account create).
    // Asserting the shape difference here makes any future "merge them
    // back" refactor a visible diff in CI rather than a silent regression.
    //
    // (a) repair path
    mockCustomerFindUnique.mockResolvedValueOnce(repairFixture());
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const repair = setupTransaction();
    await bindLineToExistingCustomerById(makeValidInput());
    expect(repair.txAccountCreate).toHaveBeenCalledTimes(1);
    expect(repair.txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(repair.txCustomerUpdateMany).toHaveBeenCalledTimes(0);

    // (b) full bind path — reset mocks first
    mockCustomerFindUnique.mockReset();
    mockAccountFindUnique.mockReset();
    mockTx.mockReset();
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const full = setupTransaction();
    await bindLineToExistingCustomerById(makeValidInput());
    expect(full.txAccountCreate).toHaveBeenCalledTimes(1);
    expect(full.txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(full.txCustomerUpdateMany).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 13. P2 round 3 (PR #242 Codex): explicit dispatch + defensive invariant guard
// ════════════════════════════════════════════════════════════════════════════
//
// Round 2 extracted the Account-only repair tx into a sibling private
// function. Codex pointed back at the still-co-located full-bind
// `customer.update` data block (now lines ~660) and asked for the
// structure to make it IMPOSSIBLE — both at the type system and at
// runtime — for the repair path to reach the full-bind block.
//
// Round 3 fix:
//   (1) Repair branch + customer_locked branch + already_synced branch
//       all live inside a single outer `if (customer.lineUserId !== null)`
//       block whose every code path returns. TypeScript narrows
//       `customer.lineUserId` to `null` after this block — so by the
//       type system, step 6's full-bind tx only runs for an unlinked
//       customer.
//   (2) A defensive runtime guard (`throw new Error("...invariant
//       violation...")`) sits immediately before the full-bind tx, cast
//       around TS's narrow so the check actually runs. In correct code
//       this throw is provably unreachable — its purpose is regression-
//       protection: if a future refactor deletes one of the early
//       returns, control falls into the throw rather than silently
//       overwriting historical Customer link metadata.
//
// The tests below pin both properties. The source-structure regression
// tests would fail if anyone deletes either the `return
// runAccountOnlyRepairTx(...)` statement OR the invariant-throw guard,
// even before the behavioral mock tests would catch the regression.

describe("P2 round 3 (Codex): structural invariants on dispatch + full-bind guard", () => {
  // Resolve the helper path relative to this test file so the assertion
  // survives both vitest workspace roots and direct `npx vitest run`.
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );
  const helperSrc = readFileSync(HELPER_PATH, "utf8");

  it("repair branch exits via an unconditional `return runAccountOnlyRepairTx(...)`", () => {
    // Match `return runAccountOnlyRepairTx(` with optional whitespace.
    // If a future refactor turns this into `await runAccountOnlyRepairTx(...)`
    // without a return (so control falls through), or deletes the line
    // entirely, this assertion fails — and round-3's metadata-preservation
    // contract is broken structurally before any behavioral test runs.
    expect(helperSrc).toMatch(/return\s+runAccountOnlyRepairTx\s*\(/);
  });

  it("the `return runFullBindTx(...)` dispatch in the main helper is preceded by a defensive invariant guard (PR #242 Codex P2 round 4)", () => {
    // Scope to the main helper body only.
    const helperStart = helperSrc.indexOf(
      "export async function bindLineToExistingCustomerById",
    );
    expect(helperStart).toBeGreaterThan(-1);
    // End at the closing brace of the main helper (located by finding
    // the next top-level `\n}\n` followed by a blank line).
    const helperBody = helperSrc.slice(helperStart);
    const mainHelperEndIdx = helperBody.search(/\n}\n\n/);
    expect(mainHelperEndIdx).toBeGreaterThan(-1);
    const mainHelperBody = helperBody.slice(0, mainHelperEndIdx);

    // Locate the full-bind dispatch. The defensive guard `throw new
    // Error(...invariant violation...)` MUST appear in the source text
    // between the dispatch block and this dispatch. If someone removes
    // the guard, this assertion fails.
    const dispatchIdx = mainHelperBody.indexOf("return runFullBindTx(");
    expect(dispatchIdx).toBeGreaterThan(-1);

    // The guard sits within ~2 KB above the dispatch in the source.
    const precedingWindow = mainHelperBody.slice(
      Math.max(0, dispatchIdx - 2000),
      dispatchIdx,
    );
    expect(precedingWindow).toMatch(/throw new Error/);
    expect(precedingWindow).toMatch(/invariant violation/i);
    expect(precedingWindow).toMatch(/customer\.lineUserId/);
    // Defense-in-depth: ensure the guard references the helper name so
    // greppable ops error logs surface usefully.
    expect(precedingWindow).toMatch(/bindLineToExistingCustomerById/);
  });

  it("the main helper body contains ZERO `tx.customer.update` calls — full-bind metadata write is fully extracted into runFullBindTx (PR #242 Codex P2 round 4)", () => {
    // The new structure isolates the full-bind tx into runFullBindTx,
    // and the Account-only repair tx into runAccountOnlyRepairTx.
    // The main helper is pure dispatch: ZERO tx.customer.update calls.
    //
    // Scan strictly the main helper body (between the function
    // declaration and its closing brace).
    const helperStart = helperSrc.indexOf(
      "export async function bindLineToExistingCustomerById",
    );
    expect(helperStart).toBeGreaterThan(-1);
    const afterDecl = helperSrc.slice(helperStart);
    const mainHelperEndIdx = afterDecl.search(/\n}\n\n/);
    expect(mainHelperEndIdx).toBeGreaterThan(-1);
    const mainHelperBody = afterDecl.slice(0, mainHelperEndIdx);

    // No tx.customer.update anywhere in the main helper body — not even
    // in a comment (sanitised previously).
    expect(mainHelperBody).not.toMatch(/tx\.customer\.update/);
  });

  it("runAccountOnlyRepairTx body contains ZERO references to forbidden Customer write field names", () => {
    // Sibling-fn invariant from round 2, re-asserted as a structural
    // regression test that lives next to round-3 assertions.
    const fnStart = helperSrc.indexOf(
      "async function runAccountOnlyRepairTx",
    );
    expect(fnStart).toBeGreaterThan(-1);
    // Find the matching close brace at column 0 (function declaration).
    const after = helperSrc.slice(fnStart);
    const fnEndRelative = after.indexOf("\n}\n");
    expect(fnEndRelative).toBeGreaterThan(-1);
    const fnBody = after.slice(0, fnEndRelative);

    const FORBIDDEN_IN_REPAIR = [
      "customer.update",
      "tx.customer",
      "lineLinkedAt",
      "lineName",
      "lineLinkStatus",
    ];
    for (const needle of FORBIDDEN_IN_REPAIR) {
      expect(
        fnBody,
        `runAccountOnlyRepairTx body must not mention "${needle}"`,
      ).not.toContain(needle);
    }
  });

  // ── Behavioural confirmation of the structural invariants ──────────────

  it("repair scenario: full-bind tx callback is NEVER invoked (only repair tx callback runs)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID, // already linked
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null); // Account missing
    const { txCustomerUpdate, txAccountCreate } = setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("account_repaired");
    // Even though `setupTransaction` would have routed customer.update
    // through the mocked tx had it been called, the helper's repair
    // path returned before reaching the full-bind tx. Zero customer
    // writes is the contract.
    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
    // Account write happened inside the repair tx.
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("repair scenario: $transaction is invoked at most once (single tx — the repair tx), never twice", async () => {
    // A regression where the repair path falls through into the full-bind
    // tx would surface as $transaction being called twice: once by the
    // repair, once by the full-bind. Lock this property.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    setupTransaction();

    await bindLineToExistingCustomerById(makeValidInput());

    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it("full-bind branch runs ONLY when customer.lineUserId === null (regression sentinel for the defensive throw guard; updated for P1 round 1 updateMany)", async () => {
    // Direct expression of the invariant: full bind runs ⇔ unlinked.
    // (a) lineUserId === null → tx ran with updateMany + account.create
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null, // unlinked → full bind
      lineLinkStatus: "UNLINKED",
    });
    const unlinked = setupTransaction();
    await bindLineToExistingCustomerById(makeValidInput());
    expect(unlinked.txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(unlinked.txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(unlinked.txAccountCreate).toHaveBeenCalledTimes(1);

    // (b) lineUserId !== null (same-line, no Account) → repair only, NO
    //     Customer writes of any kind. The defensive throw guard
    //     structurally enforces this property.
    mockCustomerFindUnique.mockReset();
    mockAccountFindUnique.mockReset();
    mockTx.mockReset();
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const linked = setupTransaction();
    await bindLineToExistingCustomerById(makeValidInput());
    expect(linked.txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(linked.txCustomerUpdateMany).toHaveBeenCalledTimes(0);
    expect(linked.txAccountCreate).toHaveBeenCalledTimes(1);

    // (c) lineUserId !== null (different line) → customer_locked, 0 tx
    mockCustomerFindUnique.mockReset();
    mockAccountFindUnique.mockReset();
    mockTx.mockReset();
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: OTHER_LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    const locked = setupTransaction();
    const r = await bindLineToExistingCustomerById(makeValidInput());
    expect(r.status).toBe("customer_locked");
    expect(locked.txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(locked.txCustomerUpdateMany).toHaveBeenCalledTimes(0);
    expect(locked.txAccountCreate).toHaveBeenCalledTimes(0);
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("already_synced (linked-same + Account present) still returns BEFORE step 6 — 0 writes, 0 tx", async () => {
    // Regression sentinel: the new dispatch structure must not regress
    // the idempotent fast-path.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce({ userId: USER_ID });

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "already_synced",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 14. P2 round 4 (PR #242 Codex): metadata writes isolated to runFullBindTx
// ════════════════════════════════════════════════════════════════════════════
//
// Round 3 left the full-bind `tx.customer.update` data block inline in
// `bindLineToExistingCustomerById`. Codex re-review pointed at those
// inline lines and asked for the metadata write block to be moved into
// its own sibling private function so the main helper cannot share a
// tx body with the repair path under any future refactor.
//
// Round 4 extracts `runFullBindTx` as a sibling of `runAccountOnlyRepairTx`.
// The main helper becomes pure dispatch — no `tx.customer.update`, no
// inline metadata field writes. These tests pin the ownership
// structurally so a future refactor that re-inlines the data block
// fails CI before any behavioural test runs.

describe("P2 round 4 (Codex): metadata writes live ONLY inside runFullBindTx", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );
  const helperSrc = readFileSync(HELPER_PATH, "utf8");

  function extractFn(declarationLine: string): string {
    const start = helperSrc.indexOf(declarationLine);
    expect(start, `declaration not found: ${declarationLine}`).toBeGreaterThan(
      -1,
    );
    const after = helperSrc.slice(start);
    const endRel = after.indexOf("\n}\n");
    expect(
      endRel,
      `end of function not found: ${declarationLine}`,
    ).toBeGreaterThan(-1);
    return after.slice(0, endRel + 2);
  }

  const mainHelperBody = extractFn(
    "export async function bindLineToExistingCustomerById",
  );
  const repairFnBody = extractFn("async function runAccountOnlyRepairTx");
  const fullBindFnBody = extractFn("async function runFullBindTx");

  it("runFullBindTx body contains exactly ONE `tx.customer.updateMany` call (the SINGLE TOCTOU-safe full-bind metadata write site; PR #242 Codex P1 round 1)", () => {
    // After P1 round 1, full-bind uses `updateMany` with a conditional
    // `where: { lineUserId: null }` so a racing concurrent binder can
    // never overwrite a Customer that another binder already linked.
    const updateManyMatches =
      fullBindFnBody.match(/tx\.customer\.updateMany/g) ?? [];
    expect(updateManyMatches.length).toBe(1);
    // Plain `tx.customer.update` MUST NOT appear — would re-introduce
    // the TOCTOU vulnerability described in P1 round 1.
    const plainUpdateMatches =
      fullBindFnBody.match(/tx\.customer\.update[^M]/g) ?? [];
    expect(plainUpdateMatches.length).toBe(0);
  });

  it("runFullBindTx body contains the four full-bind metadata field-write expressions (still inside the updateMany data block)", () => {
    expect(fullBindFnBody).toMatch(/lineUserId\s*:\s*params\.lineUserId/);
    expect(fullBindFnBody).toMatch(/lineName\s*:\s*params\.lineName/);
    expect(fullBindFnBody).toMatch(/lineLinkStatus\s*:\s*"LINKED"/);
    expect(fullBindFnBody).toMatch(/lineLinkedAt\s*:\s*new\s+Date\(\)/);
  });

  it("runFullBindTx body contains the TOCTOU-safe conditional where clause (`lineUserId: null` + storeId + userId + id)", () => {
    // PR #242 Codex P1 round 1: the where clause must restrict the
    // update to rows that are STILL unlinked at tx-write time. The
    // four predicates pin: identity, store, user, link-state.
    expect(fullBindFnBody).toMatch(/id\s*:\s*params\.customerId/);
    expect(fullBindFnBody).toMatch(/storeId\s*:\s*params\.storeId/);
    expect(fullBindFnBody).toMatch(/userId\s*:\s*params\.userId/);
    expect(fullBindFnBody).toMatch(/lineUserId\s*:\s*null/);
  });

  it("runFullBindTx checks `result.count !== 1` and throws StaleCustomerLinkError on stale link state", () => {
    // The sentinel-throw pattern: if updateMany affected 0 rows
    // (another binder won the race), Account.create MUST NOT run.
    expect(fullBindFnBody).toMatch(/result\.count\s*!==\s*1/);
    expect(fullBindFnBody).toMatch(/throw\s+new\s+StaleCustomerLinkError\s*\(/);
  });

  it("main helper body contains ZERO full-bind write expressions (writes fully extracted; both `update` and `updateMany` absent)", () => {
    // Value-anchored patterns — avoids false positives on the read-only
    // `select: { lineLinkStatus: true }` clause in step 2.
    expect(mainHelperBody).not.toMatch(/tx\.customer\.update/);
    expect(mainHelperBody).not.toMatch(/tx\.customer\.updateMany/);
    expect(mainHelperBody).not.toMatch(/lineLinkStatus\s*:\s*"LINKED"/);
    expect(mainHelperBody).not.toMatch(/lineLinkedAt\s*:\s*new\s+Date\(\)/);
  });

  it("runAccountOnlyRepairTx body contains ZERO full-bind write expressions (repair path cannot share the full-bind tx body; both `update` and `updateMany` absent)", () => {
    expect(repairFnBody).not.toMatch(/tx\.customer\.update/);
    expect(repairFnBody).not.toMatch(/tx\.customer\.updateMany/);
    expect(repairFnBody).not.toMatch(/lineLinkStatus\s*:\s*"LINKED"/);
    expect(repairFnBody).not.toMatch(/lineLinkedAt\s*:\s*new\s+Date\(\)/);
    expect(repairFnBody).not.toMatch(/lineName\s*:/);
    expect(repairFnBody).not.toMatch(/tx\.customer/);
  });

  it("main helper dispatches to BOTH sibling functions via explicit `return` statements", () => {
    expect(mainHelperBody).toMatch(/return\s+runAccountOnlyRepairTx\s*\(/);
    expect(mainHelperBody).toMatch(/return\s+runFullBindTx\s*\(/);
  });

  it("`return runFullBindTx(...)` is the only call site of runFullBindTx in the file (no other callers leak)", () => {
    // 1 call site in the main helper + the function declaration ⇒ 2
    // occurrences of `runFullBindTx(`.
    const callSites = helperSrc.match(/\brunFullBindTx\s*\(/g) ?? [];
    expect(callSites.length).toBe(2);
  });

  it("runFullBindTx and runAccountOnlyRepairTx do NOT reference each other (disjoint tx shapes)", () => {
    expect(fullBindFnBody).not.toMatch(/runAccountOnlyRepairTx\s*\(/);
    expect(repairFnBody).not.toMatch(/runFullBindTx\s*\(/);
  });

  // ── Behavioural sentinels under the new structure ──────────────────────

  it("behavioural: first-time bind goes through runFullBindTx — Customer updateMany + Account both written in one tx (P1 round 1)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const { txCustomerUpdate, txCustomerUpdateMany, txAccountCreate } =
      setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("bound_existing");
    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it("behavioural: repair path goes through runAccountOnlyRepairTx — Account-only, never invokes full-bind metadata block", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerUpdate, txAccountCreate } = setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("account_repaired");
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it("behavioural: P2034 surfaces from runFullBindTx as write_conflict (translator still wired through the extracted function)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    mockTx.mockImplementationOnce(async () => {
      const err: Error & { code?: string } = new Error(
        "Transaction failed due to a write conflict or a deadlock",
      );
      err.code = "P2034";
      throw err;
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({ status: "write_conflict", code: "P2034" });
  });

  it("behavioural: P2002 surfaces from runFullBindTx as unique_conflict (translator still wired through the extracted function)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    mockTx.mockImplementationOnce(async () => {
      const err: Error & { code?: string; meta?: { target?: string[] } } =
        new Error("Unique constraint failed");
      err.code = "P2002";
      err.meta = { target: ["provider", "providerAccountId"] };
      throw err;
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "unique_conflict",
      conflictTarget: "provider,providerAccountId",
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 15. P1 round 1 (PR #242 Codex): conditional updateMany + stale_customer_link
// ════════════════════════════════════════════════════════════════════════════
//
// Codex flagged a TOCTOU race in the full-bind path:
//
//   1. Binder A and Binder B both read customer.lineUserId === null
//      (preflight, outside any tx).
//   2. Binder A enters its tx, sets Customer.lineUserId = LINE-A,
//      commits, plus Account[provider="line", providerAccountId=LINE-A].
//   3. Binder B enters its tx; `tx.customer.update({ where: { id } })`
//      matches by id alone and silently overwrites Customer.lineUserId
//      to LINE-B.
//   4. Both Account rows can coexist because Account unique is
//      `(provider, providerAccountId)` and the providerAccountIds differ.
//
// Fix: runFullBindTx now uses `tx.customer.updateMany` with a
// conditional where:
//     where: { id, storeId, userId, lineUserId: null }
// If the second binder enters after the first commits, the where matches
// 0 rows. We then throw a `StaleCustomerLinkError` sentinel inside the
// tx callback to roll back (no Account.create runs); the catch arm
// translates the sentinel into a `stale_customer_link` status. Caller
// can retry — the next invocation observes the linked state and routes
// to `already_synced` / `account_repaired` / `customer_locked`.

describe("P1 round 1 (Codex): conditional Customer update + stale_customer_link status", () => {
  it("stale race: updateMany returns count=0 → helper returns stale_customer_link; Account.create NOT called; tx rolls back", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null, // preflight reads unlinked
      lineLinkStatus: "UNLINKED",
    });

    // Simulate: another binder won the race in the preflight→tx window.
    // updateMany's conditional where (lineUserId: null) matches 0 rows.
    const txCustomerUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const txAccountCreate = vi.fn().mockResolvedValue({ id: "should-not-run" });
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          customer: {
            update: vi.fn(),
            updateMany: txCustomerUpdateMany,
          },
          account: { create: txAccountCreate },
        };
        // Realistic Prisma: when callback throws, $transaction rejects.
        try {
          return await cb(tx);
        } catch (e) {
          throw e;
        }
      },
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    // Controlled status — no uncaught throw.
    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    // updateMany was attempted (count 0); Account.create gated off.
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(0);
    // Masked log fired once.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("stale race: updateMany where-clause includes the lineUserId: null predicate (the actual race protection)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const { txCustomerUpdateMany } = setupTransaction();

    await bindLineToExistingCustomerById(makeValidInput());

    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    const where = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    })?.where;
    expect(where).toEqual({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null, // ← the TOCTOU-safe predicate
    });
  });

  it("two-binder simulation: A binds successfully, B sees stale state and does NOT overwrite Customer.lineUserId", async () => {
    // Binder A: classic happy-path, full-bind succeeds.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null, // both A and B see null in preflight
      lineLinkStatus: "UNLINKED",
    });
    const binderA = setupTransaction();
    const rA = await bindLineToExistingCustomerById(makeValidInput());
    expect(rA.status).toBe("bound_existing");
    expect(binderA.txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(binderA.txAccountCreate).toHaveBeenCalledTimes(1);

    // Reset for Binder B. B's preflight ALSO read null (the race
    // condition); but by the time B enters its tx, the row is no
    // longer unlinked — updateMany returns count: 0.
    mockCustomerFindUnique.mockReset();
    mockAccountFindUnique.mockReset();
    mockTx.mockReset();

    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null, // B's preflight saw null too — TOCTOU window
      lineLinkStatus: "UNLINKED",
    });
    const binderB_updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const binderB_accountCreate = vi.fn();
    const binderB_plainUpdate = vi.fn();
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          customer: {
            update: binderB_plainUpdate, // must not be called
            updateMany: binderB_updateMany,
          },
          account: { create: binderB_accountCreate },
        };
        try {
          return await cb(tx);
        } catch (e) {
          throw e;
        }
      },
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Use a DIFFERENT lineUserId for B (the realistic race: two distinct
    // OAuth flows for two different LINE accounts on the same Customer).
    const rB = await bindLineToExistingCustomerById(
      makeValidInput({ lineUserId: OTHER_LINE_USER_ID, lineName: "LINE B" }),
    );

    expect(rB).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    // B never overwrote anything: plain update never called,
    // updateMany matched 0 rows, account.create gated off.
    expect(binderB_plainUpdate).not.toHaveBeenCalled();
    expect(binderB_updateMany).toHaveBeenCalledTimes(1);
    expect(binderB_accountCreate).not.toHaveBeenCalled();
  });

  it("happy path: updateMany returns count=1 → Account.create called → bound_existing", async () => {
    // Regression sentinel: the conditional updateMany must not break
    // the normal full-bind path when no race occurs.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const { txCustomerUpdateMany, txAccountCreate } = setupTransaction();
    // setupTransaction defaults txCustomerUpdateMany to { count: 1 }.

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "bound_existing",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("P2034 from updateMany itself (Serializable race detected by Postgres) still translates to write_conflict — not stale_customer_link", async () => {
    // Two distinct race modes can produce different statuses:
    //   - DB-level Serializable serialization failure (P2034)
    //       → translateAtomicLineBindTxError → write_conflict
    //   - App-level TOCTOU (count !== 1)
    //       → StaleCustomerLinkError sentinel → stale_customer_link
    // This test pins the dispatch between them.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const txCustomerUpdateMany = vi.fn().mockImplementationOnce(async () => {
      const err: Error & { code?: string } = new Error(
        "Transaction failed due to a write conflict or a deadlock",
      );
      err.code = "P2034";
      throw err;
    });
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          customer: {
            update: vi.fn(),
            updateMany: txCustomerUpdateMany,
          },
          account: { create: vi.fn() },
        };
        return cb(tx);
      },
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({ status: "write_conflict", code: "P2034" });
  });

  it("P2002 from updateMany ((storeId, lineUserId) conflict with another store?) translates to unique_conflict — not stale_customer_link", async () => {
    // Another race mode: another Customer in same store concurrently
    // claims this lineUserId. updateMany fails with P2002. Should NOT
    // be confused with stale_customer_link.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const txCustomerUpdateMany = vi.fn().mockImplementationOnce(async () => {
      const err: Error & { code?: string; meta?: { target?: string[] } } =
        new Error("Unique constraint failed");
      err.code = "P2002";
      err.meta = { target: ["storeId", "lineUserId"] };
      throw err;
    });
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          customer: {
            update: vi.fn(),
            updateMany: txCustomerUpdateMany,
          },
          account: { create: vi.fn() },
        };
        return cb(tx);
      },
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "unique_conflict",
      conflictTarget: "storeId,lineUserId",
    });
  });

  it("stale_customer_link log payload is masked (no raw IDs)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const txCustomerUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          customer: { update: vi.fn(), updateMany: txCustomerUpdateMany },
          account: { create: vi.fn() },
        };
        try {
          return await cb(tx);
        } catch (e) {
          throw e;
        }
      },
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await bindLineToExistingCustomerById(makeValidInput());

    const dumped = warnSpy.mock.calls
      .flat()
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join("\n");
    // Raw IDs must NEVER appear.
    expect(dumped).not.toContain(STORE_ID);
    expect(dumped).not.toContain(CUSTOMER_ID);
    expect(dumped).not.toContain(USER_ID);
    expect(dumped).not.toContain(LINE_USER_ID);
    // Masked forms must appear.
    expect(dumped).toContain("stale_customer_link");
    expect(dumped).toContain("store-****");
    expect(dumped).toContain("ckcust****");
    expect(dumped).toContain("ckuser****");
    expect(dumped).toContain("U123****ef");

    warnSpy.mockRestore();
  });

  it("Account-only repair path is UNAFFECTED by the P1 round 1 refactor — still no Customer writes of any kind", async () => {
    // Cross-check: the P1 round 1 changes are confined to runFullBindTx.
    // The repair branch must remain pure-Account-write.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID, // linked-same
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null); // missing Account
    const { txCustomerUpdate, txCustomerUpdateMany, txAccountCreate } =
      setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("account_repaired");
    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(0);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });
});
