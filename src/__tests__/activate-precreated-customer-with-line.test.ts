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

  it("happy path: Customer.updateMany.where has `userId: null` AND `mergedIntoCustomerId: null` (CAS predicate)", async () => {
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
      lineUserId: null,
      mergedIntoCustomerId: null,
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

  it("source: `tx.user.create` data literal does NOT contain a `customer` field-KEY (extracts the data block and asserts no relation-side-effect write)", () => {
    const fnBody = readActivationFnBody();
    // Locate the `tx.user.create(` call and extract its `data: {...}`.
    const userCreateIdx = fnBody.indexOf("tx.user.create(");
    expect(userCreateIdx).toBeGreaterThan(-1);

    const fromCall = fnBody.slice(userCreateIdx);
    // Find `data: {` inside the call's options literal.
    const dataOpenIdx = fromCall.indexOf("data: {");
    expect(dataOpenIdx).toBeGreaterThan(-1);
    const fromDataOpen = fromCall.slice(dataOpenIdx + "data: {".length);
    // Match the first balanced `}` — the User.create.data has no
    // nested object literals (round 1 removed the relation literal),
    // so the first `}` is the correct close.
    const closeIdx = fromDataOpen.indexOf("}");
    expect(closeIdx).toBeGreaterThan(-1);
    const dataBody = fromDataOpen.slice(0, closeIdx);

    // Anchor on the FIELD-KEY pattern `customer:` / `connect:` —
    // value references like `customer.name` (the local variable
    // dereference) are intentionally allowed. Field keys appear at
    // line-start (after `{` or `,` + whitespace), followed by `:`.
    expect(dataBody).not.toMatch(/(^|\n)\s*customer\s*:/);
    expect(dataBody).not.toMatch(/(^|\n)\s*connect\s*:/);
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
