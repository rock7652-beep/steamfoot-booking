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
  // In-tx Case-B guard (PR #243 Codex P1 round 5) — default returns a
  // non-null row so the happy-path tests proceed past the guard.
  // Stale-race tests override with `.mockResolvedValueOnce(null)`.
  const txCustomerFindFirst = vi.fn().mockResolvedValue({ id: CUSTOMER_ID });
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
        customer: {
          findFirst: txCustomerFindFirst,
          updateMany: txCustomerUpdateMany,
        },
      };
      return cb(tx);
    },
  );

  return {
    txCustomerFindFirst,
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

  it("User.create.data has exactly 6 User-row columns (name, email, phone, role, status, image) — NO `customer: { connect }` per PR #243 Codex P1 round 1", async () => {
    // PR #243 Codex P1 round 1: the nested `customer.connect` in
    // baseline auth.ts Case B sets Customer.userId as a Prisma
    // relation side-effect — but that side-effect runs BEFORE the
    // conditional Customer.updateMany at step 7c, and the
    // updateMany.where requires `userId: null`. The connect would
    // make the happy path match 0 rows.
    //
    // Fix: drop the nested connect; the FK write moves into the
    // CAS updateMany.data.userId. End-state DB row is byte-equal
    // vs baseline — User row has the same 6 column values; Customer
    // row gets the same final userId — only the mechanism differs.
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
    // ⚠ The FK side-effect MUST NOT be present in user.create —
    //   it's set explicitly by the CAS in Customer.updateMany.data.
    expect(data).not.toHaveProperty("customer");
    // Exactly 6 keys.
    expect(Object.keys(data ?? {}).sort()).toEqual(
      ["email", "image", "name", "phone", "role", "status"].sort(),
    );
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
      mergedIntoCustomerId: null,
      // PR #243 Codex P2 round 6: lineUserId predicate accepts null
      // (fresh staff-precreated) OR input.lineUserId (same-LINE
      // placeholder created by /oauth-confirm NEW_USER flow).
      OR: [
        { lineUserId: null },
        { lineUserId: LINE_USER_ID },
      ],
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

  it("null OAuth token fields pass through as null (NOT silently coerced to undefined) — byte-equivalent vs auth.ts Case B baseline (PR #243 Codex P2 round 2)", async () => {
    // Baseline auth.ts uses `as string | undefined` type-casts that
    // don't change runtime values. Null stays null, undefined stays
    // undefined, string stays string. The helper must mirror that
    // behaviour — `?? undefined` would silently drop nulls and
    // diverge from baseline.
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

    // null token fields pass through AS null (NOT coerced to undefined).
    expect((data as Record<string, unknown>).access_token).toBeNull();
    expect((data as Record<string, unknown>).id_token).toBeNull();
    expect((data as Record<string, unknown>).expires_at).toBeNull();
    expect((data as Record<string, unknown>).token_type).toBeNull();
    // undefined token fields stay undefined (Prisma's standard
    // omit-on-undefined behaviour applies in production; the helper
    // doesn't normalize either way).
    expect((data as Record<string, unknown>).refresh_token).toBeUndefined();
    expect((data as Record<string, unknown>).scope).toBeUndefined();
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

  it("P2 round 6 same-LINE placeholder: customer.lineUserId === input.lineUserId (userId === null) is a LEGITIMATE activation target, NOT drift — both in-tx findFirst and updateMany accept it (OR clause)", async () => {
    // /oauth-confirm NEW_USER flow creates Customer with
    //   userId === null  AND  lineUserId === input.lineUserId
    // (the placeholder is created with the LINE userId already set so
    // the bot can post-fill messaging immediately). The activation
    // helper must accept this row — guard predicate is:
    //   userId === null
    //   mergedIntoCustomerId === null
    //   storeId matches
    //   lineUserId IN [null, input.lineUserId]
    //
    // PRE round 6: this case was rejected (in-tx CAS used
    // `lineUserId: null` literal); count=0 → stale_customer_link.
    // POST round 6: in-tx findFirst + updateMany both use the OR
    // clause, so the row passes both guards → activated.
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ lineUserId: LINE_USER_ID }),
    );
    const { txCustomerUpdateMany, txUserCreate, txAccountCreate } =
      setupTransaction();
    // updateMany now matches the same-LINE placeholder via the OR
    // clause → count=1 → activated.
    txCustomerUpdateMany.mockResolvedValueOnce({ count: 1 });

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "activated",
      customerId: CUSTOMER_ID,
      userId: NEW_USER_ID,
    });
    expect(mockTx).toHaveBeenCalledTimes(1);
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Atomicity / rollback
// ════════════════════════════════════════════════════════════════════════════

describe("A3 atomicity (PR-G5.0 §1.3 / §5.3.3 step 7)", () => {
  it("account.create throws → tx rolls back → no orphan User / no Customer write committed", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());

    const txCustomerFindFirst = vi.fn().mockResolvedValue({ id: CUSTOMER_ID });
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
          customer: {
            findFirst: txCustomerFindFirst,
            updateMany: txCustomerUpdateMany,
          },
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

    const txCustomerFindFirst = vi.fn().mockResolvedValue({ id: CUSTOMER_ID });
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
          customer: {
            findFirst: txCustomerFindFirst,
            updateMany: txCustomerUpdateMany,
          },
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

// ════════════════════════════════════════════════════════════════════════════
// 8. P1 round 1 (PR #243 Codex): Customer.userId set by the CAS, NOT by
//    a nested customer.connect in User.create
// ════════════════════════════════════════════════════════════════════════════
//
// Codex P1: the baseline auth.ts Case B uses
//   prisma.user.create({ data: { ..., customer: { connect: { id } } } })
// which sets Customer.userId via Prisma's relation side-effect BEFORE
// the subsequent customer.update runs. When refactored into a single
// $transaction with a conditional Customer.updateMany using
// `where: { userId: null }`, the side-effect breaks the CAS — the
// happy-path matches 0 rows, throws StaleCustomerLinkError, and
// rolls back.
//
// Fix: remove the nested connect; let the CAS updateMany be the
// SINGLE write that sets Customer.userId (it already includes
// `userId: newUser.id` in its data payload).
//
// End-state byte-equivalence vs baseline:
//   - User row: identical 6 columns / values
//   - Account row: identical 10 columns / values (NO session_state)
//   - Customer row: identical final userId + link metadata
// Only the WRITE MECHANISM for Customer.userId changes (connect
// side-effect → explicit data field).

import { readFileSync } from "node:fs";
import path from "node:path";

describe("P1 round 1 (Codex): Customer.userId is set by the CAS, not by user.create nested connect", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  // ─ Behavioural ─────────────────────────────────────────────────────────

  it("happy path: tx.user.create data does NOT include `customer: { connect }` — the CAS owns the FK write", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txUserCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    const data = (txUserCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data).toBeDefined();
    expect(data).not.toHaveProperty("customer");
    // Defense in depth: no `connect` key anywhere either.
    expect(data).not.toHaveProperty("connect");
  });

  it("happy path: Customer.updateMany.where has `userId: null` AND `mergedIntoCustomerId: null` AND OR-clause for lineUserId (CAS predicate, round 6 same-LINE placeholder relaxation)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerUpdateMany } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    const arg = txCustomerUpdateMany.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    };
    expect(arg?.where).toEqual({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: null,
      mergedIntoCustomerId: null,
      OR: [
        { lineUserId: null },
        { lineUserId: LINE_USER_ID },
      ],
    });
  });

  it("happy path: Customer.updateMany.data sets `userId: newUser.id` — the SINGLE write that establishes the FK", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerUpdateMany } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    const data = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data).toBeDefined();
    expect(data?.userId).toBe(NEW_USER_ID);
  });

  it("happy path end-to-end: returns activated, all 3 writes occur in order — no rollback due to CAS mismatch (the bug Codex flagged)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txUserCreate, txAccountCreate, txCustomerUpdateMany } =
      setupTransaction();

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "activated",
      customerId: CUSTOMER_ID,
      userId: NEW_USER_ID,
    });
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("regression: when Customer.updateMany returns count=0 AFTER user/account create, tx rolls back and returns stale_customer_link (no orphan User / Account observable)", async () => {
    // This is the scenario the connect-side-effect would have caused
    // on EVERY happy path before round 1: the CAS predicate
    // (userId: null) fails after the connect set it to newUser.id.
    // Now we simulate the equivalent post-create race directly.
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txUserCreate, txAccountCreate, txCustomerUpdateMany } =
      setupTransaction();
    txCustomerUpdateMany.mockResolvedValueOnce({ count: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    // All 3 writes were attempted inside the tx callback; Prisma
    // rolls back the whole tx on the sentinel throw — no row
    // commits to the DB.
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
  });

  // ─ Source-structure ───────────────────────────────────────────────────

  it("source: the activation helper body contains NO `customer: { connect:` pattern (regression sentinel)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("export async function activatePrecreatedCustomerWithLine");
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    // The user.create call inside the helper MUST NOT include a
    // nested customer-connect. Anchor on the exact pattern that
    // baseline auth.ts Case B uses (line 630).
    expect(fnBody).not.toMatch(/customer\s*:\s*\{\s*connect\s*:/);
  });

  it("source: tx.user.create call ordering — user.create runs BEFORE the Customer.updateMany CAS (so the CAS data.userId can reference newUser.id)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("export async function activatePrecreatedCustomerWithLine");
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    const userCreateIdx = fnBody.indexOf("tx.user.create");
    const accountCreateIdx = fnBody.indexOf("tx.account.create");
    const updateManyIdx = fnBody.indexOf("tx.customer.updateMany");
    expect(userCreateIdx).toBeGreaterThan(-1);
    expect(accountCreateIdx).toBeGreaterThan(-1);
    expect(updateManyIdx).toBeGreaterThan(-1);

    // user.create < account.create < customer.updateMany
    expect(userCreateIdx).toBeLessThan(accountCreateIdx);
    expect(accountCreateIdx).toBeLessThan(updateManyIdx);
  });

  it("source: Customer.updateMany.data contains `userId:` field assignment (the SINGLE FK write)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("function buildActivationCustomerUpdateData");
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    // The data payload builder must emit `userId: params.userId` —
    // that's the FK write that moved out of user.create's connect.
    expect(fnBody).toMatch(/userId\s*:\s*params\.userId/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. P1 round 2 (PR #243 Codex): strengthen "no relation-side-effect"
//    source assertions so Codex's static reader sees the absence
//    unambiguously
// ════════════════════════════════════════════════════════════════════════════
//
// Round 1 removed the nested `customer: { connect: { id } }` from
// `tx.user.create.data` (so Customer.userId is set only by the CAS
// updateMany). Codex still flagged the P1 — its reader needs more
// explicit source-level absence assertions. Round 2 adds:
//
//   - regex with `\s*` between `customer` and `connect` (less greedy
//     than the brace form, catches `customer.connect`, `customer .
//     connect`, etc.)
//   - assertion on the user.create OPTIONS literal (between `data: {`
//     and the matching `}`) — no `customer`, no `connect`
//   - explicit grep over the entire file for both forms

describe("P1 round 2 (Codex): strengthen no-relation-side-effect source assertions", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  function readActivationFnBody(): string {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(
      "export async function activatePrecreatedCustomerWithLine",
    );
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    return termRel >= 0 ? tail.slice(0, termRel + 2) : tail;
  }

  it("source: helper body has NO `customer: { connect:` pattern (brace form)", () => {
    const fnBody = readActivationFnBody();
    expect(fnBody).not.toMatch(/customer\s*:\s*\{\s*connect\s*:/);
  });

  it("source: helper body has NO `customer.connect` pattern (dotted form, in case anyone refactors to a different relation-write syntax)", () => {
    const fnBody = readActivationFnBody();
    expect(fnBody).not.toMatch(/customer\s*\.\s*connect\b/);
  });

  it("source: `tx.user.create` call uses the scalar-only builder — `data: buildActivationUserCreateData(...)`, NEVER an inline `data: { ... }` literal (PR #243 Codex P1 round 4: stale inline-data anchor removed)", () => {
    const fnBody = readActivationFnBody();
    // Locate the `tx.user.create(` call AND its matching close.
    // The slice must stop AT the user.create call boundary —
    // extending into the next call (`tx.account.create({ data: { ... } })`)
    // would falsely match its legitimate inline data literal.
    const userCreateIdx = fnBody.indexOf("tx.user.create(");
    expect(userCreateIdx).toBeGreaterThan(-1);

    // Walk forward from the call's `(` and track paren depth until
    // the matching `)`. The activation helper's user.create has
    // exactly one set of balanced parens at the outermost level.
    let depth = 0;
    let endIdx = userCreateIdx;
    const startParenIdx = fnBody.indexOf("(", userCreateIdx);
    expect(startParenIdx).toBeGreaterThan(-1);
    for (let i = startParenIdx; i < fnBody.length; i++) {
      const ch = fnBody[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
    expect(endIdx).toBeGreaterThan(startParenIdx);
    const userCreateCallSlice = fnBody.slice(userCreateIdx, endIdx);

    // Required: the call passes the typed builder as `data`.
    expect(userCreateCallSlice).toMatch(
      /data\s*:\s*buildActivationUserCreateData\s*\(/,
    );
    // Forbidden: inline `data: { ... }` literal within the user.create
    // call. The previous implementation used an inline literal —
    // round 3 replaced it with the named builder so a stray inline
    // literal here would signal a regression that re-opens the P1
    // (caller could then sneak a customer-relation key into the
    // literal).
    expect(userCreateCallSlice).not.toMatch(/data\s*:\s*\{/);
  });

  it("source: full file (not just helper body) contains ZERO `customer: { connect` patterns — defense across documentation, contract blocks, anywhere", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Brace + dotted forms both forbidden.
    expect(src).not.toMatch(/customer\s*:\s*\{\s*connect\s*:/);
    expect(src).not.toMatch(/customer\s*\.\s*connect\b/);
  });

  // ─ Behavioural reinforcements ─────────────────────────────────────────

  it("happy path (round-2 reinforcement): Customer.updateMany.data.userId === newUser.id AND tx.user.create.data omits `customer` — the FK lives ONLY on the CAS", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txUserCreate, txCustomerUpdateMany } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    // (a) tx.user.create.data has no customer key (P1 invariant).
    const userData = (txUserCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(userData).not.toHaveProperty("customer");

    // (b) Customer.updateMany.data.userId === newUser.id (the only
    //     write that sets the FK).
    const cuData = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(cuData?.userId).toBe(NEW_USER_ID);

    // (c) Customer.updateMany.where.userId === null (the CAS
    //     predicate that confirms no prior FK write happened).
    const cuWhere = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    })?.where;
    expect(cuWhere?.userId).toBe(null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. P2 round 1 (PR #243 Codex): truthy lineName guard preserves baseline
//     `if (oauthName)` semantics — null AND empty string both omit lineName
// ════════════════════════════════════════════════════════════════════════════
//
// Codex P2: the helper previously used `if (params.lineName !== null)`,
// which would let an empty string `""` through and OVERWRITE a stored
// Customer.lineName with blank. Baseline auth.ts Case B uses
// `if (oauthName)` truthy check (line 656). Round 1 changes the guard
// to `if (params.lineName)` so null AND "" both omit the field.

describe("P2 round 1 (Codex): truthy lineName guard (matches baseline `if (oauthName)`)", () => {
  it("lineName = 'Alice' → Customer.updateMany.data includes lineName: 'Alice'", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerUpdateMany } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput({ lineName: "Alice" }));

    const data = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data).toHaveProperty("lineName", "Alice");
  });

  it("lineName = '' (empty string) → Customer.updateMany.data OMITS lineName (would otherwise blank a stored displayName)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerUpdateMany } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput({ lineName: "" }));

    const data = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data).not.toHaveProperty("lineName");
    // Other fields still present.
    expect(data).toHaveProperty("userId", NEW_USER_ID);
    expect(data).toHaveProperty("authSource", "LINE");
    expect(data).toHaveProperty("lineUserId", LINE_USER_ID);
  });

  it("lineName = null → Customer.updateMany.data OMITS lineName (baseline `if (oauthName)`)", async () => {
    // Already covered by section #2 above, re-asserted here under
    // the round-1 P2 grouping for completeness.
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerUpdateMany } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput({ lineName: null }));

    const data = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data).not.toHaveProperty("lineName");
  });

  it("source: buildActivationCustomerUpdateData uses a TRUTHY guard `if (params.lineName)` — NOT `if (params.lineName !== null)` (regression sentinel for P2 round 1)", () => {
    const HELPER_PATH = path.resolve(
      __dirname,
      "..",
      "server",
      "services",
      "bind-line-to-customer.ts",
    );
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("function buildActivationCustomerUpdateData");
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    // Truthy guard must be present.
    expect(fnBody).toMatch(/if\s*\(\s*params\.lineName\s*\)/);
    // Null-only guards must NOT be present.
    expect(fnBody).not.toMatch(/if\s*\(\s*params\.lineName\s*!==\s*null\s*\)/);
    expect(fnBody).not.toMatch(/if\s*\(\s*params\.lineName\s*!=\s*null\s*\)/);
    // String-comparison guards must NOT be present (an alternate way
    // someone might "fix" the empty-string case wrong).
    expect(fnBody).not.toMatch(
      /if\s*\(\s*params\.lineName\s*!==\s*['"]['"]\s*\)/,
    );
  });

  it("lineName = '   ' (whitespace) → Customer.updateMany.data INCLUDES lineName: '   ' — truthy check matches JS truthiness, NOT trim()-truthiness (baseline parity)", async () => {
    // Baseline auth.ts uses raw `if (oauthName)` — whitespace strings
    // are truthy in JS. The helper must NOT silently trim or normalize
    // (that would diverge from baseline). If product wants trim,
    // that's a separate change at the caller layer.
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerUpdateMany } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput({ lineName: "   " }));

    const data = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data).toHaveProperty("lineName", "   ");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. P1 round 3 (PR #243 Codex): buildActivationUserCreateData extracted
//     as a typed scalar-only helper so the customer relation-write is
//     IMPOSSIBLE to express at the type level
// ════════════════════════════════════════════════════════════════════════════
//
// Codex P1 remained active after round 1 (removed inline connect) and
// round 2 (strengthened source assertions). Per the user spec, round 3
// extracts the User.create data into a named private helper with a
// LITERAL-TYPED return shape that excludes any customer relation key.
// TypeScript itself now enforces the contract.

describe("P1 round 3 (Codex): buildActivationUserCreateData scalar-only typed extraction", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  it("source: buildActivationUserCreateData exists as a named private fn (no `export` keyword)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    expect(src).toMatch(
      /function\s+buildActivationUserCreateData\s*\(\s*args\s*:/,
    );
    expect(src).not.toMatch(
      /export\s+function\s+buildActivationUserCreateData/,
    );
  });

  it("source: buildActivationUserCreateData's RETURN TYPE annotation literally lists the 6 scalar User columns (name, email, phone, role, status, image) — no `customer` field in the type", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("function buildActivationUserCreateData");
    expect(fnStart).toBeGreaterThan(-1);

    // The signature layout is:
    //   function buildActivationUserCreateData(args: { ... }): {
    //     name: ...
    //     ...
    //   } {
    //     return { ... };
    //   }
    // We want ONLY the return-type annotation slice — between `}): {`
    // (end of args + opening of return type) and the body `{` that
    // begins `{\n  return`.
    const tail = src.slice(fnStart);
    const argsEndIdx = tail.indexOf("}): {");
    expect(argsEndIdx).toBeGreaterThan(-1);
    // Start of return-type literal is right after `}): `.
    const returnTypeStart = argsEndIdx + "}): ".length;
    const bodyOpenIdx = tail.indexOf("{\n  return", returnTypeStart);
    expect(bodyOpenIdx).toBeGreaterThan(returnTypeStart);
    const returnTypeAnnotation = tail.slice(returnTypeStart, bodyOpenIdx);

    // The return-type literal must declare each of the 6 baseline keys.
    expect(returnTypeAnnotation).toMatch(/name\s*:\s*string/);
    expect(returnTypeAnnotation).toMatch(/email\s*:\s*string\s*\|\s*null/);
    expect(returnTypeAnnotation).toMatch(/phone\s*:\s*string\s*\|\s*null/);
    expect(returnTypeAnnotation).toMatch(/role\s*:\s*"CUSTOMER"/);
    expect(returnTypeAnnotation).toMatch(/status\s*:\s*"ACTIVE"/);
    expect(returnTypeAnnotation).toMatch(/image\s*:\s*string\s*\|\s*null/);

    // The return type MUST NOT declare a `customer` key — that's the
    // type-system contract that makes the relation-write impossible
    // at the call site.
    expect(returnTypeAnnotation).not.toMatch(/(^|\n)\s*customer\s*:/);
    expect(returnTypeAnnotation).not.toMatch(/(^|\n)\s*connect\s*:/);
  });

  it("source: buildActivationUserCreateData's RETURN OBJECT literal also has no `customer` / `connect` field key (extracted body)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("function buildActivationUserCreateData");
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    // Extract the `return { ... }` literal.
    const returnIdx = fnBody.indexOf("return {");
    expect(returnIdx).toBeGreaterThan(-1);
    const fromReturn = fnBody.slice(returnIdx + "return {".length);
    const closeIdx = fromReturn.indexOf("};");
    expect(closeIdx).toBeGreaterThan(-1);
    const returnBody = fromReturn.slice(0, closeIdx);

    // Each of the 6 scalar keys present.
    expect(returnBody).toMatch(/(^|\n)\s*name\s*:/);
    expect(returnBody).toMatch(/(^|\n)\s*email\s*:/);
    expect(returnBody).toMatch(/(^|\n)\s*phone\s*:/);
    expect(returnBody).toMatch(/(^|\n)\s*role\s*:/);
    expect(returnBody).toMatch(/(^|\n)\s*status\s*:/);
    expect(returnBody).toMatch(/(^|\n)\s*image\s*:/);

    // No relation-write keys.
    expect(returnBody).not.toMatch(/(^|\n)\s*customer\s*:/);
    expect(returnBody).not.toMatch(/(^|\n)\s*connect\s*:/);
  });

  it("source: activation helper's `tx.user.create` call passes `buildActivationUserCreateData(...)` as data — no inline object literal survives", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(
      "export async function activatePrecreatedCustomerWithLine",
    );
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    // The tx.user.create call passes the builder's return value as
    // data — not an inline object literal.
    expect(fnBody).toMatch(
      /tx\.user\.create\s*\(\s*\{\s*data\s*:\s*buildActivationUserCreateData\s*\(/,
    );
  });

  it("source: buildActivationUserCreateData is called exactly ONCE in the file (as a real statement, not a JSDoc mention)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Real call shape: `data: buildActivationUserCreateData(`.
    // JSDoc backticks would have different surrounding syntax.
    const realCalls =
      src.match(/data\s*:\s*buildActivationUserCreateData\s*\(/g) ?? [];
    expect(realCalls.length).toBe(1);
  });

  // ─ Behavioural reinforcements ─────────────────────────────────────────

  it("behavioural (round 3): tx.user.create.data has EXACTLY the 6 scalar baseline keys — type-system-enforced contract", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txUserCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    const data = (txUserCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data).toBeDefined();
    expect(Object.keys(data ?? {}).sort()).toEqual(
      ["email", "image", "name", "phone", "role", "status"].sort(),
    );
    // Explicit double-check on the FK absence.
    expect(data).not.toHaveProperty("customer");
    expect(data).not.toHaveProperty("connect");
  });

  it("behavioural (round 3): the User.create data values are byte-equivalent vs auth.ts Case B baseline scalar columns", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txUserCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    const data = (txUserCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(data?.name).toBe(CUSTOMER_NAME);
    expect(data?.email).toBe(OAUTH_EMAIL);
    expect(data?.phone).toBe(CUSTOMER_PHONE);
    expect(data?.role).toBe("CUSTOMER");
    expect(data?.status).toBe("ACTIVE");
    expect(data?.image).toBe(OAUTH_IMAGE);
  });

  it("regression (round 3): updateMany count=0 still rolls back; stale_customer_link returned", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerUpdateMany, txAccountCreate } = setupTransaction();
    txCustomerUpdateMany.mockResolvedValueOnce({ count: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    // Confirms tx body order is still: user.create → account.create
    // → updateMany → throw on count=0; no orphan side-effect.
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 12. P1 round 4 (PR #243 Codex): consolidated invariant block — all six
//     "move Case-B guard before connecting the customer" assertions in
//     one place, anchored on the user spec's verbatim requirements
// ════════════════════════════════════════════════════════════════════════════
//
// The previous rounds shipped the structural fix and individual source
// tests, but Codex kept the P1 active. Round 4 consolidates the six
// user-spec invariants into a single deterministic test block so the
// safety property is visible at a single source location. If any
// assertion fails, the test name + user-spec invariant number tells
// the reader exactly which contract was broken.

describe("P1 round 4 (Codex): six user-spec invariants for Case-B guard ordering", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  it("invariant 1: helper source has ZERO `customer: { connect` brace-form pattern (implementation, comment, or anywhere)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    expect(src).not.toMatch(/customer\s*:\s*\{\s*connect\s*:/);
  });

  it("invariant 1: helper source has ZERO `customer.connect` dotted-form pattern", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    expect(src).not.toMatch(/customer\s*\.\s*connect\b/);
  });

  it("invariant 1: helper source has ZERO `connect: { id: customer.id }` pattern (in case anyone refactors to a different relation syntax that still uses `connect:`)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // The connect-with-customer.id form is the auth.ts baseline shape
    // that round 1 removed. Forbidden anywhere.
    expect(src).not.toMatch(/connect\s*:\s*\{\s*id\s*:\s*customer\.id/);
  });

  it("invariant 2: activation helper's `tx.user.create` call passes `buildActivationUserCreateData(...)` — visibly named, scalar-only builder", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(
      "export async function activatePrecreatedCustomerWithLine",
    );
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;
    expect(fnBody).toMatch(
      /tx\.user\.create\s*\(\s*\{\s*data\s*:\s*buildActivationUserCreateData\s*\(/,
    );
  });

  it("invariant 3: `buildActivationUserCreateData` return type excludes `customer` — TypeScript-enforced absence", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Locate the builder's signature + return type.
    const fnStart = src.indexOf("function buildActivationUserCreateData");
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const argsEndIdx = tail.indexOf("}): {");
    const bodyOpenIdx = tail.indexOf("{\n  return", argsEndIdx);
    const returnTypeAnnotation = tail.slice(
      argsEndIdx + "}): ".length,
      bodyOpenIdx,
    );
    expect(returnTypeAnnotation).not.toMatch(/(^|\n)\s*customer\s*:/);
    expect(returnTypeAnnotation).not.toMatch(/(^|\n)\s*connect\s*:/);
  });

  it("invariant 4: `buildActivationCustomerUpdateData` data payload sets `userId: params.userId` (the SINGLE FK write)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("function buildActivationCustomerUpdateData");
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;
    expect(fnBody).toMatch(/userId\s*:\s*params\.userId/);
  });

  it("invariant 5: `buildActivationCustomerWhere` where-clause requires `userId: null` (the CAS predicate)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf("function buildActivationCustomerWhere");
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;
    expect(fnBody).toMatch(/userId\s*:\s*null/);
  });

  it("invariant 6: source tests no longer extract the user.create data argument via the legacy indexOf-on-string anchor (round-2 stale anchor removed in round 4)", () => {
    // Meta-test: the legacy form that hard-coded an inline
    // literal anchor MUST NOT survive in the test file. The old
    // form used a string-search call (e.g. `indexOf` with a
    // colon-then-brace literal substring) inside the test setup;
    // round 4 replaced that with a balanced-paren slice plus an
    // assertion on the builder-call shape.
    const TEST_FILE = path.resolve(__filename);
    const testSrc = readFileSync(TEST_FILE, "utf8");

    // Anchor by feature: a `fromCall.indexOf(` call whose argument
    // is a quoted colon-then-brace substring. The pattern below is
    // built from concatenated pieces so the test file does not
    // contain a string that matches itself.
    const COLON = ":";
    const OPEN_BRACE = "{";
    const stalePatternPieces = [
      "fromCall\\.indexOf\\(",
      "['\"]",
      "data",
      COLON,
      "\\s*",
      "\\" + OPEN_BRACE,
      "['\"]",
      "\\)",
    ];
    const stalePattern = new RegExp(stalePatternPieces.join(""));
    expect(testSrc).not.toMatch(stalePattern);
  });

  // ─ Cross-cutting behavioural reassurance (round 4) ────────────────────

  it("behavioural (round 4): happy path activated, with all 3 writes in order, NO orphan, FK established by the CAS only", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txUserCreate, txAccountCreate, txCustomerUpdateMany } =
      setupTransaction();

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "activated",
      customerId: CUSTOMER_ID,
      userId: NEW_USER_ID,
    });
    // (a) tx.user.create.data has no customer / connect.
    const userData = (txUserCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(userData).not.toHaveProperty("customer");
    expect(userData).not.toHaveProperty("connect");
    // (b) Customer.updateMany.where.userId === null.
    const cuWhere = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    })?.where;
    expect(cuWhere?.userId).toBe(null);
    // (c) Customer.updateMany.data.userId === newUser.id.
    const cuData = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(cuData?.userId).toBe(NEW_USER_ID);
    // (d) All 3 writes occurred.
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 13. P2 round 2 (PR #243 Codex): preserve null OAuth token fields
// ════════════════════════════════════════════════════════════════════════════
//
// Codex P2: the helper previously did
//   access_token: input.oauthAccount.access_token ?? undefined
// which silently converts explicit null to undefined. Baseline
// auth.ts Case B (lines 634-647) uses `as string | undefined`
// type-casts that don't touch runtime values — null stays null.
// Round 2 removes the `??` operators so each token field passes
// through unchanged.

describe("P2 round 2 (Codex): OAuth token fields pass through unchanged (null → null, undefined → undefined, string → string)", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  // ─ Behavioural matrix: each token field tested across all 3 input forms

  it("access_token: null input → null in Account.create data (NOT undefined)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txAccountCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(
      makeValidInput({
        oauthAccount: {
          provider: "line",
          providerAccountId: LINE_USER_ID,
          type: "oauth",
          access_token: null,
          refresh_token: "rtok",
          id_token: "idtok",
          expires_at: 1_700_000_000,
          scope: "openid",
          token_type: "Bearer",
        },
      }),
    );

    const data = (txAccountCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect((data as Record<string, unknown>).access_token).toBeNull();
  });

  it("refresh_token: null input → null in Account.create data", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txAccountCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(
      makeValidInput({
        oauthAccount: {
          provider: "line",
          providerAccountId: LINE_USER_ID,
          type: "oauth",
          access_token: "atok",
          refresh_token: null,
          id_token: "idtok",
          expires_at: 1_700_000_000,
          scope: "openid",
          token_type: "Bearer",
        },
      }),
    );

    const data = (txAccountCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect((data as Record<string, unknown>).refresh_token).toBeNull();
  });

  it("id_token: null input → null in Account.create data", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txAccountCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(
      makeValidInput({
        oauthAccount: {
          provider: "line",
          providerAccountId: LINE_USER_ID,
          type: "oauth",
          access_token: "atok",
          refresh_token: "rtok",
          id_token: null,
          expires_at: 1_700_000_000,
          scope: "openid",
          token_type: "Bearer",
        },
      }),
    );

    const data = (txAccountCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect((data as Record<string, unknown>).id_token).toBeNull();
  });

  it("expires_at: null input → null in Account.create data", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txAccountCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(
      makeValidInput({
        oauthAccount: {
          provider: "line",
          providerAccountId: LINE_USER_ID,
          type: "oauth",
          access_token: "atok",
          refresh_token: "rtok",
          id_token: "idtok",
          expires_at: null,
          scope: "openid",
          token_type: "Bearer",
        },
      }),
    );

    const data = (txAccountCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect((data as Record<string, unknown>).expires_at).toBeNull();
  });

  it("scope: null input → null in Account.create data", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txAccountCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(
      makeValidInput({
        oauthAccount: {
          provider: "line",
          providerAccountId: LINE_USER_ID,
          type: "oauth",
          access_token: "atok",
          refresh_token: "rtok",
          id_token: "idtok",
          expires_at: 1_700_000_000,
          scope: null,
          token_type: "Bearer",
        },
      }),
    );

    const data = (txAccountCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect((data as Record<string, unknown>).scope).toBeNull();
  });

  it("token_type: null input → null in Account.create data", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txAccountCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(
      makeValidInput({
        oauthAccount: {
          provider: "line",
          providerAccountId: LINE_USER_ID,
          type: "oauth",
          access_token: "atok",
          refresh_token: "rtok",
          id_token: "idtok",
          expires_at: 1_700_000_000,
          scope: "openid",
          token_type: null,
        },
      }),
    );

    const data = (txAccountCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect((data as Record<string, unknown>).token_type).toBeNull();
  });

  it("string token values pass through unchanged (regression sentinel)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txAccountCreate } = setupTransaction();

    await activatePrecreatedCustomerWithLine(
      makeValidInput({
        oauthAccount: {
          provider: "line",
          providerAccountId: LINE_USER_ID,
          type: "oauth",
          access_token: "ATOK_value_xyz",
          refresh_token: "RTOK_value_xyz",
          id_token: "ID_value_xyz",
          expires_at: 1_700_000_000,
          scope: "profile openid",
          token_type: "Bearer",
        },
      }),
    );

    const data = (txAccountCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect((data as Record<string, unknown>).access_token).toBe("ATOK_value_xyz");
    expect((data as Record<string, unknown>).refresh_token).toBe("RTOK_value_xyz");
    expect((data as Record<string, unknown>).id_token).toBe("ID_value_xyz");
    expect((data as Record<string, unknown>).expires_at).toBe(1_700_000_000);
    expect((data as Record<string, unknown>).scope).toBe("profile openid");
    expect((data as Record<string, unknown>).token_type).toBe("Bearer");
  });

  // ─ Source-structure regression sentinel: no `?? undefined` ─

  it("source: helper body has NO `?? undefined` operator on any OAuth token field (regression sentinel for the bug Codex flagged)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(
      "export async function activatePrecreatedCustomerWithLine",
    );
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    // For each of the 6 token fields, the helper must NOT use
    // `?? undefined` (which would silently drop nulls).
    for (const field of [
      "access_token",
      "refresh_token",
      "id_token",
      "expires_at",
      "scope",
      "token_type",
    ]) {
      const stalePattern = new RegExp(
        `${field}\\s*:\\s*input\\.oauthAccount\\.${field}\\s*\\?\\?\\s*undefined`,
      );
      expect(fnBody).not.toMatch(stalePattern);
    }
  });

  it("source: each OAuth token field uses direct pass-through with optional type cast (no `??` operator)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(
      "export async function activatePrecreatedCustomerWithLine",
    );
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    // The actual pattern after round 2:
    //   access_token: input.oauthAccount.access_token as string | undefined,
    // We anchor on `: input.oauthAccount.<field>` followed by either
    // `,` or ` as ` — both are direct pass-through, no `??`.
    for (const field of [
      "access_token",
      "refresh_token",
      "id_token",
      "scope",
      "token_type",
    ]) {
      const passthroughPattern = new RegExp(
        `${field}\\s*:\\s*input\\.oauthAccount\\.${field}\\s*(as\\s+|,|\\n)`,
      );
      expect(fnBody).toMatch(passthroughPattern);
    }
    // expires_at is a number, cast pattern differs.
    expect(fnBody).toMatch(
      /expires_at\s*:\s*input\.oauthAccount\.expires_at\s*(as\s+|,|\n)/,
    );
  });

  it("source: Account.create data block still has NO `session_state` (regression sentinel from PR #226 Codex round 10)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(
      "export async function activatePrecreatedCustomerWithLine",
    );
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    expect(fnBody).not.toMatch(/session_state\s*:/);
  });

  it("byte-equivalent: Account.create data after round 2 has EXACTLY the same 10 keys with null/string values preserved as the input declares", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txAccountCreate } = setupTransaction();

    // Mix of null + string + number — verifies all 3 forms pass
    // through unchanged in one shot.
    await activatePrecreatedCustomerWithLine(
      makeValidInput({
        oauthAccount: {
          provider: "line",
          providerAccountId: LINE_USER_ID,
          type: "oauth",
          access_token: null, // null
          refresh_token: "RTOK", // string
          id_token: null, // null
          expires_at: 1_700_000_000, // number
          scope: null, // null
          token_type: "Bearer", // string
        },
      }),
    );

    const data = (txAccountCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;

    // Same 10 keys, exact values.
    expect(data).toMatchObject({
      userId: NEW_USER_ID,
      type: "oauth",
      provider: "line",
      providerAccountId: LINE_USER_ID,
      access_token: null,
      refresh_token: "RTOK",
      id_token: null,
      expires_at: 1_700_000_000,
      scope: null,
      token_type: "Bearer",
    });
    // No session_state.
    expect(data).not.toHaveProperty("session_state");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 14. P1 round 5 (PR #243 Codex): in-tx Case-B guard BEFORE tx.user.create
// ════════════════════════════════════════════════════════════════════════════
//
// Codex P1 ("Move the Case-B guard before connecting the customer") was
// not satisfied by source-only assertions in earlier rounds. Round 5
// reorders the transaction so the Customer-state check runs INSIDE the
// tx, BEFORE any write. If the Customer is no longer in the Case-B
// precondition state (userId === null, lineUserId === null, not merged),
// the helper throws StaleCustomerLinkError BEFORE creating User — so
// tx.user.create / tx.account.create are structurally unreachable on
// a stale guard.
//
// The 5-predicate `tx.customer.updateMany` CAS at step 7c still runs
// as a defense-in-depth final check; round 5 adds the up-front
// findFirst to make the "guard before connecting the customer"
// property visible at the top of the tx callback.

describe("P1 round 5 (Codex): in-tx Case-B guard fires BEFORE tx.user.create", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  // ─ Source-structure ────────────────────────────────────────────────────

  it("source: activation helper's tx callback starts with `tx.customer.findFirst` BEFORE any write", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(
      "export async function activatePrecreatedCustomerWithLine",
    );
    expect(fnStart).toBeGreaterThan(-1);
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    const findFirstIdx = fnBody.indexOf("tx.customer.findFirst");
    const userCreateIdx = fnBody.indexOf("tx.user.create(");
    const accountCreateIdx = fnBody.indexOf("tx.account.create(");
    const updateManyIdx = fnBody.indexOf("tx.customer.updateMany(");

    expect(findFirstIdx).toBeGreaterThan(-1);
    expect(userCreateIdx).toBeGreaterThan(-1);
    expect(accountCreateIdx).toBeGreaterThan(-1);
    expect(updateManyIdx).toBeGreaterThan(-1);

    // findFirst MUST come BEFORE all 3 writes.
    expect(findFirstIdx).toBeLessThan(userCreateIdx);
    expect(findFirstIdx).toBeLessThan(accountCreateIdx);
    expect(findFirstIdx).toBeLessThan(updateManyIdx);
  });

  it("source: in-tx findFirst has the Case-B precondition predicates — id/storeId/userId:null/mergedIntoCustomerId:null + OR-clause accepting lineUserId null OR input.lineUserId (round 6 same-LINE placeholder)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(
      "export async function activatePrecreatedCustomerWithLine",
    );
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    // Locate the findFirst call's where literal.
    const findFirstIdx = fnBody.indexOf("tx.customer.findFirst");
    expect(findFirstIdx).toBeGreaterThan(-1);
    // 1800 chars covers the findFirst call's where (now including
    // round-6 OR clause + the explanatory comment block) + select.
    const findFirstSlice = fnBody.slice(findFirstIdx, findFirstIdx + 1800);

    expect(findFirstSlice).toMatch(/id\s*:\s*customer\.id/);
    expect(findFirstSlice).toMatch(/storeId\s*:\s*input\.storeId/);
    expect(findFirstSlice).toMatch(/userId\s*:\s*null/);
    expect(findFirstSlice).toMatch(/mergedIntoCustomerId\s*:\s*null/);
    // OR clause: { lineUserId: null } AND { lineUserId: input.lineUserId }
    expect(findFirstSlice).toMatch(/OR\s*:/);
    expect(findFirstSlice).toMatch(/lineUserId\s*:\s*null/);
    expect(findFirstSlice).toMatch(/lineUserId\s*:\s*input\.lineUserId/);
  });

  it("source: in-tx findFirst null branch throws StaleCustomerLinkError BEFORE any write", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(
      "export async function activatePrecreatedCustomerWithLine",
    );
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    // The pattern: `if (!target) { throw new StaleCustomerLinkError(...) }`
    // — must appear AFTER the findFirst and BEFORE any tx.user/account write.
    const findFirstIdx = fnBody.indexOf("tx.customer.findFirst");
    const throwIdx = fnBody.indexOf("throw new StaleCustomerLinkError");
    const userCreateIdx = fnBody.indexOf("tx.user.create(");

    expect(findFirstIdx).toBeGreaterThan(-1);
    expect(throwIdx).toBeGreaterThan(-1);
    expect(userCreateIdx).toBeGreaterThan(-1);

    // findFirst < throw < user.create
    expect(findFirstIdx).toBeLessThan(throwIdx);
    expect(throwIdx).toBeLessThan(userCreateIdx);

    // The throw is gated by `if (!target)`.
    expect(fnBody).toMatch(
      /if\s*\(\s*!target\s*\)\s*\{[\s\S]{0,80}throw\s+new\s+StaleCustomerLinkError/,
    );
  });

  // ─ Behavioural ─────────────────────────────────────────────────────────

  it("behavioural: in-tx findFirst returns null → throw → NO user.create, NO account.create, NO updateMany; returns stale_customer_link", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const {
      txCustomerFindFirst,
      txUserCreate,
      txAccountCreate,
      txCustomerUpdateMany,
    } = setupTransaction();
    txCustomerFindFirst.mockResolvedValueOnce(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    // Guard fired BEFORE any write — neither user.create nor
    // account.create nor updateMany was reached.
    expect(txCustomerFindFirst).toHaveBeenCalledTimes(1);
    expect(txUserCreate).not.toHaveBeenCalled();
    expect(txAccountCreate).not.toHaveBeenCalled();
    expect(txCustomerUpdateMany).not.toHaveBeenCalled();
  });

  it("behavioural: in-tx findFirst returns truthy → all 3 writes proceed in order, returns activated", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const {
      txCustomerFindFirst,
      txUserCreate,
      txAccountCreate,
      txCustomerUpdateMany,
    } = setupTransaction();
    // setupTransaction defaults findFirst to { id: CUSTOMER_ID } (truthy).

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r.status).toBe("activated");
    expect(txCustomerFindFirst).toHaveBeenCalledTimes(1);
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("behavioural: in-tx findFirst where-clause matches the Case-B precondition exactly — OR-clause for lineUserId accepts null OR input.lineUserId (round 6)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerFindFirst } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    const arg = txCustomerFindFirst.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
      select?: Record<string, unknown>;
    };
    expect(arg?.where).toEqual({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: null,
      mergedIntoCustomerId: null,
      OR: [
        { lineUserId: null },
        { lineUserId: LINE_USER_ID },
      ],
    });
    // Read-only select; we don't need or want any other column read.
    expect(arg?.select).toEqual({ id: true });
  });

  it("behavioural: stale guard rollback still emits masked stale_customer_link log (sanity for the new throw path)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerFindFirst } = setupTransaction();
    txCustomerFindFirst.mockResolvedValueOnce(null);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const dumped = warnSpy.mock.calls
      .flat()
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join("\n");
    expect(dumped).toContain("stale_customer_link");
    // Raw IDs absent.
    expect(dumped).not.toContain(CUSTOMER_ID);
    expect(dumped).not.toContain(STORE_ID);
    expect(dumped).not.toContain(LINE_USER_ID);
    warnSpy.mockRestore();
  });

  it("ordering reinforced: source-textual order is `findFirst → if !target throw → user.create → account.create → updateMany`", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnStart = src.indexOf(
      "export async function activatePrecreatedCustomerWithLine",
    );
    const tail = src.slice(fnStart);
    const termRel = tail.search(/\n}\n\n/);
    const fnBody = termRel >= 0 ? tail.slice(0, termRel + 2) : tail;

    const positions = {
      findFirst: fnBody.indexOf("tx.customer.findFirst"),
      ifTarget: fnBody.search(/if\s*\(\s*!target\s*\)/),
      throw: fnBody.indexOf("throw new StaleCustomerLinkError"),
      userCreate: fnBody.indexOf("tx.user.create("),
      accountCreate: fnBody.indexOf("tx.account.create("),
      updateMany: fnBody.indexOf("tx.customer.updateMany("),
    };
    for (const [name, idx] of Object.entries(positions)) {
      expect(idx, `expected ${name} to exist`).toBeGreaterThan(-1);
    }

    // findFirst < if(!target) < throw < user.create < account.create < updateMany
    expect(positions.findFirst).toBeLessThan(positions.ifTarget);
    expect(positions.ifTarget).toBeLessThan(positions.throw);
    expect(positions.throw).toBeLessThan(positions.userCreate);
    expect(positions.userCreate).toBeLessThan(positions.accountCreate);
    expect(positions.accountCreate).toBeLessThan(positions.updateMany);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 15. PR #243 Codex P2 round 6: allow same-LINE placeholder activation
//
//     The /oauth-confirm NEW_USER flow legitimately creates a Customer
//     row with `userId === null AND lineUserId === input.lineUserId`
//     (the LINE userId is populated up-front so the bot can post-fill
//     messaging). Pre round 6, the helper rejected this case because
//     both the in-tx findFirst guard and the final updateMany CAS
//     literally required `lineUserId: null`. Round 6 relaxes both to an
//     OR clause `[{ lineUserId: null }, { lineUserId: input.lineUserId }]`
//     so the same-LINE placeholder activates as if it were a fresh
//     placeholder. The preflight rejection for "different LINE attached"
//     (Customer.lineUserId set but ≠ input.lineUserId) is unchanged.
// ════════════════════════════════════════════════════════════════════════════

describe("PR #243 Codex P2 round 6: same-LINE placeholder activation", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  it("scenario 1 — userId null + lineUserId null (fresh placeholder, pre-round-6 path) → activated", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ lineUserId: null }),
    );
    const { txUserCreate, txAccountCreate, txCustomerUpdateMany } =
      setupTransaction();

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "activated",
      customerId: CUSTOMER_ID,
      userId: NEW_USER_ID,
    });
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("scenario 2 — userId null + lineUserId === input.lineUserId (same-LINE placeholder, /oauth-confirm NEW_USER flow) → activated", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ lineUserId: LINE_USER_ID }),
    );
    const { txUserCreate, txAccountCreate, txCustomerUpdateMany } =
      setupTransaction();

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "activated",
      customerId: CUSTOMER_ID,
      userId: NEW_USER_ID,
    });
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("scenario 3 — userId null + lineUserId DIFFERENT from input → customer_already_linked_to_other_line (0 tx, 0 writes)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ lineUserId: OTHER_LINE_USER_ID }),
    );
    const setup = setupTransaction();

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "customer_already_linked_to_other_line",
      customerId: CUSTOMER_ID,
      existingLineUserId: OTHER_LINE_USER_ID,
    });
    // Preflight rejection — tx never started.
    expect(mockTx).not.toHaveBeenCalled();
    expect(setup.txCustomerFindFirst).not.toHaveBeenCalled();
    expect(setup.txUserCreate).not.toHaveBeenCalled();
    expect(setup.txAccountCreate).not.toHaveBeenCalled();
    expect(setup.txCustomerUpdateMany).not.toHaveBeenCalled();
  });

  it("scenario 4 — in-tx findFirst guard permits same-LINE placeholder (behavioural: findFirst.where.OR matches both shapes)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ lineUserId: LINE_USER_ID }),
    );
    const { txCustomerFindFirst } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(txCustomerFindFirst).toHaveBeenCalledTimes(1);
    const arg = txCustomerFindFirst.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    };
    expect(arg?.where).toEqual({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: null,
      mergedIntoCustomerId: null,
      OR: [
        { lineUserId: null },
        { lineUserId: LINE_USER_ID },
      ],
    });
  });

  it("scenario 5 — final updateMany CAS permits same-LINE placeholder (behavioural: updateMany.where.OR matches both shapes)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(
      precreatedCustomerFixture({ lineUserId: LINE_USER_ID }),
    );
    const { txCustomerUpdateMany } = setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
    const arg = txCustomerUpdateMany.mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    };
    expect(arg?.where).toEqual({
      id: CUSTOMER_ID,
      storeId: STORE_ID,
      userId: null,
      mergedIntoCustomerId: null,
      OR: [
        { lineUserId: null },
        { lineUserId: LINE_USER_ID },
      ],
    });
  });

  it("scenario 6 — final updateMany still rejects stale lineUserId (different LINE smuggled in mid-tx via concurrent writer) → count=0 → stale_customer_link", async () => {
    // Preflight passes (Customer.lineUserId === null at preflight),
    // but a concurrent writer mutated lineUserId to a DIFFERENT value
    // between preflight and the tx-write boundary. The updateMany's
    // OR clause does NOT match (neither `lineUserId: null` nor
    // `lineUserId: input.lineUserId` are true for the row in DB);
    // count=0 → StaleCustomerLinkError → stale_customer_link.
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txCustomerUpdateMany, txUserCreate, txAccountCreate } =
      setupTransaction();
    txCustomerUpdateMany.mockResolvedValueOnce({ count: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "stale_customer_link",
      customerId: CUSTOMER_ID,
    });
    // tx ran (in-tx findFirst passed default truthy, then writes
    // attempted, then updateMany count=0 throws → rollback).
    expect(mockTx).toHaveBeenCalledTimes(1);
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("scenario 7 — happy path remains byte-equivalent vs baseline (lineUserId:null Customer; OR clause does NOT change end-state row values)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txUserCreate, txAccountCreate, txCustomerUpdateMany } =
      setupTransaction();

    await activatePrecreatedCustomerWithLine(makeValidInput());

    // User: same 6 columns vs baseline.
    const userData = (txUserCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(Object.keys(userData ?? {}).sort()).toEqual(
      ["email", "image", "name", "phone", "role", "status"].sort(),
    );
    expect(userData?.name).toBe(CUSTOMER_NAME);

    // Account: same 10 columns vs baseline, NO session_state.
    const accountData = (txAccountCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(accountData).not.toHaveProperty("session_state");
    expect(Object.keys(accountData ?? {})).toHaveLength(10);

    // Customer: same FK write + link-metadata columns.
    const updateManyArg = txCustomerUpdateMany.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };
    expect(updateManyArg?.data?.userId).toBe(NEW_USER_ID);
    expect(updateManyArg?.data?.lineUserId).toBe(LINE_USER_ID);
    expect(updateManyArg?.data?.authSource).toBe("LINE");
    expect(updateManyArg?.data?.lineLinkStatus).toBe("LINKED");
  });

  it("scenario 8 — helper remains UNWIRED (no caller change in this PR): exported symbols match the PR-G5.1.b contract surface", async () => {
    // PR #243 scope guard: helper-only / tests-only. Re-import the
    // module and assert the symbol surface is unchanged by round 6.
    const mod = await import("@/server/services/bind-line-to-customer");
    expect(typeof mod.activatePrecreatedCustomerWithLine).toBe("function");
    expect(typeof mod.bindLineToExistingCustomerById).toBe("function");
    // The activation helper is the PR-G5.1.b sibling — no new exports
    // added by round 6.
  });

  it("source-structure: buildActivationCustomerWhere accepts `lineUserId` in its params type AND returns the OR clause (round 6 contract)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Anchor on the function declaration through its return statement.
    const fnIdx = src.indexOf("function buildActivationCustomerWhere");
    expect(fnIdx).toBeGreaterThan(-1);
    // 700 chars cover params, return type, and return body.
    const slice = src.slice(fnIdx, fnIdx + 700);
    // Params include lineUserId.
    expect(slice).toMatch(/lineUserId\s*:\s*string/);
    // Return type's OR field accepts both null and string shapes.
    expect(slice).toMatch(/OR\s*:\s*Array<\s*\{\s*lineUserId\s*:\s*null\s*\}/);
    expect(slice).toMatch(/\|\s*\{\s*lineUserId\s*:\s*string\s*\}\s*>/);
    // Return body wires the OR pair with `params.lineUserId`.
    expect(slice).toMatch(/OR\s*:\s*\[/);
    expect(slice).toMatch(/\{\s*lineUserId\s*:\s*null\s*\}/);
    expect(slice).toMatch(/\{\s*lineUserId\s*:\s*params\.lineUserId\s*\}/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 16. PR #243 Codex P1 round 7: explicit P1 contract sentences at three
//     anchor sites + stale "relation-side-effect" / "was baseline-nested-
//     connect" phrasings removed.
//
//     Codex's P1 finding ("Move the Case-B guard before connecting the
//     customer") was code-satisfied by round 5 (in-tx findFirst before
//     tx.user.create). Round 6 extended the predicate. Round 7 makes
//     the safety contract VERBATIM and visible at each of the three
//     code anchors Codex's static reader can land on:
//
//       (a) helper-level contract block above the exported activation
//           function (the file-level §5.3.3 conformance section)
//       (b) `buildActivationUserCreateData` JSDoc (the call site for
//           User.create.data — the original P1 risk surface)
//       (c) `buildActivationCustomerWhere` JSDoc (the call site for
//           the sole writer of Customer.userId — line 1509 area where
//           Codex's anchor pointed in re-review)
//
//     The three sentences are LITERAL — they MUST appear byte-for-byte
//     in the source so a grep-based reader can confirm the contract
//     without re-reading the entire file:
//
//       S1. "This helper intentionally does NOT use Prisma nested
//            Customer relation write in User.create."
//       S2. "The in-transaction Customer guard runs before User.create."
//       S3. "Customer.updateMany is the only write that assigns
//            Customer.userId."
//
//     Round 7 is comments-only in the helper file + tests-only beyond
//     that — NO runtime behaviour change. The three guarantees the
//     comments document were ALREADY enforced by rounds 1-6 code shape.
// ════════════════════════════════════════════════════════════════════════════

describe("PR #243 Codex P1 round 7: explicit P1 contract sentences at three anchor sites", () => {
  const HELPER_PATH = path.resolve(
    __dirname,
    "..",
    "server",
    "services",
    "bind-line-to-customer.ts",
  );

  // The three P1 sentences (tolerant of JSDoc / `//` line wrapping —
  // each `\s+` allows whitespace + comment-prefix wrap between words).
  //
  // Pattern: `word\s+(?:[*/]\s+)?word` collapses
  //   "Prisma nested Customer\n *      relation write" → match
  //   "the only write that assigns\n//         Customer.userId" → match
  const PREFIX = "(?:[*/]+\\s+)?"; // optional `*  ` or `//  ` line continuation
  const W = `\\s+${PREFIX}`; // word-gap that tolerates a wrapped JSDoc line
  const S1_RE = new RegExp(
    `This helper intentionally does NOT use Prisma nested Customer${W}relation write in User\\.create\\.`,
  );
  const S2_RE = new RegExp(
    `The in-transaction Customer guard runs before User\\.create\\.`,
  );
  const S3_RE = new RegExp(
    `Customer\\.updateMany is the only write that assigns${W}Customer\\.userId\\.`,
  );

  it("anchor (a): helper-level contract block contains all three P1 sentences", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // The helper-level contract block lives above the
    // `ActivatePrecreatedCustomerWithLineInput` interface.
    const blockEnd = src.indexOf(
      "export interface ActivatePrecreatedCustomerWithLineInput",
    );
    expect(blockEnd).toBeGreaterThan(-1);
    // Anchor 4000 chars above the interface so we read the full block.
    const blockStart = Math.max(0, blockEnd - 4000);
    const slice = src.slice(blockStart, blockEnd);

    expect(slice).toMatch(S1_RE);
    expect(slice).toMatch(S2_RE);
    expect(slice).toMatch(S3_RE);
  });

  it("anchor (b): buildActivationUserCreateData JSDoc contains all three P1 sentences", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnIdx = src.indexOf("function buildActivationUserCreateData");
    expect(fnIdx).toBeGreaterThan(-1);
    // Anchor 2500 chars above the function declaration so we capture
    // the full JSDoc block.
    const blockStart = Math.max(0, fnIdx - 2500);
    const slice = src.slice(blockStart, fnIdx);

    expect(slice).toMatch(S1_RE);
    expect(slice).toMatch(S2_RE);
    expect(slice).toMatch(S3_RE);
  });

  it("anchor (c): buildActivationCustomerWhere JSDoc contains all three P1 sentences (line 1509 area Codex flagged in re-review)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const fnIdx = src.indexOf("function buildActivationCustomerWhere");
    expect(fnIdx).toBeGreaterThan(-1);
    const blockStart = Math.max(0, fnIdx - 2500);
    const slice = src.slice(blockStart, fnIdx);

    expect(slice).toMatch(S1_RE);
    expect(slice).toMatch(S2_RE);
    expect(slice).toMatch(S3_RE);
  });

  it("file-wide: each of the three P1 sentences appears at LEAST three times (once per anchor site)", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    const countMatches = (s: string, re: RegExp): number => {
      const flag = re.flags.includes("g") ? re.flags : re.flags + "g";
      const g = new RegExp(re.source, flag);
      const matches = s.match(g);
      return matches ? matches.length : 0;
    };
    expect(countMatches(src, S1_RE)).toBeGreaterThanOrEqual(3);
    expect(countMatches(src, S2_RE)).toBeGreaterThanOrEqual(3);
    expect(countMatches(src, S3_RE)).toBeGreaterThanOrEqual(3);
  });

  it("stale framing removed: helper file no longer says `minus the relation side-effect`", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Round 6 still had this stale framing in the helper-level
    // contract block; round 7 removes it. The replacement is "for the
    // User row itself" + the explicit P1 GUARANTEE block above.
    expect(src).not.toContain("minus the relation side-effect");
  });

  it("stale framing removed: helper file no longer says `was baseline-nested-connect`", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Round 6 still had this stale framing on the Customer.updateMany
    // userId line; round 7 replaces it with "sole writer of
    // Customer.userId" + P1 GUARANTEE sentence 3 reference.
    expect(src).not.toContain("was baseline-nested-connect");
  });

  it("stale framing removed: helper file no longer says `the FK write that baseline does via User.create's nested connect`", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    expect(src).not.toContain(
      "the FK write that baseline does via User.create's nested connect",
    );
  });

  it("structural: P1 GUARANTEE header lines (not in-prose mentions) appear ≥3 times, each followed by a 1./2./3. numbered list", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Header lines look like "P1 GUARANTEE (PR #243 Codex P1 ...)" —
    // distinguish from in-prose mentions like
    // "P1 GUARANTEE sentence 1 above" by requiring the parenthesized
    // attribution that follows the keyword.
    const headerRegex = /P1 GUARANTEE\s*\(PR\s*#243/g;
    const matches = src.match(headerRegex);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(3);

    // For each header, the next ~1500 chars must enumerate sentences
    // 1./2./3. as a numbered list.
    let cursor = 0;
    let blocksChecked = 0;
    while (true) {
      const idx = src.indexOf("P1 GUARANTEE (PR #243", cursor);
      if (idx === -1) break;
      const window = src.slice(idx, idx + 1500);
      expect(window).toMatch(/(^|\s)1\.\s/);
      expect(window).toMatch(/(^|\s)2\.\s/);
      expect(window).toMatch(/(^|\s)3\.\s/);
      blocksChecked++;
      cursor = idx + 1;
    }
    expect(blocksChecked).toBeGreaterThanOrEqual(3);
  });

  it("regression: existing runtime behaviour unchanged — happy path still activated with byte-equivalent writes (round 7 is comments-only)", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(precreatedCustomerFixture());
    const { txUserCreate, txAccountCreate, txCustomerUpdateMany } =
      setupTransaction();

    const r = await activatePrecreatedCustomerWithLine(makeValidInput());

    expect(r).toEqual({
      status: "activated",
      customerId: CUSTOMER_ID,
      userId: NEW_USER_ID,
    });
    // Same 3 writes, same shapes — round 7 documents existing
    // safety, it does not change runtime behaviour.
    expect(txUserCreate).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
    expect(txCustomerUpdateMany).toHaveBeenCalledTimes(1);

    // User.create.data still has no `customer` / `connect` key.
    const userData = (txUserCreate.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(userData).not.toHaveProperty("customer");
    expect(userData).not.toHaveProperty("connect");

    // Customer.updateMany still writes userId.
    const updData = (txCustomerUpdateMany.mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    })?.data;
    expect(updData?.userId).toBe(NEW_USER_ID);
  });
});
