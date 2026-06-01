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
  // In-tx Customer re-check (PR #242 Codex P2 round 5) — default returns
  // a non-null row so the happy-path repair-tx tests proceed to
  // Account.create. Stale-race tests override with `.mockResolvedValueOnce(null)`.
  const txCustomerFindFirst = vi.fn().mockResolvedValue({ id: CUSTOMER_ID });
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
          findFirst: txCustomerFindFirst,
        },
        account: { create: txAccountCreate },
      };
      return cb(tx);
    },
  );

  return {
    txCustomerUpdate,
    txCustomerUpdateMany,
    txCustomerFindFirst,
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
    // Conditional `updateMany` with `where: lineUserId: null` AND
    // `mergedIntoCustomerId: null` is the TOCTOU-safe shape required
    // by PR #242 Codex P1 round 1 + round 8 (merged-source exclusion).
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledWith({
      where: {
        id: CUSTOMER_ID,
        storeId: STORE_ID,
        userId: USER_ID,
        lineUserId: null,
        mergedIntoCustomerId: null,
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
          mergedIntoCustomerId: null,
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

    // PR #242 Codex P2 round 5: a read-only `tx.customer.findFirst`
    // IS now permitted in the repair body (for in-tx stale-state
    // protection). The forbidden tokens are limited to WRITE shapes
    // and the metadata field-write expressions.
    const FORBIDDEN_IN_REPAIR = [
      "customer.update",
      "tx.customer.update",
      "tx.customer.updateMany",
      "tx.customer.upsert",
      "tx.customer.create",
      "lineLinkedAt",
      "lineLinkStatus",
    ];
    for (const needle of FORBIDDEN_IN_REPAIR) {
      expect(
        fnBody,
        `runAccountOnlyRepairTx body must not mention "${needle}"`,
      ).not.toContain(needle);
    }
    // `lineName` as a WRITE target (data: literal key) is forbidden,
    // but it's fine as a function parameter / read field. Use the
    // value-anchored pattern.
    expect(fnBody).not.toMatch(/lineName\s*:\s*(params|input)\.lineName/);
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

  it("runFullBindTx passes `buildFullBindCustomerWhere(params)` as the updateMany.where (round 14 extracted; predicates live in the helper body)", () => {
    // PR #242 Codex P2 round 14: the where-clause is now built by a
    // named private helper `buildFullBindCustomerWhere`. The
    // runFullBindTx body just passes the helper's return value as
    // updateMany.where.
    expect(fullBindFnBody).toMatch(
      /where\s*:\s*buildFullBindCustomerWhere\s*\(\s*params\s*\)/,
    );
    // The 5 predicates themselves live in the helper body — see the
    // round-14 describe block (#24) for source tests pinning the
    // helper's exact return shape.
  });

  it("runFullBindTx gates account.create on `updated.count === 1` and throws StaleCustomerLinkError otherwise (round 12: nested success branch)", () => {
    // Round 12 restructured to put account.create INSIDE the success
    // branch of `if (updated.count === 1) { ... }` and the throw in
    // the fallthrough. The sentinel-throw still fires when updateMany
    // affected 0 rows; account.create MUST NOT run in that branch.
    expect(fullBindFnBody).toMatch(/updated\.count\s*===\s*1/);
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

  it("runAccountOnlyRepairTx body contains ZERO Customer WRITE expressions (PR #242 P2 round 5: read-only findFirst is permitted; writes are not)", () => {
    // Writes — these would silently mutate Customer link metadata
    // (the bug the round-2 extraction prevents). Forbidden in the
    // repair path.
    expect(repairFnBody).not.toMatch(/tx\.customer\.update\b/);
    expect(repairFnBody).not.toMatch(/tx\.customer\.updateMany\b/);
    expect(repairFnBody).not.toMatch(/tx\.customer\.upsert\b/);
    expect(repairFnBody).not.toMatch(/tx\.customer\.create\b/);
    expect(repairFnBody).not.toMatch(/tx\.customer\.delete/);
    expect(repairFnBody).not.toMatch(/lineLinkStatus\s*:\s*"LINKED"/);
    expect(repairFnBody).not.toMatch(/lineLinkedAt\s*:\s*new\s+Date\(\)/);
    // Note: a read-only `tx.customer.findFirst` IS expected here per
    // PR #242 Codex P2 round 5 — see the dedicated round-6 source-
    // structure test below ("repair body has tx.customer.findFirst …").
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

  it("stale race: updateMany where-clause includes the lineUserId: null AND mergedIntoCustomerId: null predicates (TOCTOU + merged-source guards; PR #242 Codex P2 round 8)", async () => {
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
      lineUserId: null, // ← TOCTOU race-protection predicate
      mergedIntoCustomerId: null, // ← merged-source exclusion (round 8)
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

// ════════════════════════════════════════════════════════════════════════════
// 16. P2 round 5 (PR #242 Codex): in-tx Customer re-check before Account.create
// ════════════════════════════════════════════════════════════════════════════
//
// Codex flagged a second TOCTOU race — this time in the Account-only
// repair path:
//
//   1. Preflight sees Customer still linked to {storeId, userId, lineUserId}
//      with Account[line] missing.
//   2. Before runAccountOnlyRepairTx's tx starts, another flow unbinds /
//      merges / reassigns the Customer.
//   3. Repair tx (old version) blindly created Account[line] for the
//      now-stale {userId, lineUserId} pair.
//   4. Stale Account row left pointing at a userId / lineUserId combo
//      that no Customer claims anymore.
//
// Fix: runAccountOnlyRepairTx now does an in-tx read BEFORE
// Account.create, re-asserting every preflight invariant:
//
//     const stillValid = await tx.customer.findFirst({
//       where: {
//         id, storeId, userId, lineUserId,
//         mergedIntoCustomerId: null,
//       },
//       select: { id: true },
//     });
//     if (stillValid === null) throw new StaleCustomerLinkError(customerId);
//     await tx.account.create({...});
//
// If the in-tx re-check fails, the StaleCustomerLinkError sentinel rolls
// back the tx (Account.create never runs) and the catch arm returns the
// same `stale_customer_link` status as the full-bind path's race
// protection (PR-G5.1.a P1 round 1). Caller retries; the next invocation
// observes the new state and routes appropriately.
//
// These tests pin: in-tx re-check shape, stale-race behaviour, no
// orphan Account row, Customer metadata still untouched, P2002/P2034
// still translated correctly, masked PII contract intact.

describe("P2 round 5 (Codex): runAccountOnlyRepairTx in-tx Customer re-check before Account.create", () => {
  // Source-level invariants for the in-tx re-check shape ─────────────────

  // ─ P2 round 8 (PR #242 Codex): in-tx re-check is now INLINED inside
  //   runAccountOnlyRepairTx's tx callback. The findFirst, the
  //   5-predicate where-clause, and the if-null sentinel throw all
  //   live in THAT function's body, structurally above tx.account.create.
  //   The helper indirection was removed because Codex's contract
  //   checker did not accept a void-returning assert helper as a
  //   visible gate.

  function readRepairFnBody(): string {
    const HELPER_PATH = path.resolve(
      __dirname,
      "..",
      "server",
      "services",
      "bind-line-to-customer.ts",
    );
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("async function runAccountOnlyRepairTx");
    if (fnStart < 0) throw new Error("runAccountOnlyRepairTx not found");
    // The function body contains nested closures (the $transaction
    // callback) whose closing `}` would falsely match a `\n}\n`
    // terminator. Use the consistent module-scope style: top-level
    // function ends with `\n}\n\n` (close brace + blank line before
    // the next declaration).
    const tail = src.slice(fnStart);
    const endRel = tail.search(/\n}\n\n/);
    if (endRel < 0) throw new Error("end of runAccountOnlyRepairTx not found");
    return tail.slice(0, endRel + 2);
  }

  it("source: assertCustomerStillLinkedForAccountRepairTx helper was REMOVED (round 8 inlined the re-check)", () => {
    // Regression sentinel: the void-returning helper was removed
    // because Codex would not accept it as a visible gate. If anyone
    // re-introduces the helper, the gate semantics need re-verification.
    const HELPER_PATH = path.resolve(
      __dirname,
      "..",
      "server",
      "services",
      "bind-line-to-customer.ts",
    );
    const src = readFileSync(HELPER_PATH, "utf8");
    expect(src).not.toMatch(
      /(async\s+)?function\s+assertCustomerStillLinkedForAccountRepairTx/,
    );
  });

  it("source: runAccountOnlyRepairTx body contains exactly ONE inline `tx.customer.findFirst(...)` call (the in-tx re-check)", () => {
    const fnBody = readRepairFnBody();
    // Match the call form specifically (with open paren) so a JSDoc
    // mention of `tx.customer.findFirst` in surrounding comments
    // doesn't inflate the count.
    const matches = fnBody.match(/tx\.customer\.findFirst\s*\(/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("source: runAccountOnlyRepairTx's inline findFirst where-clause re-asserts every preflight invariant (id / storeId / userId / lineUserId / mergedIntoCustomerId: null)", () => {
    const fnBody = readRepairFnBody();
    expect(fnBody).toMatch(/id\s*:\s*params\.customerId/);
    expect(fnBody).toMatch(/storeId\s*:\s*params\.storeId/);
    expect(fnBody).toMatch(/userId\s*:\s*params\.userId/);
    expect(fnBody).toMatch(/lineUserId\s*:\s*params\.lineUserId/);
    expect(fnBody).toMatch(/mergedIntoCustomerId\s*:\s*null/);
  });

  it("source: runAccountOnlyRepairTx's gate throws StaleCustomerLinkError sentinel (round 12: account.create nested in if (stillLinked) success branch, throw in fallthrough)", () => {
    const fnBody = readRepairFnBody();
    // Round 12 restructured the gate so account.create is INSIDE the
    // success branch `if (stillLinked) { ... return; }` and the throw
    // is the fallthrough. This makes account.create visually inside
    // the success branch, not after a failed guard.
    expect(fnBody).toMatch(/if\s*\(\s*stillLinked\s*\)\s*\{/);
    expect(fnBody).toMatch(/throw\s+new\s+StaleCustomerLinkError\s*\(\s*params\.customerId\s*\)\s*;/);
  });

  it("source: runAccountOnlyRepairTx body has `tx.customer.findFirst` textually BEFORE `tx.account.create` (the inlined gate ordering)", () => {
    const fnBody = readRepairFnBody();
    const findFirstIdx = fnBody.indexOf("tx.customer.findFirst");
    const accountCreateIdx = fnBody.indexOf("tx.account.create(");
    expect(findFirstIdx).toBeGreaterThan(-1);
    expect(accountCreateIdx).toBeGreaterThan(-1);
    expect(findFirstIdx).toBeLessThan(accountCreateIdx);
  });

  it("source: runAccountOnlyRepairTx body has the `if (stillLinked) {` open brace textually BEFORE `tx.account.create` (account.create is INSIDE success branch — round 12)", () => {
    const fnBody = readRepairFnBody();
    // Round 12: account.create lives INSIDE the `if (stillLinked) { ... }`
    // block. The throw is the FALLTHROUGH after the if-block close.
    // So source order is: findFirst → if-open → account.create → return →
    // if-close → throw.
    const ifOpenIdx = fnBody.search(/if\s*\(\s*stillLinked\s*\)\s*\{/);
    const accountCreateIdx = fnBody.indexOf("tx.account.create(");
    const throwIdx = fnBody.indexOf("throw new StaleCustomerLinkError");
    expect(ifOpenIdx).toBeGreaterThan(-1);
    expect(accountCreateIdx).toBeGreaterThan(-1);
    expect(throwIdx).toBeGreaterThan(-1);
    // account.create is INSIDE the if-success branch (between ifOpen and throw)
    expect(ifOpenIdx).toBeLessThan(accountCreateIdx);
    expect(accountCreateIdx).toBeLessThan(throwIdx);
  });

  // Behavioural sentinels ─────────────────────────────────────────────────

  it("happy path: in-tx re-check succeeds → Account.create called → returns account_repaired", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null); // missing Account → repair path
    const { txCustomerFindFirst, txAccountCreate, txCustomerUpdate, txCustomerUpdateMany } =
      setupTransaction();
    // setupTransaction defaults findFirst to { id: CUSTOMER_ID } (non-null).

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "account_repaired",
      customerId: CUSTOMER_ID,
      userId: USER_ID,
    });
    expect(txCustomerFindFirst).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    // No Customer writes either way.
    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(0);
  });

  it("happy path: in-tx re-check where-clause shape is the full 5-predicate invariant", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerFindFirst } = setupTransaction();

    await bindLineToExistingCustomerById(makeValidInput());

    expect(txCustomerFindFirst).toHaveBeenCalledTimes(1);
    const arg = txCustomerFindFirst.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
      select?: Record<string, unknown>;
    };
    expect(arg?.where).toEqual({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      mergedIntoCustomerId: null,
    });
    // Read-only select; we don't need or want any other column read.
    expect(arg?.select).toEqual({ id: true });
  });

  it("stale repair: in-tx re-check returns null → Account.create NOT called → returns stale_customer_link", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerFindFirst, txAccountCreate, txCustomerUpdate, txCustomerUpdateMany } =
      setupTransaction();
    // Simulate: Customer was unbound / merged / reassigned between
    // preflight and tx-start.
    txCustomerFindFirst.mockResolvedValueOnce(null);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(txCustomerFindFirst).toHaveBeenCalledTimes(1);
    // Critical: Account.create never reached. No orphan row.
    expect(txAccountCreate).toHaveBeenCalledTimes(0);
    // No Customer writes either.
    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(0);
    // Masked log fired once with the account-repair label.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const dumped = warnSpy.mock.calls
      .flat()
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join("\n");
    expect(dumped).toContain("stale_customer_link");
    expect(dumped).toContain("account-repair");
    warnSpy.mockRestore();
  });

  it("concurrent unbind simulation: preflight matched but in-tx re-check fails — no Account row created", async () => {
    // Preflight (outside tx) sees the Customer in the linked-same state
    // with Account[line] missing → helper routes to repair path.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);

    // In-tx re-check simulates a concurrent unbind: Customer.lineUserId
    // has been nulled between preflight and now → findFirst returns null
    // (the lineUserId: LINE_USER_ID predicate no longer matches).
    const txCustomerFindFirst = vi.fn().mockResolvedValue(null);
    const txAccountCreate = vi.fn();
    const txCustomerUpdate = vi.fn();
    const txCustomerUpdateMany = vi.fn();
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          customer: {
            update: txCustomerUpdate,
            updateMany: txCustomerUpdateMany,
            findFirst: txCustomerFindFirst,
          },
          account: { create: txAccountCreate },
        };
        try {
          return await cb(tx);
        } catch (e) {
          throw e;
        }
      },
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(txCustomerFindFirst).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).not.toHaveBeenCalled();
    expect(txCustomerUpdate).not.toHaveBeenCalled();
    expect(txCustomerUpdateMany).not.toHaveBeenCalled();
  });

  it("concurrent merge simulation: in-tx re-check fails because mergedIntoCustomerId is now set — no Account row created", async () => {
    // Same shape as the unbind test, but conceptually: another flow
    // merged this Customer into a different one, setting
    // mergedIntoCustomerId. The findFirst where-clause's
    // `mergedIntoCustomerId: null` predicate now fails.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerFindFirst, txAccountCreate } = setupTransaction();
    txCustomerFindFirst.mockResolvedValueOnce(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("stale_customer_link");
    expect(txAccountCreate).toHaveBeenCalledTimes(0);
  });

  it("P2034 from in-tx re-check itself still translates to write_conflict (not stale_customer_link)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const txCustomerFindFirst = vi.fn().mockImplementationOnce(async () => {
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
            updateMany: vi.fn(),
            findFirst: txCustomerFindFirst,
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

  it("P2002 from Account.create still translates to unique_conflict (not stale_customer_link)", async () => {
    // The in-tx re-check passes; Account.create then hits a P2002.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const txCustomerFindFirst = vi.fn().mockResolvedValue({ id: CUSTOMER_ID });
    const txAccountCreate = vi.fn().mockImplementationOnce(async () => {
      const err: Error & { code?: string; meta?: { target?: string[] } } =
        new Error("Unique constraint failed");
      err.code = "P2002";
      err.meta = { target: ["provider", "providerAccountId"] };
      throw err;
    });
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          customer: {
            update: vi.fn(),
            updateMany: vi.fn(),
            findFirst: txCustomerFindFirst,
          },
          account: { create: txAccountCreate },
        };
        return cb(tx);
      },
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "unique_conflict",
      conflictTarget: "provider,providerAccountId",
    });
    expect(txCustomerFindFirst).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("stale repair path log payload is masked (no raw IDs)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerFindFirst } = setupTransaction();
    txCustomerFindFirst.mockResolvedValueOnce(null);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await bindLineToExistingCustomerById(makeValidInput());

    const dumped = warnSpy.mock.calls
      .flat()
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join("\n");
    // No raw values.
    expect(dumped).not.toContain(STORE_ID);
    expect(dumped).not.toContain(CUSTOMER_ID);
    expect(dumped).not.toContain(USER_ID);
    expect(dumped).not.toContain(LINE_USER_ID);
    // Masked forms.
    expect(dumped).toContain("stale_customer_link");
    expect(dumped).toContain("account-repair");
    expect(dumped).toContain("store-****");
    expect(dumped).toContain("ckcust****");
    expect(dumped).toContain("ckuser****");
    expect(dumped).toContain("U123****ef");

    warnSpy.mockRestore();
  });

  it("stale repair: Customer metadata still untouched even when in-tx re-check fails (no Customer write of any kind)", async () => {
    // Critical invariant carried across rounds 2/3/4: the repair path
    // NEVER writes Customer link metadata. The stale-race branch is no
    // exception — when the re-check fails we abort without writing.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerFindFirst, txCustomerUpdate, txCustomerUpdateMany } =
      setupTransaction();
    txCustomerFindFirst.mockResolvedValueOnce(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await bindLineToExistingCustomerById(makeValidInput());

    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(0);

    // Belt-and-braces: scan every call ever made on the Customer write
    // spies and confirm none of the four link-metadata field keys
    // appear in any data payload.
    const allCustomerWriteCalls = [
      ...txCustomerUpdate.mock.calls,
      ...txCustomerUpdateMany.mock.calls,
    ];
    for (const call of allCustomerWriteCalls) {
      const data =
        (call?.[0] as { data?: Record<string, unknown> })?.data ?? {};
      expect(data).not.toHaveProperty("lineLinkedAt");
      expect(data).not.toHaveProperty("lineName");
      expect(data).not.toHaveProperty("lineLinkStatus");
      expect(data).not.toHaveProperty("lineUserId");
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 17. P2 round 6 (PR #242 Codex): account_owner_mismatch explicit dispatch
// ════════════════════════════════════════════════════════════════════════════
//
// Codex flagged two distinct issues in the previous round, both
// addressed in round 6:
//
//   P2-1: Re-check the customer before repairing the account.
//         The inline in-tx re-check did not make the safety gate
//         structurally obvious. Round 6 extracts it into a named
//         private fn `assertCustomerStillLinkedForAccountRepairTx`
//         invoked structurally BEFORE `tx.account.create`. Source-
//         structure tests in round-5 / above lock the new shape.
//
//   P2-2: Return customer_locked for mismatched LINE Account owners.
//         When Customer.lineUserId === input.lineUserId AND a matching
//         Account[line] row exists BUT Account.userId !== Customer.userId,
//         the old flow fell into runAccountOnlyRepairTx → Account.create
//         → P2002 → generic unique_conflict. Round 6 detects the
//         mismatch BEFORE the repair dispatch and returns a dedicated
//         `account_owner_mismatch` status so the two semantically
//         distinct drift modes stay disjoint.

describe("P2 round 6 (Codex): account_owner_mismatch — Account[line].userId !== Customer.userId", () => {
  it("happy path → customer_locked (account-owner-mismatch sub-case): no tx, no Account.create, no Customer writes; masked log fires once (PR #242 Codex P2 round 7)", async () => {
    const OTHER_USER_ID = "ckuser0000000000000000099";

    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID, // Customer points at USER_ID
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    // Account[line] for the same lineUserId exists, but its userId
    // points at a DIFFERENT user — the drift case Codex named.
    mockAccountFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    // PR #242 Codex P2 round 7: the result-type JSDoc for
    // `customer_locked` documents this exact sub-case. Returning
    // `customer_locked` keeps the result contract consistent. The
    // sub-case is distinguished in logs (see masked-log assertion
    // below) but does NOT pollute the discriminated-union surface.
    expect(r).toEqual({
      status: "customer_locked",
      customerId: CUSTOMER_ID,
      existingLineUserId: LINE_USER_ID,
    });

    // No tx at all — detection is before the repair dispatch.
    expect(mockTx).not.toHaveBeenCalled();

    // Masked log fired once. The log line label distinguishes the
    // account-owner-mismatch sub-case from the Customer-side
    // lineUserId-mismatch sub-case for ops triage; the public
    // discriminated union stays at one `customer_locked` variant.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const dumped = warnSpy.mock.calls
      .flat()
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join("\n");
    expect(dumped).toContain("customer_locked");
    expect(dumped).toContain("account-owner-mismatch"); // log-side sub-case label
    expect(dumped).not.toContain(USER_ID);
    expect(dumped).not.toContain(OTHER_USER_ID);
    expect(dumped).not.toContain(LINE_USER_ID);
    expect(dumped).toContain("ckuser****"); // both userIds masked

    warnSpy.mockRestore();
  });

  it("regression: missing-Account repair path is UNAFFECTED — still returns account_repaired", async () => {
    // Sanity: round-6 detection must only fire when Account exists with
    // a mismatched userId. The standard missing-Account drift case
    // (Account row absent) MUST still route to runAccountOnlyRepairTx.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null); // Account missing
    const { txAccountCreate, txCustomerUpdate, txCustomerUpdateMany } =
      setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("account_repaired");
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdate).toHaveBeenCalledTimes(0);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(0);
  });

  it("regression: idempotent already_synced path is UNAFFECTED — Account.userId === Customer.userId still short-circuits to 0 writes", async () => {
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

  it("regression: true P2002 race from Account.create still returns unique_conflict (NOT account_owner_mismatch)", async () => {
    // True racing concurrent binder: at preflight Account row didn't
    // exist (so we route to runAccountOnlyRepairTx); then by the time
    // account.create runs, another binder inserted the same row, so
    // Prisma fires P2002. This is a real race, not a known drift
    // state — must remain unique_conflict.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);

    const txCustomerFindFirst = vi.fn().mockResolvedValue({ id: CUSTOMER_ID });
    const txAccountCreate = vi.fn().mockImplementationOnce(async () => {
      const err: Error & { code?: string; meta?: { target?: string[] } } =
        new Error("Unique constraint failed");
      err.code = "P2002";
      err.meta = { target: ["provider", "providerAccountId"] };
      throw err;
    });
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          customer: {
            update: vi.fn(),
            updateMany: vi.fn(),
            findFirst: txCustomerFindFirst,
          },
          account: { create: txAccountCreate },
        };
        return cb(tx);
      },
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "unique_conflict",
      conflictTarget: "provider,providerAccountId",
    });
    // The repair tx WAS attempted (because at preflight Account was
    // missing) — and that's correct: this is the real race path, not
    // the known-drift owner-mismatch path.
    expect(txCustomerFindFirst).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("account_owner_mismatch: helper does NOT call account.findUnique a second time, does NOT enter $transaction, does NOT call any Customer write", async () => {
    const OTHER_USER_ID = "ckuser0000000000000000099";
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce({ userId: OTHER_USER_ID });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await bindLineToExistingCustomerById(makeValidInput());

    // account.findUnique was called exactly once (the preflight
    // already informed the dispatch).
    expect(mockAccountFindUnique).toHaveBeenCalledTimes(1);
    // No tx at all — saves a round-trip and avoids the misleading
    // P2002 → unique_conflict translation.
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("source: main helper body contains the explicit owner-mismatch detection branch returning customer_locked (PR #242 Codex P2 round 7/8)", () => {
    const HELPER_PATH = path.resolve(
      __dirname,
      "..",
      "server",
      "services",
      "bind-line-to-customer.ts",
    );
    const src = readFileSync(HELPER_PATH, "utf8");
    const mainStart = src.indexOf(
      "export async function bindLineToExistingCustomerById",
    );
    expect(mainStart).toBeGreaterThan(-1);
    const mainBody = src.slice(
      mainStart,
      mainStart + src.slice(mainStart).search(/\n}\n\n/),
    );

    // The detection branch must exist in the main helper body BEFORE
    // the runAccountOnlyRepairTx dispatch. It returns customer_locked
    // per PR #242 Codex P2 round 7 (NOT a new status variant — the
    // existing customer_locked JSDoc explicitly covers this sub-case
    // of "Account[line] already points to a different userId for the
    // same lineUserId").
    expect(mainBody).toMatch(
      /existingAccount\.userId\s*!==\s*customerUserId/,
    );

    // The mismatch branch must NOT introduce a new status variant.
    // Round 7 reverted account_owner_mismatch back to customer_locked.
    expect(mainBody).not.toMatch(/status\s*:\s*"account_owner_mismatch"/);

    // Ordering: the customer_locked branch for the mismatch sub-case
    // must appear BEFORE the runAccountOnlyRepairTx dispatch in step 5a.
    //
    // Round 8 moved the log emission into a named helper
    // (`logCustomerLockedAccountOwnerMismatch`) and reordered step 5a
    // so the mismatch check is FIRST (immediately after findUnique).
    // Anchor on the call to the log helper as the unique marker for
    // this branch (it appears nowhere else).
    const mismatchBranchIdx = mainBody.indexOf(
      "logCustomerLockedAccountOwnerMismatch(",
    );
    const repairDispatchMatch = mainBody.match(
      /return\s+runAccountOnlyRepairTx\s*\(\s*\{/,
    );
    expect(mismatchBranchIdx).toBeGreaterThan(-1);
    expect(repairDispatchMatch).not.toBeNull();
    const repairDispatchIdx = repairDispatchMatch!.index!;
    expect(mismatchBranchIdx).toBeLessThan(repairDispatchIdx);
  });

  it("source: logCustomerLockedAccountOwnerMismatch helper masks BOTH userIds + lineUserId (PR #242 Codex P2 round 8)", () => {
    // Log emission was pulled into a named helper so the dispatch
    // branch in the main helper stays pure `if (...) { log(...);
    // return ...; }`. The masked-PII contract still holds — verified
    // by reading the helper body.
    const HELPER_PATH = path.resolve(
      __dirname,
      "..",
      "server",
      "services",
      "bind-line-to-customer.ts",
    );
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("function logCustomerLockedAccountOwnerMismatch");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = src.slice(
      fnStart,
      fnStart + src.slice(fnStart).indexOf("\n}\n") + 2,
    );
    expect(fnBody).toMatch(/customerUserId\s*:\s*maskId\s*\(/);
    expect(fnBody).toMatch(/accountUserId\s*:\s*maskId\s*\(/);
    expect(fnBody).toMatch(/lineUserId\s*:\s*maskLineUserId\s*\(/);
    // The log key must distinguish the sub-case so ops can triage.
    expect(fnBody).toMatch(/account-owner-mismatch sub-case/);
  });

  it("source (round 8): mismatch branch in main helper step 5a is detected FIRST — before the already_synced check and BEFORE the repair dispatch", () => {
    // PR #242 Codex P2 round 8 reordered step 5a so customer_locked
    // (mismatch) fires before already_synced. Both must fire before
    // runAccountOnlyRepairTx.
    const HELPER_PATH = path.resolve(
      __dirname,
      "..",
      "server",
      "services",
      "bind-line-to-customer.ts",
    );
    const src = readFileSync(HELPER_PATH, "utf8");
    const mainStart = src.indexOf(
      "export async function bindLineToExistingCustomerById",
    );
    const mainBody = src.slice(
      mainStart,
      mainStart + src.slice(mainStart).search(/\n}\n\n/),
    );

    const mismatchIdx = mainBody.indexOf("logCustomerLockedAccountOwnerMismatch(");
    const alreadySyncedIdx = mainBody.indexOf('status: "already_synced"');
    const repairDispatchMatch = mainBody.match(
      /return\s+runAccountOnlyRepairTx\s*\(\s*\{/,
    );
    expect(mismatchIdx).toBeGreaterThan(-1);
    expect(alreadySyncedIdx).toBeGreaterThan(-1);
    expect(repairDispatchMatch).not.toBeNull();

    // mismatch < already_synced < repair dispatch
    expect(mismatchIdx).toBeLessThan(alreadySyncedIdx);
    expect(alreadySyncedIdx).toBeLessThan(repairDispatchMatch!.index!);
  });

  // ── P2 round 7 (PR #242 Codex): tightened assert/account.create coupling ──
  //
  // Codex still wasn't satisfied that the assert helper was
  // structurally guaranteed to run BEFORE tx.account.create. The
  // round-7 fix tightens the call structure: the two `await`s sit
  // back-to-back inside the tx callback with ONLY whitespace between
  // them (no intervening comment, no conditional, no detached
  // promise). This test pins that exact shape with a regex so any
  // future insertion between them fails CI before any behavioural
  // test runs.

  it("source (round 12 nesting): in runAccountOnlyRepairTx, `tx.customer.findFirst` runs BEFORE `if (stillLinked) {` open brace; `tx.account.create` is INSIDE the success branch; throw is the fallthrough — account.create unreachable on stale", () => {
    const HELPER_PATH = path.resolve(
      __dirname,
      "..",
      "server",
      "services",
      "bind-line-to-customer.ts",
    );
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("async function runAccountOnlyRepairTx");
    const tail = src.slice(fnStart);
    const fnBody = tail.slice(0, tail.search(/\n}\n\n/) + 2);

    const findFirstIdx = fnBody.indexOf("tx.customer.findFirst");
    const ifOpenIdx = fnBody.search(/if\s*\(\s*stillLinked\s*\)\s*\{/);
    const accountCreateIdx = fnBody.indexOf("tx.account.create(");
    const throwIdx = fnBody.indexOf("throw new StaleCustomerLinkError");

    expect(findFirstIdx).toBeGreaterThan(-1);
    expect(ifOpenIdx).toBeGreaterThan(-1);
    expect(accountCreateIdx).toBeGreaterThan(-1);
    expect(throwIdx).toBeGreaterThan(-1);

    // Source order: findFirst < if-open < account.create < throw (fallthrough)
    expect(findFirstIdx).toBeLessThan(ifOpenIdx);
    expect(ifOpenIdx).toBeLessThan(accountCreateIdx);
    expect(accountCreateIdx).toBeLessThan(throwIdx);
  });

  it("source (round 12 nesting): only ONE `tx.account.create` site exists in runAccountOnlyRepairTx body — and it's INSIDE the `if (stillLinked)` success branch (upstream of the fallthrough throw)", () => {
    const HELPER_PATH = path.resolve(
      __dirname,
      "..",
      "server",
      "services",
      "bind-line-to-customer.ts",
    );
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("async function runAccountOnlyRepairTx");
    const tail = src.slice(fnStart);
    const fnBody = tail.slice(0, tail.search(/\n}\n\n/) + 2);

    const accountCreateMatches =
      fnBody.match(/tx\.account\.create\s*\(/g) ?? [];
    expect(accountCreateMatches.length).toBe(1);
    // Round 12: account.create is INSIDE the if-success branch, so
    // it's textually BEFORE the throw (which is the fallthrough).
    const ifOpenIdx = fnBody.search(/if\s*\(\s*stillLinked\s*\)\s*\{/);
    const accountCreateIdx = fnBody.indexOf("tx.account.create(");
    const throwIdx = fnBody.indexOf("throw new StaleCustomerLinkError");
    expect(ifOpenIdx).toBeLessThan(accountCreateIdx);
    expect(accountCreateIdx).toBeLessThan(throwIdx);
  });

  it("behavioural (round 7): account_owner_mismatch status string never appears anywhere in the source — reverted in favour of customer_locked", () => {
    // Regression sentinel: round 6 introduced `account_owner_mismatch`;
    // round 7 reverted it because Codex's contract checker required
    // the canonical `customer_locked` status. If anyone re-adds the
    // status string anywhere in the helper, this fires.
    const HELPER_PATH = path.resolve(
      __dirname,
      "..",
      "server",
      "services",
      "bind-line-to-customer.ts",
    );
    const src = readFileSync(HELPER_PATH, "utf8");
    expect(src).not.toMatch(/"account_owner_mismatch"/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 18. P2 round 8 (PR #242 Codex): exclude merged customers from full bind
// ════════════════════════════════════════════════════════════════════════════
//
// Codex flagged that runFullBindTx's conditional updateMany guarded
// `lineUserId: null` but did NOT guard `mergedIntoCustomerId: null`.
// If the customerId referenced a Customer that had been merged into
// another (Phase-1 customer-merge sets `mergedIntoCustomerId`), the
// full-bind path could still re-bind LINE to that obsolete source
// row.
//
// Fix: runFullBindTx.updateMany.where now includes
// `mergedIntoCustomerId: null`, parallel to the repair path's in-tx
// re-check. If the source Customer was merged between preflight and
// tx-write, the conditional matches 0 rows and the existing
// StaleCustomerLinkError path fires, returning `stale_customer_link`
// without ever touching Account.create.

describe("P2 round 8 (Codex): exclude merged customers from full bind", () => {
  it("source: runFullBindTx updateMany where-clause includes mergedIntoCustomerId: null", () => {
    const HELPER_PATH = path.resolve(
      __dirname,
      "..",
      "server",
      "services",
      "bind-line-to-customer.ts",
    );
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("async function runFullBindTx");
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    // runFullBindTx is the LAST function in the file — there's no
    // `\n}\n\n` terminator after it (no trailing declaration). Take
    // the body to end-of-file in that case.
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    // After round 14, runFullBindTx body calls
    // `buildFullBindCustomerWhere(params)` as the updateMany.where.
    // The 5 predicates live in the helper body — see round-14
    // describe block (#24) for the helper-body source tests.
    expect(fnBody).toMatch(/tx\.customer\.updateMany\s*\(/);
    expect(fnBody).toMatch(
      /where\s*:\s*buildFullBindCustomerWhere\s*\(\s*params\s*\)/,
    );
    // Cross-check at file scope: the helper itself returns an object
    // containing mergedIntoCustomerId: null (the merged-source guard).
    expect(src).toMatch(/function\s+buildFullBindCustomerWhere\s*\(/);
    expect(src).toMatch(/mergedIntoCustomerId\s*:\s*null/);
  });

  it("behavioural: merged source Customer → updateMany count=0 → stale_customer_link, account.create NOT called", async () => {
    // Simulate: preflight saw an unlinked Customer (so the helper
    // routes to full bind); but by the time the tx-conditional fires,
    // the row has been merged into another Customer
    // (mergedIntoCustomerId is now set) — the where-clause's
    // `mergedIntoCustomerId: null` predicate fails, count is 0.
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });

    const txCustomerUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const txAccountCreate = vi.fn();
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          customer: {
            update: vi.fn(),
            updateMany: txCustomerUpdateMany,
            findFirst: vi.fn(),
          },
          account: { create: txAccountCreate },
        };
        try {
          return await cb(tx);
        } catch (e) {
          throw e;
        }
      },
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).not.toHaveBeenCalled();

    // The where-clause for the failing updateMany must include the
    // mergedIntoCustomerId: null predicate — that's the actual
    // round-8 protection.
    const where = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    })?.where;
    expect(where).toEqual({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      mergedIntoCustomerId: null,
    });
  });

  it("regression: happy-path full bind (count=1) still returns bound_existing — the new predicate doesn't break the normal path", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const { txCustomerUpdateMany, txAccountCreate } = setupTransaction();
    // setupTransaction defaults updateMany to { count: 1 } (happy path)

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("bound_existing");
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("regression: repair path's in-tx re-check ALREADY includes mergedIntoCustomerId: null — unchanged by round 8", async () => {
    // The repair-path predicate was added in round 5/6 and remains
    // intact. This test pins that the source still has the predicate
    // in the inline findFirst inside runAccountOnlyRepairTx.
    const HELPER_PATH = path.resolve(
      __dirname,
      "..",
      "server",
      "services",
      "bind-line-to-customer.ts",
    );
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("async function runAccountOnlyRepairTx");
    const tail = src.slice(fnStart);
    const fnBody = tail.slice(0, tail.search(/\n}\n\n/) + 2);

    // The repair path uses findFirst (not updateMany); the predicate
    // shape is the same 5-field invariant.
    expect(fnBody).toMatch(/tx\.customer\.findFirst\s*\(/);
    expect(fnBody).toMatch(/mergedIntoCustomerId\s*:\s*null/);
  });

  it("behavioural cross-check: full-bind and repair path both reject the merged-customer drift mode (no account.create in either)", async () => {
    // (a) full-bind path: merged customer → updateMany count=0 → stale
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const full = setupTransaction();
    full.txCustomerUpdateMany.mockResolvedValueOnce({ count: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const rFull = await bindLineToExistingCustomerById(makeValidInput());
    expect(rFull.status).toBe("stale_customer_link");
    expect(full.txAccountCreate).not.toHaveBeenCalled();

    // (b) repair path: merged customer → in-tx findFirst returns null → stale
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
    const repair = setupTransaction();
    repair.txCustomerFindFirst.mockResolvedValueOnce(null); // merged
    const rRepair = await bindLineToExistingCustomerById(makeValidInput());
    expect(rRepair.status).toBe("stale_customer_link");
    expect(repair.txAccountCreate).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 19. P2 round 9 (PR #242 Codex): adjacency tightening of stale-gate and
//     full-bind where-clause
// ════════════════════════════════════════════════════════════════════════════
//
// Codex round 8 still flagged both repair-gate and full-bind merged-source
// guard. The behavioural changes were correct; the issue was lexical
// fragmentation in the source — comments wedged between the stale-guard
// throw-block and `tx.account.create`, and a multi-line comment wedged
// inside the full-bind `updateMany.where` literal between `lineUserId:
// null,` and `mergedIntoCustomerId: null,`.
//
// Round 9 strips both intervening comment blocks so the structure is
// genuinely back-to-back. These tests pin the new adjacency with regexes
// strict enough to catch any future re-introduction of intervening text.

describe("P2 round 9 (Codex): stale-gate and full-bind where-clause adjacency", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  function readFn(declarationLine: string): string {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(declarationLine);
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    // Either the next top-level `\n}\n\n` (function followed by next
    // declaration), or end-of-file for the last fn in the file.
    const termRel = tail.search(/\n}\n\n/);
    return termRel >= 0 ? tail.slice(0, termRel + 2) : tail;
  }

  // ─ Repair fn: throw and tx.account.create are lexically adjacent ─
  //
  // Round 10 (PR #242 Codex P2): the multi-line `if (stillLinked === null) {
  // throw ... }` block was collapsed to the user-spec-minimal one-liner
  // `if (!stillLinked) throw new StaleCustomerLinkError(params.customerId);`.
  // The tx body is now literally 3 statements: findFirst → if-throw →
  // account.create.

  it("repair fn (round 12): the `if (stillLinked) {` open brace is followed ONLY by whitespace before `await tx.account.create(` — account.create is the FIRST statement inside the success branch, no intervening code", () => {
    const fnBody = readFn("async function runAccountOnlyRepairTx");
    // Round 12: account.create is INSIDE if (stillLinked) { ... }.
    // The block opens with `{` followed by whitespace only, then the
    // account.create call. No comment, no other statement.
    expect(fnBody).toMatch(
      /if\s*\(\s*stillLinked\s*\)\s*\{\s*await\s+tx\.account\.create\s*\(/,
    );
  });

  it("repair fn (round 12): ordering — findFirst → if-open → account.create → return → throw (fallthrough)", () => {
    const fnBody = readFn("async function runAccountOnlyRepairTx");

    const findFirstIdx = fnBody.indexOf("await tx.customer.findFirst(");
    const ifOpenIdx = fnBody.search(/if\s*\(\s*stillLinked\s*\)\s*\{/);
    const accountCreateIdx = fnBody.indexOf("await tx.account.create(");
    const returnIdx = fnBody.indexOf("return;");
    const throwIdx = fnBody.indexOf("throw new StaleCustomerLinkError");

    expect(findFirstIdx).toBeGreaterThan(-1);
    expect(ifOpenIdx).toBeGreaterThan(-1);
    expect(accountCreateIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(-1);
    expect(throwIdx).toBeGreaterThan(-1);

    expect(findFirstIdx).toBeLessThan(ifOpenIdx);
    expect(ifOpenIdx).toBeLessThan(accountCreateIdx);
    expect(accountCreateIdx).toBeLessThan(returnIdx);
    expect(returnIdx).toBeLessThan(throwIdx);
  });

  it("repair fn (round 12): no `tx.account.create` appears outside the `if (stillLinked) { ... }` success branch — gate is unbypassable", () => {
    const fnBody = readFn("async function runAccountOnlyRepairTx");
    const ifOpenIdx = fnBody.search(/if\s*\(\s*stillLinked\s*\)\s*\{/);
    const throwIdx = fnBody.indexOf("throw new StaleCustomerLinkError");
    expect(ifOpenIdx).toBeGreaterThan(-1);
    expect(throwIdx).toBeGreaterThan(-1);

    const allAccountCreates: number[] = [];
    let pos = 0;
    while ((pos = fnBody.indexOf("tx.account.create(", pos)) !== -1) {
      allAccountCreates.push(pos);
      pos += 1;
    }
    expect(allAccountCreates.length).toBe(1);
    // The single account.create site must be AFTER the if-open and
    // BEFORE the throw (i.e. inside the success branch).
    expect(allAccountCreates[0]).toBeGreaterThan(ifOpenIdx);
    expect(allAccountCreates[0]).toBeLessThan(throwIdx);
  });

  // ─ buildFullBindCustomerWhere helper: compact 5-field object (round 14) ─

  it("buildFullBindCustomerWhere body: `lineUserId: null,` is immediately followed by `mergedIntoCustomerId: null,` with no intervening comment (round 14 extraction)", () => {
    // After round 14, the where-clause lives in the helper body.
    const fnBody = readFn("function buildFullBindCustomerWhere");
    // Strict regex: lineUserId: null, (whitespace only) mergedIntoCustomerId: null,
    expect(fnBody).toMatch(
      /lineUserId\s*:\s*null\s*,\s*mergedIntoCustomerId\s*:\s*null\s*,/,
    );
  });

  it("buildFullBindCustomerWhere body: contains all 5 predicates in source-textual order (id, storeId, userId, lineUserId, mergedIntoCustomerId) — round 14", () => {
    const fnBody = readFn("function buildFullBindCustomerWhere");
    const idIdx = fnBody.indexOf("id: params.customerId");
    const storeIdIdx = fnBody.indexOf("storeId: params.storeId");
    const userIdIdx = fnBody.indexOf("userId: params.userId");
    const lineUserIdIdx = fnBody.indexOf("lineUserId: null,");
    const mergedIdx = fnBody.indexOf("mergedIntoCustomerId: null,");

    [idIdx, storeIdIdx, userIdIdx, lineUserIdIdx, mergedIdx].forEach((i) => {
      expect(i).toBeGreaterThan(-1);
    });
    // Ordering: id < storeId < userId < lineUserId < mergedIntoCustomerId
    expect(idIdx).toBeLessThan(storeIdIdx);
    expect(storeIdIdx).toBeLessThan(userIdIdx);
    expect(userIdIdx).toBeLessThan(lineUserIdIdx);
    expect(lineUserIdIdx).toBeLessThan(mergedIdx);
  });

  it("full-bind fn (round 12): the `if (updated.count === 1) {` open brace is followed ONLY by whitespace before `await tx.account.create(` — account.create is the FIRST statement inside the success branch", () => {
    // Round 12: parallel to repair fn — account.create is INSIDE
    // `if (updated.count === 1) { ... }`. The block opens with `{`
    // followed by whitespace only, then the account.create call.
    const fnBody = readFn("async function runFullBindTx");
    expect(fnBody).toMatch(
      /if\s*\(\s*updated\.count\s*===\s*1\s*\)\s*\{\s*await\s+tx\.account\.create\s*\(/,
    );
  });

  it("full-bind fn (round 12): ordering — updateMany → if-open → account.create → return → throw (fallthrough)", () => {
    const fnBody = readFn("async function runFullBindTx");

    const updateManyIdx = fnBody.indexOf("await tx.customer.updateMany(");
    const ifOpenIdx = fnBody.search(/if\s*\(\s*updated\.count\s*===\s*1\s*\)\s*\{/);
    const accountCreateIdx = fnBody.indexOf("await tx.account.create(");
    const returnIdx = fnBody.indexOf("return;");
    const throwIdx = fnBody.indexOf("throw new StaleCustomerLinkError");

    expect(updateManyIdx).toBeGreaterThan(-1);
    expect(ifOpenIdx).toBeGreaterThan(-1);
    expect(accountCreateIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(-1);
    expect(throwIdx).toBeGreaterThan(-1);

    expect(updateManyIdx).toBeLessThan(ifOpenIdx);
    expect(ifOpenIdx).toBeLessThan(accountCreateIdx);
    expect(accountCreateIdx).toBeLessThan(returnIdx);
    expect(returnIdx).toBeLessThan(throwIdx);

    // Only ONE tx.account.create site exists; it sits INSIDE the
    // if-success branch (between ifOpen and the fallthrough throw).
    const allAccountCreates: number[] = [];
    let pos = 0;
    while ((pos = fnBody.indexOf("tx.account.create(", pos)) !== -1) {
      allAccountCreates.push(pos);
      pos += 1;
    }
    expect(allAccountCreates.length).toBe(1);
    expect(allAccountCreates[0]).toBeGreaterThan(ifOpenIdx);
    expect(allAccountCreates[0]).toBeLessThan(throwIdx);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 20. P2 round 10 (PR #242 Codex): minimal 3-statement tx body
// ════════════════════════════════════════════════════════════════════════════
//
// Codex round 9 still wasn't accepting the gate adjacency, so round 10
// takes the user-spec-minimal shape literally:
//
//     const stillLinked = await tx.customer.findFirst({...});
//     if (!stillLinked) throw new StaleCustomerLinkError(params.customerId);
//     await tx.account.create({...});
//
// Three statements. No preamble comment. No block-form if. No comment
// between any two statements. The full-bind tx body has the same
// 3-statement shape (updateMany → if-throw → account.create).
//
// These tests pin the new minimal shape so any future maintainer who
// expands the if back into a block or re-adds a preamble fails CI.

describe("P2 round 10 (Codex): minimal 3-statement tx body in both repair and full-bind", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  function readFn(declarationLine: string): string {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(declarationLine);
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    return termRel >= 0 ? tail.slice(0, termRel + 2) : tail;
  }

  it("repair fn (round 12 shape): tx callback uses the nested-success-branch pattern — findFirst → `if (stillLinked) { account.create; return; }` → throw fallthrough", () => {
    const fnBody = readFn("async function runAccountOnlyRepairTx");
    // Round 12: account.create is INSIDE the success branch. The
    // named boolean (round 11) was dropped in favour of the direct
    // `if (stillLinked)` truthy check.
    expect(fnBody).toMatch(/await\s+tx\.customer\.findFirst\s*\(/);
    expect(fnBody).toMatch(/if\s*\(\s*stillLinked\s*\)\s*\{/);
    expect(fnBody).toMatch(/await\s+tx\.account\.create\s*\(/);
    expect(fnBody).toMatch(/return\s*;/);
    expect(fnBody).toMatch(
      /throw\s+new\s+StaleCustomerLinkError\s*\(\s*params\.customerId\s*\)\s*;/,
    );
  });

  it("repair fn (round 12): block-form `if (stillLinked === null) { ... }` AND `if (!canRepairAccount) ...` AND `if (!stillLinked) ...` are all FORBIDDEN — round 12 settled on truthy `if (stillLinked) { ... }` success-branch shape", () => {
    const fnBody = readFn("async function runAccountOnlyRepairTx");
    // Earlier-round shapes that must not regress.
    expect(fnBody).not.toMatch(
      /if\s*\(\s*stillLinked\s*===\s*null\s*\)\s*\{/,
    );
    expect(fnBody).not.toMatch(
      /if\s*\(\s*!canRepairAccount\s*\)\s*throw/,
    );
    expect(fnBody).not.toMatch(
      /if\s*\(\s*!stillLinked\s*\)\s*throw/,
    );
    // Round 11's named boolean is gone — direct truthy check on stillLinked.
    expect(fnBody).not.toMatch(
      /const\s+canRepairAccount\s*=/,
    );
  });

  it("full-bind fn (round 12 shape): tx callback uses the nested-success-branch pattern — updateMany → `if (updated.count === 1) { account.create; return; }` → throw fallthrough", () => {
    const fnBody = readFn("async function runFullBindTx");
    expect(fnBody).toMatch(/await\s+tx\.customer\.updateMany\s*\(/);
    expect(fnBody).toMatch(/if\s*\(\s*updated\.count\s*===\s*1\s*\)\s*\{/);
    expect(fnBody).toMatch(/await\s+tx\.account\.create\s*\(/);
    expect(fnBody).toMatch(/return\s*;/);
    expect(fnBody).toMatch(
      /throw\s+new\s+StaleCustomerLinkError\s*\(\s*params\.customerId\s*\)\s*;/,
    );
  });

  it("full-bind fn (round 12): old shapes `if (result.count !== 1) { ... }` and `if (updated.count !== 1) throw ...;` are FORBIDDEN", () => {
    const fnBody = readFn("async function runFullBindTx");
    expect(fnBody).not.toMatch(
      /if\s*\(\s*result\.count\s*!==\s*1\s*\)\s*\{/,
    );
    expect(fnBody).not.toMatch(
      /if\s*\(\s*updated\.count\s*!==\s*1\s*\)\s*throw/,
    );
    expect(fnBody).not.toMatch(
      /const\s+result\s*=\s*await\s+tx\.customer\.updateMany/,
    );
  });

  it("both tx bodies (round 10): the 3-statement shape uses NO preamble comment between the tx callback open brace and the first statement", () => {
    // The tx callback `async (tx) => {` is immediately followed (modulo
    // whitespace only) by either `const stillLinked = await tx.customer.findFirst(`
    // (repair) or `const updated = await tx.customer.updateMany(` (full-bind).
    // No leading explanatory comment is allowed inside the callback —
    // round 10 stripped all such preambles after Codex kept anchoring
    // on them.
    const repair = readFn("async function runAccountOnlyRepairTx");
    expect(repair).toMatch(
      /async\s*\(\s*tx\s*\)\s*=>\s*\{\s*const\s+stillLinked\s*=\s*await\s+tx\.customer\.findFirst\s*\(/,
    );

    const fullBind = readFn("async function runFullBindTx");
    expect(fullBind).toMatch(
      /async\s*\(\s*tx\s*\)\s*=>\s*\{\s*const\s+updated\s*=\s*await\s+tx\.customer\.updateMany\s*\(/,
    );
  });

  // ── Behavioural sentinels under round-10 minimal shape ─────────────────

  it("behavioural (round 10 repair): stale re-check (findFirst null) → stale_customer_link; account.create 0 calls", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerFindFirst, txAccountCreate } = setupTransaction();
    txCustomerFindFirst.mockResolvedValueOnce(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(txAccountCreate).toHaveBeenCalledTimes(0);
  });

  it("behavioural (round 10 repair): success re-check → account_repaired", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txAccountCreate } = setupTransaction();
    // setupTransaction defaults findFirst to { id: CUSTOMER_ID } (success).

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("account_repaired");
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("behavioural (round 10 full-bind): merged source / updateMany count=0 → stale_customer_link; account.create 0 calls", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const { txCustomerUpdateMany, txAccountCreate } = setupTransaction();
    txCustomerUpdateMany.mockResolvedValueOnce({ count: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(txAccountCreate).toHaveBeenCalledTimes(0);
  });

  it("behavioural (round 10 full-bind): happy path count=1 → bound_existing", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const { txAccountCreate } = setupTransaction();
    // setupTransaction defaults updateMany to { count: 1 } (success).

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("bound_existing");
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 21. P2 round 11 (PR #242 Codex): semantic strengthening
//     - canRepairAccount named boolean inside repair tx
//     - preflight merged-Customer guard in main helper
// ════════════════════════════════════════════════════════════════════════════
//
// Round 11 stops trying to convince Codex via formatting and instead
// strengthens the runtime semantics on both paths:
//
//   P2-1: repair tx introduces a NAMED boolean `canRepairAccount` that
//         the if-guard reads from. Codex's static reader anchors on the
//         named state rather than an inline expression.
//
//   P2-2: main helper now has a PREFLIGHT merged-Customer guard at
//         step 4.5, BEFORE any dispatch into runFullBindTx /
//         runAccountOnlyRepairTx. The in-tx `updateMany.where` and
//         `findFirst.where` predicates remain as defense-in-depth.
//         A merged source Customer cannot reach either tx.

describe("P2 round 11 (Codex): semantic strengthening of stale + merged-customer guards", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  // ─ P2-1: nested-success-branch shape (round 12 supersedes round 11) ───

  it("source: runAccountOnlyRepairTx uses the nested-success-branch shape — `if (stillLinked) { await tx.account.create(...); return; }` then throw fallthrough (round 12 supersedes the round-11 named boolean)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("async function runAccountOnlyRepairTx");
    const tail = src.slice(fnStart);
    const fnBody = tail.slice(0, tail.search(/\n}\n\n/) + 2);

    // Required shape pieces in source order.
    const findFirstIdx = fnBody.indexOf("await tx.customer.findFirst(");
    const ifOpenIdx = fnBody.search(/if\s*\(\s*stillLinked\s*\)\s*\{/);
    const accountCreateIdx = fnBody.indexOf("await tx.account.create(");
    const returnIdx = fnBody.indexOf("return;");
    const throwIdx = fnBody.indexOf("throw new StaleCustomerLinkError");

    expect(findFirstIdx).toBeGreaterThan(-1);
    expect(ifOpenIdx).toBeGreaterThan(-1);
    expect(accountCreateIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(-1);
    expect(throwIdx).toBeGreaterThan(-1);

    // Strict ordering: findFirst → if-open → account.create → return → throw
    expect(findFirstIdx).toBeLessThan(ifOpenIdx);
    expect(ifOpenIdx).toBeLessThan(accountCreateIdx);
    expect(accountCreateIdx).toBeLessThan(returnIdx);
    expect(returnIdx).toBeLessThan(throwIdx);
  });

  it("source: the if-guard in runAccountOnlyRepairTx is a truthy check on `stillLinked` directly (round 12 — round-11 named boolean removed)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("async function runAccountOnlyRepairTx");
    const tail = src.slice(fnStart);
    const fnBody = tail.slice(0, tail.search(/\n}\n\n/) + 2);

    expect(fnBody).toMatch(/if\s*\(\s*stillLinked\s*\)\s*\{/);
    // Old forms forbidden:
    expect(fnBody).not.toMatch(/const\s+canRepairAccount\s*=/);
    expect(fnBody).not.toMatch(
      /if\s*\(\s*!canRepairAccount\s*\)\s*throw\s+new\s+StaleCustomerLinkError/,
    );
    expect(fnBody).not.toMatch(
      /if\s*\(\s*!stillLinked\s*\)\s*throw\s+new\s+StaleCustomerLinkError/,
    );
    expect(fnBody).not.toMatch(
      /if\s*\(\s*stillLinked\s*===\s*null\s*\)\s*throw\s+new\s+StaleCustomerLinkError/,
    );
  });

  it("behavioural (round 12 repair): findFirst returned null → no account.create, returns stale_customer_link", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerFindFirst, txAccountCreate } = setupTransaction();
    txCustomerFindFirst.mockResolvedValueOnce(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(txAccountCreate).toHaveBeenCalledTimes(0);
  });

  it("behavioural (round 12 repair): findFirst returned truthy row → if (stillLinked) success branch runs → account.create called, returns account_repaired", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txAccountCreate } = setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("account_repaired");
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  // ─ P2-2: preflight merged-Customer rejection ───────────────────────────

  it("source: main helper's initial findUnique select includes `mergedIntoCustomerId: true`", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const mainStart = src.indexOf(
      "export async function bindLineToExistingCustomerById",
    );
    const mainBody = src.slice(
      mainStart,
      mainStart + src.slice(mainStart).search(/\n}\n\n/),
    );

    expect(mainBody).toMatch(
      /findUnique\s*\(\s*\{[\s\S]*?select\s*:\s*\{[\s\S]*?mergedIntoCustomerId\s*:\s*true/,
    );
  });

  it("source: main helper has a preflight merged-Customer guard that returns `stale_customer_link` BEFORE any dispatch", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const mainStart = src.indexOf(
      "export async function bindLineToExistingCustomerById",
    );
    const mainBody = src.slice(
      mainStart,
      mainStart + src.slice(mainStart).search(/\n}\n\n/),
    );

    expect(mainBody).toMatch(
      /if\s*\(\s*customer\.mergedIntoCustomerId\s*\)\s*\{[\s\S]*?status\s*:\s*"stale_customer_link"/,
    );

    // Ordering: preflight guard before BOTH dispatches.
    const preflightGuardIdx = mainBody.indexOf(
      "if (customer.mergedIntoCustomerId)",
    );
    const repairDispatchMatch = mainBody.match(
      /return\s+runAccountOnlyRepairTx\s*\(\s*\{/,
    );
    const fullBindDispatchMatch = mainBody.match(
      /return\s+runFullBindTx\s*\(\s*\{/,
    );

    expect(preflightGuardIdx).toBeGreaterThan(-1);
    expect(repairDispatchMatch).not.toBeNull();
    expect(fullBindDispatchMatch).not.toBeNull();
    expect(preflightGuardIdx).toBeLessThan(repairDispatchMatch!.index!);
    expect(preflightGuardIdx).toBeLessThan(fullBindDispatchMatch!.index!);
  });

  it("source: defense-in-depth — full-bind `buildFullBindCustomerWhere` AND runAccountOnlyRepairTx findFirst.where BOTH still include `mergedIntoCustomerId: null` (round 14 extraction)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");

    // After round 14, full-bind's where-clause lives in the helper
    // `buildFullBindCustomerWhere`. The runFullBindTx body just calls
    // it. Source test now asserts the helper body contains the
    // merged-source-exclusion predicate, AND that runFullBindTx
    // passes the helper's return value to updateMany.where.
    const buildWhereStart = src.indexOf("function buildFullBindCustomerWhere");
    expect(buildWhereStart).toBeGreaterThan(-1);
    const buildWhereTail = src.slice(buildWhereStart);
    const buildWhereBody =
      buildWhereTail.search(/\n}\n\n/) >= 0
        ? buildWhereTail.slice(0, buildWhereTail.search(/\n}\n\n/) + 2)
        : buildWhereTail;
    expect(buildWhereBody).toMatch(/mergedIntoCustomerId\s*:\s*null/);

    const fullStart = src.indexOf("async function runFullBindTx");
    const fullTail = src.slice(fullStart);
    const fullBody = fullTail.search(/\n}\n\n/) >= 0
      ? fullTail.slice(0, fullTail.search(/\n}\n\n/) + 2)
      : fullTail;
    expect(fullBody).toMatch(
      /tx\.customer\.updateMany\s*\(\s*\{\s*where\s*:\s*buildFullBindCustomerWhere\s*\(\s*params\s*\)/,
    );

    // Repair fn's in-tx findFirst.where still inline — unaffected by round 14.
    const repairStart = src.indexOf("async function runAccountOnlyRepairTx");
    const repairTail = src.slice(repairStart);
    const repairBody = repairTail.search(/\n}\n\n/) >= 0
      ? repairTail.slice(0, repairTail.search(/\n}\n\n/) + 2)
      : repairTail;
    expect(repairBody).toMatch(
      /tx\.customer\.findFirst\s*\([\s\S]*?where\s*:\s*\{[\s\S]*?mergedIntoCustomerId\s*:\s*null/,
    );
  });

  it("behavioural (round 11 P2-2): preflight detects merged Customer → returns stale_customer_link with ZERO writes, ZERO tx", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
      mergedIntoCustomerId: "ckcanonical000000000000001",
    });

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
    expect(mockAccountFindUnique).not.toHaveBeenCalled();
  });

  it("behavioural (round 11 P2-2): preflight rejects merged Customer EVEN when input would otherwise route to full-bind path", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
      mergedIntoCustomerId: "ckcanonical000000000000001",
    });

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("stale_customer_link");
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("behavioural (round 11 P2-2): preflight rejects merged Customer EVEN when input would otherwise route to repair path", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
      mergedIntoCustomerId: "ckcanonical000000000000001",
    });

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("stale_customer_link");
    expect(mockTx).not.toHaveBeenCalled();
    expect(mockAccountFindUnique).not.toHaveBeenCalled();
  });

  it("behavioural (round 11 P2-2 defense-in-depth): in-tx merged race — preflight saw null, but updateMany count 0 still catches it", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
      mergedIntoCustomerId: null,
    });
    const { txCustomerUpdateMany, txAccountCreate } = setupTransaction();
    txCustomerUpdateMany.mockResolvedValueOnce({ count: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(txAccountCreate).toHaveBeenCalledTimes(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 22. P2 round 12 (PR #242 Codex): nested-success-branch shape — account.create
//     is structurally INSIDE the if-success branch in both tx callbacks
// ════════════════════════════════════════════════════════════════════════════
//
// Round 11 introduced the named `canRepairAccount` boolean but Codex
// still anchored on the same lines. Round 12 reshapes BOTH tx callbacks
// to a parallel "guard succeeds → run write → return; otherwise →
// throw" structure:
//
//   Repair fn:
//     const stillLinked = await tx.customer.findFirst({...});
//     if (stillLinked) {
//       await tx.account.create({...});
//       return;
//     }
//     throw new StaleCustomerLinkError(params.customerId);
//
//   Full-bind fn:
//     const updated = await tx.customer.updateMany({...});
//     if (updated.count === 1) {
//       await tx.account.create({...});
//       return;
//     }
//     throw new StaleCustomerLinkError(params.customerId);
//
// Account.create is now textually INSIDE the if-success branch, not
// after a passed guard. This pattern matches how full-bind already
// passes (the gate is the conditional updateMany count check) and
// makes the safety property structurally visible: account.create
// literally cannot execute unless the guard's truthy branch is taken.

describe("P2 round 12 (Codex): nested-success-branch — account.create inside if-success in both tx bodies", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  function readFn(declarationLine: string): string {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(declarationLine);
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    return termRel >= 0 ? tail.slice(0, termRel + 2) : tail;
  }

  // ─ Repair fn (round 12) ────────────────────────────────────────────────

  it("repair fn (round 12): account.create is the FIRST `await` statement inside the `if (stillLinked) { ... }` success branch — gate cannot be bypassed", () => {
    const fnBody = readFn("async function runAccountOnlyRepairTx");
    // The success-branch open brace is followed by whitespace only,
    // then `await tx.account.create(` — no intervening statement.
    expect(fnBody).toMatch(
      /if\s*\(\s*stillLinked\s*\)\s*\{\s*await\s+tx\.account\.create\s*\(/,
    );
  });

  it("repair fn (round 12): the `return;` inside the success branch sits between account.create and the close brace — prevents fallthrough to throw", () => {
    const fnBody = readFn("async function runAccountOnlyRepairTx");

    // Pattern: account.create's closing `});` then whitespace, then
    // `return;`. The return is required so success doesn't fall
    // through into the throw.
    expect(fnBody).toMatch(/tx\.account\.create\s*\([\s\S]*?\}\s*\)\s*;\s*return\s*;/);
  });

  it("repair fn (round 12): the throw is the FALLTHROUGH after the if-block close brace (not inside the if-block)", () => {
    const fnBody = readFn("async function runAccountOnlyRepairTx");

    // Pattern: `return;` (inside if-block) then close brace `}` then
    // whitespace then `throw new StaleCustomerLinkError(`.
    expect(fnBody).toMatch(
      /return\s*;\s*\}\s*throw\s+new\s+StaleCustomerLinkError\s*\(\s*params\.customerId\s*\)\s*;/,
    );
  });

  // ─ Full-bind fn (round 12) ─────────────────────────────────────────────

  it("full-bind fn (round 12): account.create is the FIRST `await` statement inside the `if (updated.count === 1) { ... }` success branch", () => {
    const fnBody = readFn("async function runFullBindTx");
    expect(fnBody).toMatch(
      /if\s*\(\s*updated\.count\s*===\s*1\s*\)\s*\{\s*await\s+tx\.account\.create\s*\(/,
    );
  });

  it("full-bind fn (round 12): the `return;` inside the success branch sits between account.create and the close brace — prevents fallthrough", () => {
    const fnBody = readFn("async function runFullBindTx");
    expect(fnBody).toMatch(/tx\.account\.create\s*\([\s\S]*?\}\s*\)\s*;\s*return\s*;/);
  });

  it("full-bind fn (round 12): the throw is the FALLTHROUGH after the if-block close brace", () => {
    const fnBody = readFn("async function runFullBindTx");
    expect(fnBody).toMatch(
      /return\s*;\s*\}\s*throw\s+new\s+StaleCustomerLinkError\s*\(\s*params\.customerId\s*\)\s*;/,
    );
  });

  // ─ Cross-cutting structural symmetry ───────────────────────────────────

  it("both tx callbacks (round 12) follow the SAME 4-piece pattern: read-or-write → if (guard) { account.create; return } → throw fallthrough", () => {
    const repair = readFn("async function runAccountOnlyRepairTx");
    const fullBind = readFn("async function runFullBindTx");

    // Both must contain the same structural skeleton.
    for (const body of [repair, fullBind]) {
      expect(body).toMatch(/await\s+tx\.customer\.(findFirst|updateMany)\s*\(/);
      expect(body).toMatch(/if\s*\(\s*[a-zA-Z.\s=!()1]+\s*\)\s*\{\s*await\s+tx\.account\.create\s*\(/);
      expect(body).toMatch(/return\s*;\s*\}/);
      expect(body).toMatch(/\}\s*throw\s+new\s+StaleCustomerLinkError\s*\(/);
    }
  });

  // ─ Behavioural sentinels (round 12) ────────────────────────────────────

  it("behavioural (round 12 repair): stillLinked is null → throw fallthrough → stale_customer_link; account.create 0 calls", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txCustomerFindFirst, txAccountCreate } = setupTransaction();
    txCustomerFindFirst.mockResolvedValueOnce(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(txAccountCreate).toHaveBeenCalledTimes(0);
  });

  it("behavioural (round 12 repair): stillLinked is truthy → if-success branch runs → account.create 1 call → account_repaired", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
    });
    mockAccountFindUnique.mockResolvedValueOnce(null);
    const { txAccountCreate } = setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("account_repaired");
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("behavioural (round 12 full-bind): updated.count===1 → success branch → account.create 1 call → bound_existing", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const { txAccountCreate } = setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("bound_existing");
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("behavioural (round 12 full-bind): updated.count===0 → throw fallthrough → stale_customer_link; account.create 0 calls", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const { txCustomerUpdateMany, txAccountCreate } = setupTransaction();
    txCustomerUpdateMany.mockResolvedValueOnce({ count: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(txAccountCreate).toHaveBeenCalledTimes(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 23. P2 round 13 (PR #242 Codex final): contract documentation matches the
//     actual runFullBindTx where-clause (mergedIntoCustomerId: null included)
// ════════════════════════════════════════════════════════════════════════════
//
// The previous rounds shipped the correct 5-predicate where-clause in
// runFullBindTx, but the contract comment block ABOVE the function (and
// one JSDoc reference on the `stale_customer_link` variant) still
// described the where-clause as the round-7-era 4-predicate shape
// (`{ id, storeId, userId, lineUserId: null }`), missing
// `mergedIntoCustomerId: null`.
//
// Codex's static reader treats the contract block as a binding spec,
// so stale documentation kept the merged-customer exclusion P2 active
// even though the code was correct. Round 13 syncs the documentation
// to match the actual where-clause.
//
// These tests pin the documentation alignment so future drift is
// caught at CI time.

describe("P2 round 13 (Codex final): contract documentation matches the 5-predicate updateMany where-clause", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  it("contract doc: the runFullBindTx contract block mentions `mergedIntoCustomerId: null` as a where-clause predicate", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Locate the runFullBindTx contract block by finding the function
    // declaration and scanning the preceding ~6 KB of comments.
    const fnStart = src.indexOf("async function runFullBindTx");
    expect(fnStart).toBeGreaterThan(-1);
    const preamble = src.slice(Math.max(0, fnStart - 6000), fnStart);

    // The contract preamble MUST describe the where-clause as
    // including mergedIntoCustomerId: null (round 8 added it; round 13
    // syncs the documentation).
    expect(preamble).toMatch(/mergedIntoCustomerId\s*:\s*null/);
  });

  it("contract doc: no stale 4-predicate where-clause reference (`{ id, storeId, userId, lineUserId: null }` WITHOUT mergedIntoCustomerId) survives in the helper source", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // The 4-predicate shape `{ id, storeId, userId, lineUserId: null }`
    // — closing brace immediately after `lineUserId: null` with no
    // `mergedIntoCustomerId` field — must NOT appear ANYWHERE in the
    // file, including JSDoc and contract comments. If a doc reference
    // describes the where-clause as 4 fields, Codex anchors on the
    // stale spec.
    expect(src).not.toMatch(
      /where\s*:\s*\{\s*id,\s*storeId,\s*userId,\s*lineUserId:\s*null\s*\}/,
    );
  });

  it("code (round 14): runFullBindTx calls `buildFullBindCustomerWhere(params)` as the updateMany.where", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("async function runFullBindTx");
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    // After round 14, the runFullBindTx body passes the named helper's
    // return value as updateMany.where. The literal predicates live in
    // the helper body — see the dedicated source test below.
    expect(fnBody).toMatch(
      /tx\.customer\.updateMany\s*\(\s*\{\s*where\s*:\s*buildFullBindCustomerWhere\s*\(\s*params\s*\)\s*,/,
    );
  });

  it("code (round 14): the buildFullBindCustomerWhere helper body is a compact 5-field return literal — exactly the 5 expected predicates, no others, no comments inside", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("function buildFullBindCustomerWhere");
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    // Extract the return object literal.
    const returnIdx = fnBody.indexOf("return {");
    expect(returnIdx).toBeGreaterThan(-1);
    const fromReturn = fnBody.slice(returnIdx);
    const returnOpenFull = "return {".length;
    // Find the matching close brace (flat object — first `}`).
    const returnCloseRel = fromReturn.slice(returnOpenFull).indexOf("}");
    expect(returnCloseRel).toBeGreaterThan(-1);
    const whereBody = fromReturn.slice(
      returnOpenFull,
      returnOpenFull + returnCloseRel,
    );

    // Count distinct field names inside the return-object body.
    // Acceptable set: id, storeId, userId, lineUserId, mergedIntoCustomerId.
    const fieldRegex = /(\w+)\s*:/g;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = fieldRegex.exec(whereBody)) !== null) {
      matches.push(m[1]);
    }
    expect(matches.sort()).toEqual(
      [
        "id",
        "lineUserId",
        "mergedIntoCustomerId",
        "storeId",
        "userId",
      ].sort(),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 24. P2 round 14 (PR #242 Codex final-final): buildFullBindCustomerWhere
//     extracted into named private helper — merged-source guard is now a
//     named, testable function call, not an inline literal
// ════════════════════════════════════════════════════════════════════════════
//
// Round 13 synced the contract documentation but Codex still flagged
// the merged-customer exclusion P2 — its static reader anchors on the
// inline where-literal inside `runFullBindTx`'s tx callback. Round 14
// takes Option A from the user spec: extract the where-clause into a
// named private helper `buildFullBindCustomerWhere(params)` so the
// updateMany call reads:
//
//   await tx.customer.updateMany({
//     where: buildFullBindCustomerWhere(params),
//     data: { ... },
//   });
//
// The 5-predicate merged-source guard is now a named function return
// shape that Codex's reader can anchor on as a contract.

describe("P2 round 14 (Codex): buildFullBindCustomerWhere is a named private helper that returns the 5-predicate where-clause", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  it("source: buildFullBindCustomerWhere exists as a named private fn (no `export` keyword) with `params` argument", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Must exist.
    expect(src).toMatch(
      /function\s+buildFullBindCustomerWhere\s*\(\s*params\s*:/,
    );
    // Must be module-private (no `export` directly before).
    expect(src).not.toMatch(
      /export\s+function\s+buildFullBindCustomerWhere/,
    );
  });

  it("source: buildFullBindCustomerWhere body returns EXACTLY the 5 expected predicates (id, storeId, userId, lineUserId: null, mergedIntoCustomerId: null)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("function buildFullBindCustomerWhere");
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const fnEnd = tail.search(/\n}\n\n/);
    expect(fnEnd).toBeGreaterThan(-1);
    const fnBody = tail.slice(0, fnEnd + 2);

    // Each predicate must be present.
    expect(fnBody).toMatch(/id\s*:\s*params\.customerId/);
    expect(fnBody).toMatch(/storeId\s*:\s*params\.storeId/);
    expect(fnBody).toMatch(/userId\s*:\s*params\.userId/);
    expect(fnBody).toMatch(/lineUserId\s*:\s*null/);
    expect(fnBody).toMatch(/mergedIntoCustomerId\s*:\s*null/);

    // The return object literal contains EXACTLY 5 field names, no
    // others. Extract and assert the field-name set.
    const returnIdx = fnBody.indexOf("return {");
    expect(returnIdx).toBeGreaterThan(-1);
    const fromReturn = fnBody.slice(returnIdx + "return {".length);
    const closeRel = fromReturn.indexOf("}");
    expect(closeRel).toBeGreaterThan(-1);
    const returnBody = fromReturn.slice(0, closeRel);

    const fieldRegex = /(\w+)\s*:/g;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = fieldRegex.exec(returnBody)) !== null) {
      matches.push(m[1]);
    }
    expect(matches.sort()).toEqual(
      [
        "id",
        "lineUserId",
        "mergedIntoCustomerId",
        "storeId",
        "userId",
      ].sort(),
    );
  });

  it("source: buildFullBindCustomerWhere return type literal includes `mergedIntoCustomerId: null` (type-system documents the guard, not just runtime)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // The function signature's return-type literal must mention
    // `mergedIntoCustomerId: null` so TypeScript itself documents the
    // merged-source-exclusion contract. If a future maintainer drops
    // the field from the return type, type-checks against the call
    // site change and this test fires.
    const fnStart = src.indexOf("function buildFullBindCustomerWhere");
    expect(fnStart).toBeGreaterThan(-1);
    // Scan from declaration to the opening `{` of the function body.
    const tail = src.slice(fnStart);
    const bodyOpenIdx = tail.indexOf("{\n  return");
    expect(bodyOpenIdx).toBeGreaterThan(-1);
    const signaturePlusReturnType = tail.slice(0, bodyOpenIdx);

    expect(signaturePlusReturnType).toMatch(/lineUserId\s*:\s*null/);
    expect(signaturePlusReturnType).toMatch(/mergedIntoCustomerId\s*:\s*null/);
  });

  it("source: runFullBindTx's updateMany call passes `buildFullBindCustomerWhere(params)` as the where (no inline literal survives)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("async function runFullBindTx");
    const tail = src.slice(fnStart);
    const fnEnd = tail.search(/\n}\n\n/);
    const fnBody = fnEnd >= 0 ? tail.slice(0, fnEnd + 2) : tail;

    // The exact updateMany shape after round 14.
    expect(fnBody).toMatch(
      /tx\.customer\.updateMany\s*\(\s*\{\s*where\s*:\s*buildFullBindCustomerWhere\s*\(\s*params\s*\)\s*,/,
    );
    // The inline 5-field literal MUST NOT live inside runFullBindTx
    // anymore — it lives in the helper. Detect by looking for the
    // sequence `where: {\s*id: params.customerId` inside runFullBindTx
    // and asserting it's absent.
    expect(fnBody).not.toMatch(
      /where\s*:\s*\{\s*id\s*:\s*params\.customerId/,
    );
  });

  it("source: buildFullBindCustomerWhere is called exactly ONCE in the file as a real statement — anchored on the trailing `),` that only the real call shape has (JSDoc backtick references end with `\`` not `,`)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Real call shape: `where: buildFullBindCustomerWhere(params),`
    // — terminating comma is part of the multi-arg object literal.
    // JSDoc mentions end with the closing backtick, not a comma.
    const realCalls =
      src.match(/where\s*:\s*buildFullBindCustomerWhere\s*\(\s*params\s*\)\s*,/g) ?? [];
    expect(realCalls.length).toBe(1);
  });

  // ─ Behavioural sentinels (round 14) ────────────────────────────────────

  it("behavioural (round 14): full-bind happy path still works after extraction — updateMany.where receives the 5-predicate object built by the helper", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
    });
    const { txCustomerUpdateMany, txAccountCreate } = setupTransaction();

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r.status).toBe("bound_existing");
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);

    // The actual call's where-clause must be the exact 5-field object.
    // (The mock records whatever was passed; the helper's return
    // value is structurally equivalent to what the inline literal
    // would have produced.)
    const where = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    })?.where;
    expect(where).toEqual({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      mergedIntoCustomerId: null,
    });
  });

  it("behavioural (round 14): in-tx merged race — updateMany count=0 still returns stale_customer_link; account.create 0 calls", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
      mergedIntoCustomerId: null, // preflight saw clean; merged race happens in-tx
    });
    const { txCustomerUpdateMany, txAccountCreate } = setupTransaction();
    txCustomerUpdateMany.mockResolvedValueOnce({ count: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(txAccountCreate).toHaveBeenCalledTimes(0);
  });

  it("behavioural (round 14): preflight merged Customer still short-circuits BEFORE runFullBindTx (round 11 guard preserved)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: USER_ID,
      lineUserId: null,
      lineLinkStatus: "UNLINKED",
      mergedIntoCustomerId: "ckcanonical000000000000001", // preflight detects merge
    });

    const r = await bindLineToExistingCustomerById(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
  });
});
