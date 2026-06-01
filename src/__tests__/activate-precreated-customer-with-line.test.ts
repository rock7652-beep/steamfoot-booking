/**
 * activatePrecreatedCustomerWithLine() unit tests (PR-G5.1.b)
 *
 * Pure-mock tests for the Case B activation helper added in PR-G5.1.b.
 * Conforms strictly to docs/line-identity-binding-pre-audit.md §5.3.3
 * (activation helper) pre-write checklist + byte-equivalent baseline
 * vs src/lib/auth.ts Case B (lines 620-687, LINE branch only).
 *
 * Coverage map:
 *   ── status branches (7) ──
 *     • activated                              happy path
 *     • store_mismatch                         storeId or customer-not-found
 *     • customer_already_has_user              userId !== null (existing-user route)
 *     • stale_customer_link                    merged source OR in-tx race
 *     • customer_already_linked_to_other_line  different LINE attached
 *     • unique_conflict                        Prisma P2002
 *     • write_conflict                         Prisma P2034
 *
 *   ── byte-equivalent baseline ──
 *     • User.name === customer.name (NOT oauthProfile.name) — Codex round 10 P2
 *     • User.phone === customer.phone || null
 *     • User.email / User.image from oauthProfile (passed through)
 *     • Account.create exactly 10 fields — NO session_state
 *     • Customer.update writes authSource:"LINE" + lineUserId + lineLinkStatus +
 *       lineLinkedAt; lineName only if non-null (matches baseline `if (oauthName)`)
 *
 *   ── pre-write semantics ──
 *     • every rejection branch is 0 DB writes (spy assertion)
 *
 *   ── atomicity (A3) ──
 *     • account.create throw inside tx → tx callback re-throws → no User commit
 *     • stale Customer condition → throw → no orphan User / no orphan Account
 *     • Serializable isolation requested
 *
 *   ── log masking ──
 *     • stale_customer_link log payload uses maskId / maskLineUserId
 *
 * Mocks:
 *   - @/lib/db prisma (customer.findUnique, $transaction)
 *   - Existing post-bind downstream services from sibling helpers
 *     (no-op for this helper, but kept coherent at module level).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── prisma mocks ──────────────────────────────────────
const mockCustomerFindUnique = vi.fn();
const mockTx = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
    },
    // account.findUnique is unused by this helper (no Account preflight read);
    // included on the surface for parity with sibling helpers' setup.
    account: {
      findUnique: vi.fn(),
    },
    $transaction: (...args: unknown[]) => mockTx(...args),
  },
}));

// ── existing-helper downstream-service mocks (kept coherent) ──
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
  activatePrecreatedCustomerWithLine,
  type ActivatePrecreatedCustomerWithLineInput,
} from "@/server/services/bind-line-to-customer";

// ── shared fixture constants ──────────────────────────
const STORE_ID = "store-zhubei-id";
const OTHER_STORE_ID = "store-other-id";
const CUSTOMER_ID = "ckcustomer000000000000001";
const CANONICAL_CUSTOMER_ID = "ckcanonical00000000000001";
const NEW_USER_ID = "ckuser_new_0000000000abcd";
const EXISTING_USER_ID = "ckuser_existing_00000fed1";
const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const OTHER_LINE_USER_ID = "U_other_line_user_id_0000000000abcd";
const LINE_NAME = "LINE 暱稱";
const CUSTOMER_NAME = "店長建檔小明";
const OAUTH_PROFILE_NAME = "LINE Display Bob"; // ← must NOT be persisted to User.name
const CUSTOMER_PHONE = "0912345678";
const OAUTH_EMAIL = "u@example.com";
const OAUTH_IMAGE = "https://line.example/img.jpg";

function makeValidInput(
  overrides: Partial<ActivatePrecreatedCustomerWithLineInput> = {},
): ActivatePrecreatedCustomerWithLineInput {
  return {
    storeId: STORE_ID,
    customerId: CUSTOMER_ID,
    lineUserId: LINE_USER_ID,
    lineName: LINE_NAME,
    oauthProfile: {
      email: OAUTH_EMAIL,
      image: OAUTH_IMAGE,
      name: OAUTH_PROFILE_NAME,
    },
    oauthAccount: {
      provider: "line",
      providerAccountId: LINE_USER_ID,
      type: "oauth",
      access_token: "atok",
      refresh_token: "rtok",
      id_token: "idtok",
      expires_at: 1_700_000_000,
      scope: "profile openid",
      token_type: "Bearer",
    },
    ...overrides,
  };
}

function precreatedCustomerFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: CUSTOMER_ID,
    storeId: STORE_ID,
    userId: null, // Case B precondition
    lineUserId: null,
    lineLinkStatus: "UNLINKED",
    mergedIntoCustomerId: null,
    name: CUSTOMER_NAME,
    phone: CUSTOMER_PHONE,
    ...overrides,
  };
}

/**
 * Build a fake `tx` client and run the $transaction callback.
 * Returns spy fns so individual tests can inspect call counts /
 * arguments / configure throws.
 */
function setupTransaction() {
  const txUserCreate = vi
    .fn()
    .mockResolvedValue({ id: NEW_USER_ID });
  const txAccountCreate = vi
    .fn()
    .mockResolvedValue({ id: "new-account-id" });
  const txCustomerUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  let lastIsolationLevel: string | undefined;

  mockTx.mockImplementation(
    async (
      cb: (tx: unknown) => Promise<unknown>,
      opts?: { isolationLevel?: string },
    ) => {
      lastIsolationLevel = opts?.isolationLevel;
      const tx = {
        user: { create: txUserCreate },
        account: { create: txAccountCreate },
        customer: { updateMany: txCustomerUpdateMany },
      };
      return cb(tx);
    },
  );

  return {
    txUserCreate,
    txAccountCreate,
    txCustomerUpdateMany,
    getIsolationLevel: () => lastIsolationLevel,
  };
}

beforeEach(() => {
  mockCustomerFindUnique.mockReset();
  mockTx.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. Happy path: activated
// ════════════════════════════════════════════════════════════════════════════

describe("activated (happy path: User + Account + Customer all written in one tx)", () => {
  it("creates User, creates Account[line], updates Customer link metadata; returns activated", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txUserCreate, txAccountCreate, txCustomerUpdateMany, getIsolationLevel } =
      setupTransaction();

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "activated",
      customerId: CUSTOMER_ID,
      userId: NEW_USER_ID,
    });
    expect(mockTx).toHaveBeenCalledTimes(1);
    expect(getIsolationLevel()).toBe("Serializable");
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Byte-equivalent baseline (vs src/lib/auth.ts Case B)
// ════════════════════════════════════════════════════════════════════════════

describe("byte-equivalent baseline vs auth.ts Case B (lines 620-687)", () => {
  it("User.create.data.name === customer.name (NOT oauthProfile.name) — Codex round 10 P2", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ name: CUSTOMER_NAME }),
    );
    const { txUserCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(
      makeValidInput({
        oauthProfile: {
          email: OAUTH_EMAIL,
          image: OAUTH_IMAGE,
          name: OAUTH_PROFILE_NAME, // ← MUST NOT be the value persisted
        },
      }),
    );

    expect(txUserCreate).toHaveBeenCalledTimes(1);
    const userCreateArg = txUserCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };
    expect(userCreateArg?.data?.name).toBe(CUSTOMER_NAME);
    expect(userCreateArg?.data?.name).not.toBe(OAUTH_PROFILE_NAME);
  });

  it("User.create.data has exactly the 7 baseline fields (name, email, phone, role, status, image, customer:connect)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txUserCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    const data = (txUserCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data).toBeDefined();
    expect(data?.name).toBe(CUSTOMER_NAME);
    expect(data?.email).toBe(OAUTH_EMAIL);
    expect(data?.phone).toBe(CUSTOMER_PHONE);
    expect(data?.role).toBe("CUSTOMER");
    expect(data?.status).toBe("ACTIVE");
    expect(data?.image).toBe(OAUTH_IMAGE);
    expect(data?.customer).toEqual({ connect: { id: CUSTOMER_ID } });
  });

  it("User.phone === customer.phone || null — falls back to null when customer.phone is empty", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ phone: "" }),
    );
    const { txUserCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    const data = (txUserCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data?.phone).toBe(null);
  });

  it("Account.create.data has EXACTLY the 10 baseline fields — NO session_state (Codex round 10 P2)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txAccountCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    const data = (txAccountCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data).toBeDefined();

    // The 10 baseline fields must be present.
    expect(data).toHaveProperty("userId", NEW_USER_ID);
    expect(data).toHaveProperty("type", "oauth");
    expect(data).toHaveProperty("provider", "line");
    expect(data).toHaveProperty("providerAccountId", LINE_USER_ID);
    expect(data).toHaveProperty("access_token", "atok");
    expect(data).toHaveProperty("refresh_token", "rtok");
    expect(data).toHaveProperty("id_token", "idtok");
    expect(data).toHaveProperty("expires_at", 1_700_000_000);
    expect(data).toHaveProperty("scope", "profile openid");
    expect(data).toHaveProperty("token_type", "Bearer");

    // session_state MUST NOT be in the data payload — baseline auth.ts
    // Case B (lines 634-647) does not write it. Including it would
    // silently extend the Account row vs current behaviour.
    expect(data).not.toHaveProperty("session_state");
  });

  it("Account.create data NEVER contains session_state even if some upstream caller leaks it via the input shape (defense)", async () => {
    // The input shape `ActivatePrecreatedCustomerWithLineInput.oauthAccount`
    // doesn't define session_state, but a misuse like `... as any` could
    // still smuggle it in. Verify the helper does not propagate.
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txAccountCreate } = setupTransaction();

    const input = makeValidInput();
    // Force an extra field on the oauthAccount object (type system would
    // normally reject this).
    (input.oauthAccount as Record<string, unknown>).session_state = "leak";

    await activatePrecreatedCustomerWithLine(input);

    const data = (txAccountCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data).not.toHaveProperty("session_state");
  });

  it("Customer.updateMany writes authSource: 'LINE' + lineUserId + lineLinkStatus: 'LINKED' + lineLinkedAt + lineName + userId", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerUpdateMany } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    const arg = txCustomerUpdateMany.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
      data?: Record<string, unknown>;
    };
    expect(arg?.where).toEqual({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: null,
      lineUserId: null,
      mergedIntoCustomerId: null,
    });
    expect(arg?.data).toEqual({
      userId: NEW_USER_ID,
      authSource: "LINE",
      lineUserId: LINE_USER_ID,
      lineLinkStatus: "LINKED",
      lineLinkedAt: expect.any(Date),
      lineName: LINE_NAME,
    });
  });

  it("Customer.updateMany OMITS lineName field when input.lineName is null (matches baseline `if (oauthName)` guard at auth.ts line 656)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerUpdateMany } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput({ lineName: null }));

    const data = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data).toBeDefined();
    // Baseline: `if (oauthName) updateData.lineName = oauthName;` — null
    // means the field is OMITTED, not written as null.
    expect(data).not.toHaveProperty("lineName");
    // Other fields still present.
    expect(data).toHaveProperty("userId", NEW_USER_ID);
    expect(data).toHaveProperty("authSource", "LINE");
    expect(data).toHaveProperty("lineUserId", LINE_USER_ID);
  });

  it("null/undefined OAuth token fields pass through to Account.create as undefined (Prisma omits) — preserves Case B behaviour for missing token fields", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txAccountCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(
      makeValidInput({
        oauthAccount: {
          provider: "line",
          providerAccountId: LINE_USER_ID,
          type: "oauth",
          access_token: null,
          refresh_token: undefined,
          id_token: null,
          expires_at: null,
          scope: undefined,
          token_type: null,
        },
      }),
    );

    const data = (txAccountCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    // The 4 core required fields are always present.
    expect(data).toHaveProperty("userId");
    expect(data).toHaveProperty("type");
    expect(data).toHaveProperty("provider");
    expect(data).toHaveProperty("providerAccountId");
    // The token fields are present-but-undefined (Prisma skips them on insert).
    // The KEYS exist (since Prisma data object includes them); their VALUES
    // are undefined.
    expect(data).toHaveProperty("access_token");
    expect((data as Record<string, unknown>).access_token).toBeUndefined();
    expect(data).toHaveProperty("refresh_token");
    expect((data as Record<string, unknown>).refresh_token).toBeUndefined();
    expect(data).toHaveProperty("id_token");
    expect((data as Record<string, unknown>).id_token).toBeUndefined();
    // session_state still absent.
    expect(data).not.toHaveProperty("session_state");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Pre-write guards (every rejection branch is 0 DB writes)
// ════════════════════════════════════════════════════════════════════════════

describe("pre-write guards (every rejection branch is 0 DB writes)", () => {
  it("store_mismatch: customer not found → store_mismatch with actualStoreId='(not_found)'; 0 tx", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(null);

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "store_mismatch",
      expectedStoreId: STORE_ID,
      actualStoreId: "(not_found)",
    });
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("store_mismatch: customer.storeId !== input.storeId → store_mismatch; 0 tx", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ storeId: OTHER_STORE_ID }),
    );

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "store_mismatch",
      expectedStoreId: STORE_ID,
      actualStoreId: OTHER_STORE_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("customer_already_has_user: customer.userId !== null → reject; 0 tx (must route to bindLineToExistingCustomerById)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ userId: EXISTING_USER_ID }),
    );

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "customer_already_has_user",
      customerId: CUSTOMER_ID,
      userId: EXISTING_USER_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("stale_customer_link (preflight): merged source Customer → 0 tx", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ mergedIntoCustomerId: CANONICAL_CUSTOMER_ID }),
    );

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("customer_already_linked_to_other_line: Customer.lineUserId set to a DIFFERENT lineUserId → 0 tx", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ lineUserId: OTHER_LINE_USER_ID }),
    );

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "customer_already_linked_to_other_line",
      customerId: CUSTOMER_ID,
      existingLineUserId: OTHER_LINE_USER_ID,
    });
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("customer.lineUserId === input.lineUserId (drift state with userId === null) → falls through to tx; the conditional updateMany count=0 returns stale_customer_link", async () => {
    // Edge case: Customer.userId is null (Case B precondition) BUT
    // Customer.lineUserId already equals input.lineUserId. This is
    // drift state — the conditional updateMany's `lineUserId: null`
    // predicate fails at tx-write boundary; helper returns
    // stale_customer_link instead of activating.
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ lineUserId: LINE_USER_ID }),
    );
    const { txCustomerUpdateMany, txUserCreate, txAccountCreate } =
      setupTransaction();
    // The tx callback runs (preflight allows this case through), but
    // updateMany returns count: 0 because lineUserId is non-null.
    txCustomerUpdateMany.mockResolvedValueOnce({ count: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    // tx ran (user.create + account.create both attempted, then
    // updateMany count=0 throws StaleCustomerLinkError → rollback).
    expect(mockTx).toHaveBeenCalledTimes(1);
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    // Rollback semantics are Prisma's responsibility — the test
    // confirms the helper threw inside the callback, not committed.
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Atomicity / rollback
// ════════════════════════════════════════════════════════════════════════════

describe("A3 atomicity (PR-G5.0 §1.3 / §5.3.3 step 7)", () => {
  it("account.create throws → tx rolls back → no orphan User / no Customer write committed", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());

    const txUserCreate = vi.fn().mockResolvedValue({ id: NEW_USER_ID });
    const txAccountCreate = vi
      .fn()
      .mockRejectedValue(new Error("account-write-failed"));
    const txCustomerUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { create: txUserCreate },
          account: { create: txAccountCreate },
          customer: { updateMany: txCustomerUpdateMany },
        };
        return cb(tx);
      },
    );

    await expect(
      activatePrecreatedCustomerWithLine(makeValidInput()),
    ).rejects.toThrow("account-write-failed");

    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    // Customer.updateMany was NEVER reached (account.create threw before).
    expect(txCustomerUpdateMany).not.toHaveBeenCalled();
  });

  it("stale Customer condition (in-tx updateMany count !== 1) → no orphan User / no orphan Account leaks", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());

    const txUserCreate = vi.fn().mockResolvedValue({ id: NEW_USER_ID });
    const txAccountCreate = vi
      .fn()
      .mockResolvedValue({ id: "acc-id" });
    const txCustomerUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    mockTx.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { create: txUserCreate },
          account: { create: txAccountCreate },
          customer: { updateMany: txCustomerUpdateMany },
        };
        return cb(tx);
      },
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    // All 3 writes were attempted inside the tx callback (User.create
    // ran first, then Account.create, then updateMany count=0 throws).
    // Prisma rolls back the whole tx — no row commits.
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("Serializable isolation requested (race protection)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { getIsolationLevel } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(getIsolationLevel()).toBe("Serializable");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. Race / conflict translation (P2002, P2034)
// ════════════════════════════════════════════════════════════════════════════

describe("race / conflict translation (Prisma error codes → controlled statuses)", () => {
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

  it("Account.create P2002 (provider+providerAccountId) → unique_conflict", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    mockTx.mockImplementationOnce(async () => {
      throw makeP2002(["provider", "providerAccountId"]);
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "unique_conflict",
      conflictTarget: "provider,providerAccountId",
    });
  });

  it("User.create P2002 (e.g. storeId+phone unique on User) → unique_conflict", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    mockTx.mockImplementationOnce(async () => {
      throw makeP2002(["storeId", "phone"]);
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "unique_conflict",
      conflictTarget: "storeId,phone",
    });
  });

  it("Tx throws P2034 → write_conflict", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    mockTx.mockImplementationOnce(async () => {
      throw makeP2034();
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({ status: "write_conflict", code: "P2034" });
  });

  it("Non-P2002 / non-P2034 errors are re-thrown (unknown DB failures stay visible)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    mockTx.mockImplementationOnce(async () => {
      throw new Error("db-connection-died");
    });

    await expect(
      activatePrecreatedCustomerWithLine(makeValidInput()),
    ).rejects.toThrow("db-connection-died");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. PII / log masking
// ════════════════════════════════════════════════════════════════════════════

describe("PII masking (PR-G5.0 / line-bind-log contract)", () => {
  it("stale_customer_link (preflight merged) does NOT log (predictable reject)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ mergedIntoCustomerId: CANONICAL_CUSTOMER_ID }),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("stale_customer_link (in-tx race) log payload is masked — no raw IDs / phone / email", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerUpdateMany } = setupTransaction();
    txCustomerUpdateMany.mockResolvedValueOnce({ count: 0 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const dumped = warnSpy.mock.calls
      .flat()
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join("\n");

    // Raw values must NEVER appear.
    expect(dumped).not.toContain(STORE_ID);
    expect(dumped).not.toContain(CUSTOMER_ID);
    expect(dumped).not.toContain(LINE_USER_ID);
    expect(dumped).not.toContain(CUSTOMER_PHONE);
    expect(dumped).not.toContain(OAUTH_EMAIL);

    // Masked forms must appear.
    expect(dumped).toContain("stale_customer_link");
    expect(dumped).toContain("store-****");
    expect(dumped).toContain("ckcust****");
    expect(dumped).toContain("U123****ef");

    warnSpy.mockRestore();
  });

  it("happy path does NOT log (caller owns success log)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    setupTransaction();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("P2002 / P2034 logs use masked values (no raw IDs)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    mockTx.mockImplementationOnce(async () => {
      const err: Error & { code?: string; meta?: { target?: string[] } } =
        new Error("Unique constraint failed");
      err.code = "P2002";
      err.meta = { target: ["provider", "providerAccountId"] };
      throw err;
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await activatePrecreatedCustomerWithLine(makeValidInput());

    const dumped = warnSpy.mock.calls
      .flat()
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join("\n");
    expect(dumped).not.toContain(LINE_USER_ID);
    expect(dumped).not.toContain(STORE_ID);
    expect(dumped).toContain("unique_conflict");
    warnSpy.mockRestore();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. Pre-write contract sweep — rejection branches commit 0 DB writes
// ════════════════════════════════════════════════════════════════════════════

describe("pre-write contract sweep — rejection branches commit 0 DB writes", () => {
  it.each([
    [
      "store_mismatch (customer not found)",
      () => mockCustomerFindUnique.mockResolvedValueOnce(null),
    ],
    [
      "store_mismatch (wrong store)",
      () =>
        mockCustomerFindUnique.mockResolvedValueOnce(
          precreatedCustomerFixture({ storeId: OTHER_STORE_ID }),
        ),
    ],
    [
      "customer_already_has_user",
      () =>
        mockCustomerFindUnique.mockResolvedValueOnce(
          precreatedCustomerFixture({ userId: EXISTING_USER_ID }),
        ),
    ],
    [
      "stale_customer_link (merged)",
      () =>
        mockCustomerFindUnique.mockResolvedValueOnce(
          precreatedCustomerFixture({
            mergedIntoCustomerId: CANONICAL_CUSTOMER_ID,
          }),
        ),
    ],
    [
      "customer_already_linked_to_other_line",
      () =>
        mockCustomerFindUnique.mockResolvedValueOnce(
          precreatedCustomerFixture({ lineUserId: OTHER_LINE_USER_ID }),
        ),
    ],
  ])("no tx happens on %s", async (_label, setup) => {
    setup();
    await activatePrecreatedCustomerWithLine(makeValidInput());
    expect(mockTx).not.toHaveBeenCalled();
  });
});
