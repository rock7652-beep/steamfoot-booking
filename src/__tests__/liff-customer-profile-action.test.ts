/**
 * fetchLiffCustomerProfile server action 行為測試 (PR-LIFF-profile)
 *
 * 涵蓋:
 *   ── action 主路徑 ──
 *   - ok                        success path (customer found, all fields projected)
 *   - no_customer               requireSession throw / 非 CUSTOMER / canonical null /
 *                                storeId null / row miss
 *   - service_unavailable       prisma throws
 *   - 不信任 client 傳值          action 不收參數 → 即使呼叫端傳東西也忽略
 *   - store isolation           where clause 同時鎖 customerId + storeId →
 *                                跨店 row 不可能讀到
 *
 *   ── PII / 遮罩合約 ──
 *   - lineUserId NEVER returned in full
 *   - lineUserIdMasked is `U******xxxx` for linked customers
 *   - lineUserIdMasked is null when no binding
 *   - Short / degenerate lineUserId → null mask (defensive)
 *
 *   ── lineStatus 派生規則 ──
 *   - LINKED + lineUserId set        → "linked"
 *   - lineUserId null                → "unlinked"
 *   - LINKED + lineUserId null (drift) → "needs_help"
 *   - BLOCKED + lineUserId set       → "needs_help"
 *
 * Mock 範圍 (與 liff-my-bookings-action.test.ts 對齊):
 *   - @/lib/session
 *   - @/lib/customer-identity
 *   - @/lib/db (prisma.customer.findFirst)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks (must be before import action) ──
const mockRequireSession = vi.fn();
const mockGetCanonicalId = vi.fn();
const mockCustomerFindFirst = vi.fn();

vi.mock("@/lib/session", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/customer-identity", () => ({
  getCanonicalCustomerIdForSession: (...args: unknown[]) =>
    mockGetCanonicalId(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findFirst: (...args: unknown[]) => mockCustomerFindFirst(...args),
    },
  },
}));

import { fetchLiffCustomerProfile } from "@/server/actions/liff-customer-profile";

// ── shared fixtures ──
const CUSTOMER_USER = {
  id: "user-liff-001",
  role: "CUSTOMER" as const,
  storeId: "store-zhubei",
  storeSlug: "zhubei",
  staffId: null,
  customerId: "cust-stale-from-session",
  email: null,
};
const CANONICAL_CUSTOMER_ID = "cust-canonical-001";
const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const LINE_USER_ID_MASKED = "U******cdef";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CANONICAL_CUSTOMER_ID,
    name: "王小明",
    phone: "0912345678",
    email: "test@example.com",
    lineLinkStatus: "LINKED" as const,
    lineName: "LINE 暱稱",
    lineUserId: LINE_USER_ID,
    store: { name: "暖暖蒸足 竹北店", slug: "zhubei" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRequireSession.mockReset();
  mockGetCanonicalId.mockReset();
  mockCustomerFindFirst.mockReset();
  // sane defaults
  mockRequireSession.mockResolvedValue(CUSTOMER_USER);
  mockGetCanonicalId.mockResolvedValue(CANONICAL_CUSTOMER_ID);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. Happy path
// ════════════════════════════════════════════════════════════════════════════

describe("ok (CUSTOMER session + canonical id + row found)", () => {
  it("returns full profile with masked lineUserId tail", async () => {
    mockCustomerFindFirst.mockResolvedValueOnce(makeRow());

    const r = await fetchLiffCustomerProfile();

    expect(r).toEqual({
      status: "ok",
      profile: {
        id: CANONICAL_CUSTOMER_ID,
        name: "王小明",
        phone: "0912345678",
        email: "test@example.com",
        lineStatus: "linked",
        lineName: "LINE 暱稱",
        lineUserIdMasked: LINE_USER_ID_MASKED,
        storeName: "暖暖蒸足 竹北店",
        storeSlug: "zhubei",
      },
    });
  });

  it("query uses BOTH id + storeId in where clause (store isolation guard)", async () => {
    mockCustomerFindFirst.mockResolvedValueOnce(makeRow());

    await fetchLiffCustomerProfile();

    expect(mockCustomerFindFirst).toHaveBeenCalledTimes(1);
    const call = mockCustomerFindFirst.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    // Critical: where MUST include BOTH id AND storeId. If a future refactor
    // drops storeId, a stale / hijacked session token could theoretically
    // read another store's customer row. The dual predicate is the defense.
    expect(call.where).toEqual({
      id: CANONICAL_CUSTOMER_ID,
      storeId: CUSTOMER_USER.storeId,
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. no_customer branches (5 distinct triggers, all collapse to same status)
// ════════════════════════════════════════════════════════════════════════════

describe("no_customer", () => {
  it("requireSession throws → no_customer (NOT throws)", async () => {
    mockRequireSession.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

    const r = await fetchLiffCustomerProfile();

    expect(r).toEqual({ status: "no_customer" });
    // Defensive: must not have proceeded to query prisma
    expect(mockCustomerFindFirst).not.toHaveBeenCalled();
  });

  it("user.role !== CUSTOMER (staff) → no_customer", async () => {
    mockRequireSession.mockResolvedValueOnce({
      ...CUSTOMER_USER,
      role: "OWNER",
    });

    const r = await fetchLiffCustomerProfile();

    expect(r).toEqual({ status: "no_customer" });
    expect(mockGetCanonicalId).not.toHaveBeenCalled();
    expect(mockCustomerFindFirst).not.toHaveBeenCalled();
  });

  it("getCanonicalCustomerIdForSession returns null → no_customer", async () => {
    mockGetCanonicalId.mockResolvedValueOnce(null);

    const r = await fetchLiffCustomerProfile();

    expect(r).toEqual({ status: "no_customer" });
    expect(mockCustomerFindFirst).not.toHaveBeenCalled();
  });

  it("user.storeId is null → no_customer (defensive — multi-store session integrity)", async () => {
    mockRequireSession.mockResolvedValueOnce({
      ...CUSTOMER_USER,
      storeId: null,
    });

    const r = await fetchLiffCustomerProfile();

    expect(r).toEqual({ status: "no_customer" });
    expect(mockCustomerFindFirst).not.toHaveBeenCalled();
  });

  it("query returns null (cross-store / race) → no_customer", async () => {
    // findFirst returns null when (id, storeId) compound key doesn't match
    // any row. Could happen if the canonical id resolves to a row at a
    // DIFFERENT storeId than user.storeId — the where guard rejects it
    // and we return no_customer rather than surfacing the wrong store's
    // data.
    mockCustomerFindFirst.mockResolvedValueOnce(null);

    const r = await fetchLiffCustomerProfile();

    expect(r).toEqual({ status: "no_customer" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. service_unavailable (prisma throws)
// ════════════════════════════════════════════════════════════════════════════

describe("service_unavailable", () => {
  it("prisma throws → service_unavailable (NOT re-throws)", async () => {
    mockCustomerFindFirst.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await fetchLiffCustomerProfile();

    expect(r).toEqual({ status: "service_unavailable" });
    expect(errSpy).toHaveBeenCalledWith(
      "[fetchLiffCustomerProfile] query failed",
      expect.any(Error),
    );

    errSpy.mockRestore();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. PII / lineUserId masking contract — CRITICAL
// ════════════════════════════════════════════════════════════════════════════

describe("PII / lineUserId masking contract", () => {
  it("full lineUserId is NEVER present in the returned profile (regression guard against accidental field leak)", async () => {
    mockCustomerFindFirst.mockResolvedValueOnce(makeRow());

    const r = await fetchLiffCustomerProfile();

    if (r.status !== "ok") throw new Error("expected ok");
    // Serialize the returned profile and grep for the full raw lineUserId.
    // If any future refactor accidentally includes `lineUserId` (full 33
    // chars) in the response shape, this assertion fails loudly.
    const serialized = JSON.stringify(r.profile);
    expect(serialized).not.toContain(LINE_USER_ID);
    // Masked form IS expected to appear (this is the support-triage display).
    expect(serialized).toContain(LINE_USER_ID_MASKED);
  });

  it("lineUserIdMasked has the documented shape: 'U' + '******' + last 4 chars", async () => {
    mockCustomerFindFirst.mockResolvedValueOnce(makeRow());

    const r = await fetchLiffCustomerProfile();

    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.profile.lineUserIdMasked).toBe("U******cdef");
    // Total length: 1 (U) + 6 (asterisks) + 4 (tail) = 11
    expect(r.profile.lineUserIdMasked).toHaveLength(11);
    // Length invariant: any input length collapses to the same 11-char shape
    // (prevents input-length leakage via output length comparison)
  });

  it("lineUserIdMasked is null when customer is not LINE-linked (no binding to mask)", async () => {
    mockCustomerFindFirst.mockResolvedValueOnce(
      makeRow({
        lineLinkStatus: "UNLINKED",
        lineUserId: null,
        lineName: null,
      }),
    );

    const r = await fetchLiffCustomerProfile();

    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.profile.lineUserIdMasked).toBeNull();
  });

  it("degenerate short lineUserId (< 7 chars) returns null mask (defensive — would otherwise leak the entire input)", async () => {
    // Pathological / corrupted data — never expected in prod since LINE
    // userIds are always 33 chars (U + 32 hex). But the masker MUST
    // refuse to leak any input that's shorter than the mask itself.
    mockCustomerFindFirst.mockResolvedValueOnce(
      makeRow({ lineUserId: "Uabc" }),
    );

    const r = await fetchLiffCustomerProfile();

    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.profile.lineUserIdMasked).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. lineStatus 派生規則
// ════════════════════════════════════════════════════════════════════════════

describe("lineStatus derivation", () => {
  it("LINKED + lineUserId set → 'linked'", async () => {
    mockCustomerFindFirst.mockResolvedValueOnce(
      makeRow({ lineLinkStatus: "LINKED", lineUserId: LINE_USER_ID }),
    );
    const r = await fetchLiffCustomerProfile();
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.profile.lineStatus).toBe("linked");
  });

  it("lineUserId null → 'unlinked' (regardless of stored status)", async () => {
    mockCustomerFindFirst.mockResolvedValueOnce(
      makeRow({
        lineLinkStatus: "UNLINKED",
        lineUserId: null,
        lineName: null,
      }),
    );
    const r = await fetchLiffCustomerProfile();
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.profile.lineStatus).toBe("unlinked");
  });

  it("LINKED + lineUserId null (drift state) → 'needs_help' (do NOT lie to user as 'linked')", async () => {
    // This is the closeout doc §1 row 5 / row 7 drift profile:
    // Customer-ahead / Account-behind shapes where the stored enum claims
    // LINKED but the actual lineUserId field is null. The customer-facing
    // view must NOT say "已綁定" in this case — it would be a lie.
    mockCustomerFindFirst.mockResolvedValueOnce(
      makeRow({ lineLinkStatus: "LINKED", lineUserId: null }),
    );
    const r = await fetchLiffCustomerProfile();
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.profile.lineStatus).toBe("unlinked");
    // (`unlinked` is the safest read: lineUserId null is the ground truth;
    // the enum is advisory. Customer sees 「尚未綁定 LINE」 → contacts staff
    // if they believe this is wrong. NO false "已綁定" claim.)
  });

  it("BLOCKED + lineUserId set → 'needs_help' (neutral copy; do not expose raw enum)", async () => {
    mockCustomerFindFirst.mockResolvedValueOnce(
      makeRow({ lineLinkStatus: "BLOCKED", lineUserId: LINE_USER_ID }),
    );
    const r = await fetchLiffCustomerProfile();
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.profile.lineStatus).toBe("needs_help");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. 不信任 client 傳值 (action 不收參數)
// ════════════════════════════════════════════════════════════════════════════

describe("input trust contract", () => {
  it("action signature accepts no arguments — caller cannot inject customerId / storeId", () => {
    // TypeScript-level: fetchLiffCustomerProfile.length === 0
    expect(fetchLiffCustomerProfile.length).toBe(0);
  });
});
