/**
 * bindLineToCustomerInStore — 將 LINE 身份綁到同店 Customer 的 canonical helper（PR-C1）
 *
 * ── 設計目標 ──────────────────────────────────────────
 * 統一 4 個既有 / 即將到來的「綁 LINE → Customer」入口的邏輯：
 *   1. LIFF onboarding 補手機 → 綁同店 Customer  (PR-C2 wires)
 *   2. LINE webhook 「綁定碼」flow                (PR-C3 wires)
 *   3. LINE OAuth signIn callback Case 3         (PR-C3 wires)
 *   4. LINE OAuth signIn callback Case 1/2       (PR-C3 wires)
 *
 * **本 PR-C1 不 wire 任何 caller**。dead code 上 prod，純為了在 prod-like 環境
 * 跑過 build / typecheck，並讓後續 PR 直接呼叫已驗證的 helper。
 *
 * ── 商業規則（plan §7.1 已定案）──────────────────────
 *   - 同手機跨店各自建 Customer，不跨店搬資料
 *   - 同店 (phone) unique；同店 (lineUserId) unique
 *   - 一個手機已綁定登入帳號（Customer.userId 已存在）的 Customer，不可被
 *     LIFF onboarding 自動劫持綁 LINE；改走 webhook「綁定碼」(staff 驗證身份)
 *
 * ── 安全模型 ────────────────────────────────────────
 *   - 所有寫入動作 in prisma.$transaction (helper 自己負責 tx 邊界)
 *   - Account[provider=line] 必須 in 同 tx 同步（per project-line-account-sync-rule memory）
 *   - identity-repair + referral-points 是 post-tx best-effort，失敗不影響主流程
 *
 * ── Not in PR-C1 scope ──────────────────────────────
 *   - 不接 referral / bindReferralToCustomer（per §11.3 決策）
 *   - 不寫密碼（per §11.5 決策）
 *   - 不動 callable signIn / NextAuth；JWT 更新由 caller 處理（per §11.4 決策）
 */

import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { syncLineAccountForUser } from "@/server/services/line-account-sync";
import { repairCustomerIdentityOnLogin } from "@/lib/identity-repair";
import { awardLineJoinReferrerIfEligible } from "@/server/services/referral-points";
import { logLineBindEvent, maskId, maskLineUserId } from "@/lib/line-bind-log";

/**
 * Lightweight detection of Prisma unique-constraint errors (P2002) without
 * importing Prisma.PrismaClientKnownRequestError at the type level. The Prisma
 * client's error classes aren't always tree-shake friendly in edge / route
 * contexts; reading `code` off the thrown value keeps this helper neutral.
 */
function isPrismaUniqueConflict(err: unknown): err is { code: "P2002"; meta?: { target?: string[] | string } } {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { code?: unknown };
  return candidate.code === "P2002";
}

function uniqueConflictTarget(err: { meta?: { target?: string[] | string } }): string {
  const t = err.meta?.target;
  if (!t) return "unknown";
  return Array.isArray(t) ? t.join(",") : String(t);
}

/**
 * Detect Prisma `P2034` — transaction failed due to a write conflict or
 * deadlock at Serializable isolation. Distinct from `P2002` (which is a
 * unique-constraint hit); `P2034` represents a *retryable* race that the
 * database aborted to preserve serializability. Currently only the
 * customerId-driven helper (PR-G5.1.a) translates this into a controlled
 * status; the phone-driven helper still re-throws (unchanged baseline).
 */
function isPrismaWriteConflict(err: unknown): err is { code: "P2034" } {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { code?: unknown };
  return candidate.code === "P2034";
}

/** Helper 輸入 */
export interface BindLineInput {
  /** 同店 scope 用；caller 已驗證的 storeId（PR-B exchange route 經 resolveStoreBySlug 取得）*/
  storeId: string;
  /** LINE userId（PR-B verifyLiffIdToken 後拿到的 `sub`）*/
  lineUserId: string;
  /** LINE displayName，沒有給 null；best-effort 寫入 Customer.lineName */
  lineName: string | null;
  /** 顧客 onboarding 輸入手機；helper 內會 normalizePhone */
  phone: string;
  /** 顧客 onboarding 輸入姓名 */
  name: string;
}

/** Helper 輸出 — 全部用 status discriminator，**不 throw** */
export type BindLineResult =
  | {
      status: "created_new";
      customerId: string;
      userId: string;
      lineAccountSync: "created" | "noop_already_synced" | "error";
    }
  | {
      status: "bound_existing";
      customerId: string;
      userId: string;
      /** true：Customer 原本 userId=null，本次建 User 並綁；false：Customer 已有 userId，僅補 lineUserId */
      userCreated: boolean;
      lineAccountSync:
        | "created"
        | "noop_already_synced"
        | "skipped_already_linked_other_user"
        | "error";
    }
  | {
      status: "already_synced";
      customerId: string;
      userId: string;
    }
  | {
      status: "already_bound_to_other_line";
      /** 找到的 Customer.id（讓 UI 可顯示「請聯繫店家解除」）*/
      customerId: string;
      /** 占用該 Customer 的 lineUserId（非本次輸入的）*/
      existingLineUserId: string;
    }
  | {
      status: "phone_taken_by_other_user";
      /** 找到的 Customer.id；該 Customer.userId 已 set */
      customerId: string;
      /** 該 Customer 是否已綁同一個 lineUserId（防誤判 already_synced）*/
      sameLineUserId: boolean;
    }
  | {
      status: "ambiguous_multiple_candidates";
      /** 同店命中 ≥2 筆相同 phone — 髒資料，請聯繫店家。最多回 2 筆 id 供 audit */
      candidateIds: string[];
    }
  | {
      status: "validation_error";
      reason: "invalid_phone" | "missing_input";
    }
  | {
      /**
       * Prisma P2002 unique-constraint violation hit during the create-new tx
       * (e.g. another concurrent bind beat us to the same (storeId, phone) or
       * (storeId, lineUserId) compound key). Returned as a controlled status
       * so the caller (LIFF onboarding action / webhook handler) can re-query
       * and re-dispatch instead of bubbling a 500 to the LIFF client.
       */
      status: "unique_conflict";
      /** Comma-joined Prisma meta.target if available, else "unknown" */
      conflictTarget: string;
    };

/**
 * 將 LINE 身份綁到同店 Customer 的 canonical helper。
 *
 * @returns {BindLineResult} — discriminated union，caller 依 status 分流
 */
export async function bindLineToCustomerInStore(
  input: BindLineInput
): Promise<BindLineResult> {
  // ── 1. Input validation ──────────────────────────
  if (!input.storeId || !input.lineUserId || !input.name) {
    return { status: "validation_error", reason: "missing_input" };
  }
  const normalizedPhone = normalizePhone(input.phone);
  if (!/^09\d{8}$/.test(normalizedPhone)) {
    return { status: "validation_error", reason: "invalid_phone" };
  }

  // ── 2. 同店 phone 查 2 筆判 ambiguous ────────────
  const candidates = await prisma.customer.findMany({
    where: { storeId: input.storeId, phone: normalizedPhone },
    select: {
      id: true,
      userId: true,
      lineUserId: true,
      lineLinkStatus: true,
      lineName: true,
    },
    take: 2,
  });

  if (candidates.length > 1) {
    console.warn("[bindLineToCustomer] ambiguous_multiple_candidates", {
      storeId: input.storeId,
      phone: normalizedPhone,
      candidateIds: candidates.map((c) => c.id),
    });
    return {
      status: "ambiguous_multiple_candidates",
      candidateIds: candidates.map((c) => c.id),
    };
  }

  // ── 3a. 候選 = 0 → 建新 User + Customer + Account ──
  if (candidates.length === 0) {
    let user: { id: string };
    let customer: { id: string };
    try {
      const created = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            name: input.name,
            phone: normalizedPhone,
            role: "CUSTOMER",
            status: "ACTIVE",
          },
        });
        const c = await tx.customer.create({
          data: {
            name: input.name,
            phone: normalizedPhone,
            storeId: input.storeId,
            userId: u.id,
            authSource: "LINE",
            lineUserId: input.lineUserId,
            lineName: input.lineName ?? input.name,
            lineLinkStatus: "LINKED",
            lineLinkedAt: new Date(),
            customerStage: "LEAD",
          },
          select: { id: true },
        });
        return { user: u, customer: c };
      });
      user = created.user;
      customer = created.customer;
    } catch (err) {
      // P2002: concurrent bind beat us to the same (storeId, phone) /
      // (storeId, lineUserId) compound key. Return controlled status so the
      // caller doesn't surface a 500 to LIFF — they can re-query and retry the
      // 1-candidate branch on the next invocation.
      if (isPrismaUniqueConflict(err)) {
        const target = uniqueConflictTarget(err);
        logLineBindEvent({
          path: "liff-exchange",
          status: "unique_conflict",
          storeId: input.storeId,
          lineUserId: input.lineUserId,
          phone: normalizedPhone,
          errorCode: "P2002",
          extra: { conflictTarget: target },
        });
        return { status: "unique_conflict", conflictTarget: target };
      }
      // Unknown error — re-throw so it surfaces in error tracking.
      throw err;
    }

    // Account 同步：放 tx 外接受小幅 race window（per project-line-account-sync-rule
    // memory，這是已知妥協；syncLineAccountForUser 為 idempotent，多次呼叫安全）
    const syncResult = await syncLineAccountForUser({
      userId: user.id,
      lineUserId: input.lineUserId,
    });

    // post-tx best-effort
    await runPostBindBestEffort({
      customerId: customer.id,
      userId: user.id,
      storeId: input.storeId,
      phone: normalizedPhone,
      lineUserId: input.lineUserId,
    });

    return {
      status: "created_new",
      customerId: customer.id,
      userId: user.id,
      lineAccountSync:
        syncResult.status === "created"
          ? "created"
          : syncResult.status === "noop_already_synced"
            ? "noop_already_synced"
            : "error",
    };
  }

  // ── 3b. 候選 = 1：根據既有狀態分支 ───────────────
  const real = candidates[0];

  // 已綁同一個 lineUserId → already_synced (idempotent)
  if (
    real.lineUserId === input.lineUserId &&
    real.userId
  ) {
    return {
      status: "already_synced",
      customerId: real.id,
      userId: real.userId,
    };
  }

  // 已綁不同 lineUserId → reject（schema 也會擋，但顯式 status 給 UI 文案）
  if (real.lineUserId && real.lineUserId !== input.lineUserId) {
    return {
      status: "already_bound_to_other_line",
      customerId: real.id,
      existingLineUserId: real.lineUserId,
    };
  }

  // Customer.userId 已存在 → 不允許 LIFF onboarding 自動劫持
  // 改走 webhook「綁定碼」流程（staff 驗證身份）
  if (real.userId) {
    console.warn(
      "[bindLineToCustomer] phone_taken_by_other_user — refuse auto-bind",
      {
        storeId: input.storeId,
        customerId: real.id,
        existingUserId: real.userId,
        attemptedLineUserId: input.lineUserId,
      }
    );
    return {
      status: "phone_taken_by_other_user",
      customerId: real.id,
      sameLineUserId: false, // 已知 real.lineUserId !== input（前面已 return），此處 false
    };
  }

  // Customer.userId === null AND lineUserId === null
  //   → staff 建檔 / OAuth placeholder 殘留；本次建 User + 綁 LINE
  const { user } = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: input.name,
        phone: normalizedPhone,
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });
    await tx.customer.update({
      where: { id: real.id },
      data: {
        userId: u.id,
        name: input.name, // 用 onboarding 輸入覆蓋（staff 建檔可能用「未命名」）
        authSource: "LINE",
        lineUserId: input.lineUserId,
        lineName: input.lineName ?? input.name,
        lineLinkStatus: "LINKED",
        lineLinkedAt: new Date(),
      },
    });
    return { user: u };
  });

  const syncResult = await syncLineAccountForUser({
    userId: user.id,
    lineUserId: input.lineUserId,
  });

  await runPostBindBestEffort({
    customerId: real.id,
    userId: user.id,
    storeId: input.storeId,
    phone: normalizedPhone,
    lineUserId: input.lineUserId,
  });

  return {
    status: "bound_existing",
    customerId: real.id,
    userId: user.id,
    userCreated: true,
    lineAccountSync:
      syncResult.status === "created"
        ? "created"
        : syncResult.status === "noop_already_synced"
          ? "noop_already_synced"
          : syncResult.status === "skipped_already_linked_other_user"
            ? "skipped_already_linked_other_user"
            : "error",
  };
}

/**
 * Post-binding best-effort side effects（一律 swallow errors）：
 *   - identity-repair：同店其他 markers 若有 dangling，best-effort 重綁
 *   - referral-points：若 Customer.sponsorId 已 set → award referrer +1
 *
 * 都失敗也不影響 helper 主回傳；主流程已 commit。
 */
async function runPostBindBestEffort(opts: {
  customerId: string;
  userId: string;
  storeId: string;
  phone: string;
  lineUserId: string;
}): Promise<void> {
  try {
    await repairCustomerIdentityOnLogin({
      userId: opts.userId,
      storeId: opts.storeId,
      phone: opts.phone,
      lineUserId: opts.lineUserId,
    });
  } catch (err) {
    console.warn("[bindLineToCustomer] repair best-effort failed", {
      customerId: opts.customerId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    await awardLineJoinReferrerIfEligible({
      customerId: opts.customerId,
      storeId: opts.storeId,
    });
  } catch (err) {
    console.warn("[bindLineToCustomer] award referrer best-effort failed", {
      customerId: opts.customerId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//
//  bindLineToExistingCustomerById — customerId-driven helper (PR-G5.1.a)
//
//  Sister helper to bindLineToCustomerInStore(): same internal mask helpers,
//  but driven by **customerId** instead of phone. Designed for callers that
//  already know which Customer they want to bind LINE to:
//    - webhook bind-code (PR-G5.2 will wire)
//    - /oauth-confirm/finalize NEED_LOGIN path (PR-G5.4 will wire)
//
//  **NOT** wired by this PR — dead-code on prod until subsequent PRs
//  consume it (same shipping pattern as the original PR-C1 helper).
//
//  Strict conformance to docs/line-identity-binding-pre-audit.md §5.3:
//    Pre-write checklist for existing-user helper:
//      1. caller provides storeId from a verifiable trusted source
//      2. load Customer by customerId (read-only)
//      3. verify customer.storeId === storeId → mismatch ⇒ store_mismatch + 0 writes
//      4. verify customer.userId !== null → null ⇒ customer_has_no_user + 0 writes
//      5. Customer.update + Account.create in single Serializable $transaction
//         (A3 atomicity); any throw rolls everything back
//
//  Rejection statuses always write 0 DB rows. PII (lineUserId, customerId,
//  userId) never logged raw — only via maskLineUserId() / maskId().
//
//  Explicitly NOT in PR-G5.1.a scope:
//    - Does NOT create User (rejects userId === null instead).
//      Activation of Customer.userId === null is the Case B activation
//      helper's job (PR-G5.5 will land separately as
//      activatePrecreatedCustomerWithLine).
//    - Does NOT write an AuditLog row. Callers may opt-in to write their
//      own AuditLog around the helper call if they want audit trail.
//      (PR-G5.0 §5.3 mentioned AuditLog inside the tx, but PR-G5.2
//      webhook refactor requires byte-equivalent output vs current
//      legacy and current legacy doesn't write AuditLog — so deferring.)
//
// ════════════════════════════════════════════════════════════════════════════

/** PR-G5.1.a helper input. */
export interface BindLineToExistingCustomerByIdInput {
  /**
   * Trusted store context from caller. Per PR-G5.0 §5.3 rule 1, the caller is
   * responsible for sourcing this from a verifiable trust source (webhook
   * resolveStore / signed+verified oauth_line_session / NextAuth signed
   * session). Helper enforces `customer.storeId === storeId` as the real
   * authorization boundary regardless.
   */
  storeId: string;
  /** Target Customer.id resolved by caller (binding code lookup, finalize state, etc.). */
  customerId: string;
  /** LINE userId from a verified OAuth / LIFF source. */
  lineUserId: string;
  /** LINE displayName for Customer.lineName; null is allowed. */
  lineName: string | null;
}

/** PR-G5.1.a helper output — discriminated union; never throws on expected branches. */
export type BindLineToExistingCustomerByIdResult =
  | {
      /** Customer.lineUserId / lineLinkStatus updated + Account[line] created. */
      status: "bound_existing";
      customerId: string;
      userId: string;
    }
  | {
      /**
       * Customer was already bound to this exact lineUserId AND its
       * Account[line] row already points at the same userId. Idempotent
       * no-op; safe to call again.
       */
      status: "already_synced";
      customerId: string;
      userId: string;
    }
  | {
      /**
       * Reject — the LINE binding for this Customer is locked; staff
       * must intervene (manual unbind / merge) before another bind
       * attempt can succeed. Covers two sub-cases of "this binding
       * combination is taken / mis-aligned":
       *
       *   (a) Customer.lineUserId is already set to a DIFFERENT
       *       lineUserId. Detected in main helper step 5b.
       *
       *   (b) Customer.lineUserId === input.lineUserId AND a
       *       matching Account[line] row exists, BUT
       *       Account.userId !== Customer.userId. Detected in main
       *       helper step 5a-ii (PR #242 Codex P2 round 7). Without
       *       this explicit branch the helper would fall into
       *       `runAccountOnlyRepairTx` → `tx.account.create` →
       *       Prisma P2002 → generic `unique_conflict`, conflating
       *       this known drift mode with a true racing concurrent
       *       binder.
       *
       * In both cases the appropriate operator action is the same
       * (unbind the stale side, then re-bind), so the status surface
       * stays a single `customer_locked` variant. Masked log lines
       * at the call sites distinguish the sub-cases for observability
       * without polluting the public type.
       */
      status: "customer_locked";
      customerId: string;
      /** Whichever conflicting lineUserId was observed first (existing on Customer or via Account row). */
      existingLineUserId: string | null;
    }
  | {
      /**
       * customer.storeId !== input.storeId. Real authorization boundary
       * per PR-G5.0 §5.3 step 3. 0 DB writes; no caller-side guard needed.
       * Also returned when customerId resolves to no Customer at all
       * (stale id from caller).
       */
      status: "store_mismatch";
      expectedStoreId: string;
      /** "(not_found)" when customerId resolved no row. */
      actualStoreId: string;
    }
  | {
      /**
       * customer.userId === null. This helper is existing-user-only;
       * Case B (staff-precreated Customer + first LINE OAuth) is handled
       * by the separate activatePrecreatedCustomerWithLine helper
       * (PR-G5.5). 0 DB writes; helper never silently creates User.
       */
      status: "customer_has_no_user";
      customerId: string;
    }
  | {
      /**
       * Prisma P2002 unique-constraint violation during Customer.update or
       * Account.create. Possible races:
       *   - (storeId, lineUserId) collision: another Customer in same store
       *     already claims this lineUserId
       *   - (provider, providerAccountId) collision: Account[line] already
       *     exists pointing at a different user (drift case PR-F1.2 detects)
       * Transaction rolls back; 0 DB writes effectively committed.
       */
      status: "unique_conflict";
      conflictTarget: string;
    }
  | {
      /**
       * Prisma P2034 — Serializable transaction aborted due to write conflict
       * or deadlock with a concurrent binder (per PR-G5.1.a P2 fix #1).
       * Distinct from `unique_conflict`: P2002 is a permanent constraint
       * hit; P2034 is a *retryable* race the database resolved by aborting
       * one of the contenders. Transaction rolls back; 0 DB writes
       * effectively committed. Caller MAY retry (helper does not retry
       * internally; that decision belongs to the caller's UX layer).
       */
      status: "write_conflict";
      /** Surfaced Prisma error code for caller observability. */
      code: "P2034";
    }
  | {
      /**
       * Drift-repair path: Customer.lineUserId already equals input
       * lineUserId, but the Account[line] row was missing
       * (PR-F1.2 `missing-account` drift). Helper created ONLY the
       * Account row — Customer link metadata (`lineLinkedAt`, `lineName`)
       * is intentionally **preserved** unchanged so the original bind
       * timestamp + display name stay intact. Disjoint from
       * `bound_existing` (which always writes both rows) per PR-G5.1.a
       * P2 fix #2.
       */
      status: "account_repaired";
      customerId: string;
      userId: string;
    }
  | {
      /**
       * Conditional Customer update inside runFullBindTx affected 0
       * rows — the Customer's link state changed between the helper's
       * preflight read (`customer.lineUserId === null`) and the tx
       * write boundary. Another binder won the race in the interval.
       *
       * Per PR-G5.1.a P1 round 1 (PR #242 Codex): full-bind tx writes
       * Customer with `where: { id, storeId, userId, lineUserId: null }`
       * (not just `where: { id }`), so a stale write returns count 0
       * and we abort the tx before Account.create. Effective DB state:
       * 0 byte writes; transaction rolls back. Caller can retry by
       * re-invoking the helper, which will now observe the linked
       * state and route to `already_synced` / `account_repaired` /
       * `customer_locked` per the same dispatch.
       *
       * Also returned by `runAccountOnlyRepairTx` when its in-tx
       * Customer re-check (`assertCustomerStillLinkedForAccountRepairTx`)
       * finds the Customer no longer in the (storeId, userId, lineUserId,
       * not-merged) state from preflight — per PR #242 Codex P2 round 5+6.
       *
       * Disjoint from `write_conflict` (Prisma P2034 — DB-detected
       * serialization race) and `unique_conflict` (P2002 — constraint
       * hit). This is application-level TOCTOU detected by the
       * conditional updateMany count / in-tx re-check.
       */
      status: "stale_customer_link";
      customerId: string;
    };

/**
 * customerId-driven LINE binding helper for existing-user Customers.
 *
 * @see docs/line-identity-binding-pre-audit.md §5.3 for full pre-write
 *      checklist + caller routing rules + atomicity guarantees.
 */
export async function bindLineToExistingCustomerById(
  input: BindLineToExistingCustomerByIdInput,
): Promise<BindLineToExistingCustomerByIdResult> {
  // ── step 2: load Customer (read-only, outside tx) ──────────────────────
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: {
      id: true,
      storeId: true,
      userId: true,
      lineUserId: true,
      lineLinkStatus: true,
    },
  });

  // No row → treat as store_mismatch with sentinel actualStoreId so caller
  // (and tests) can disambiguate from a real cross-store conflict.
  if (!customer) {
    return {
      status: "store_mismatch",
      expectedStoreId: input.storeId,
      actualStoreId: "(not_found)",
    };
  }

  // ── step 3: cross-store guard (real authorization boundary) ────────────
  if (customer.storeId !== input.storeId) {
    return {
      status: "store_mismatch",
      expectedStoreId: input.storeId,
      actualStoreId: customer.storeId,
    };
  }

  // ── step 4: existing-user guard (Case B routes elsewhere) ──────────────
  if (customer.userId === null) {
    return { status: "customer_has_no_user", customerId: customer.id };
  }
  const customerUserId = customer.userId;

  // ── step 5: dispatch by linkage state ──────────────────────────────────
  //
  // PR #242 Codex P2 round 3: every non-null `customer.lineUserId` case
  // MUST return inside this outer `if` block. The full-bind tx in step 6
  // writes `lineUserId / lineName / lineLinkStatus / lineLinkedAt` on the
  // Customer row, and must NEVER run for an already-linked customer.
  //
  // We enforce this two ways:
  //   (1) Structural — every code path inside `if (customer.lineUserId !== null)`
  //       below returns. TypeScript narrows `customer.lineUserId` to `null`
  //       past this block, so by the type system alone, step 6 only runs
  //       for an unlinked customer.
  //   (2) Defensive runtime guard — immediately before step 6 we re-check
  //       `customer.lineUserId !== null` (cast around the TS narrow) and
  //       throw if violated. In correct code this guard is provably dead;
  //       its purpose is to convert any future-refactor regression (e.g.
  //       someone deleting the `return runAccountOnlyRepairTx(...)`
  //       statement below) into a thrown invariant violation rather than a
  //       silent overwrite of historical Customer link metadata.
  //
  // Sub-cases under "already linked" (customer.lineUserId !== null):
  //   • same lineUserId AND Account[line] row → already_synced (0 writes)
  //   • same lineUserId AND Account[line] missing → runAccountOnlyRepairTx
  //     (Account-only repair; PRESERVES Customer.lineLinkedAt / lineName /
  //     lineLinkStatus — see HARD INVARIANT comment on the function)
  //   • different lineUserId → customer_locked (0 writes)
  //   • same lineUserId AND Account[line] → other user → surfaces from
  //     Account.create P2002 inside runAccountOnlyRepairTx as unique_conflict
  if (customer.lineUserId !== null) {
    if (customer.lineUserId === input.lineUserId) {
      // 5a. Same-line — idempotent OR Account-only repair.
      const existingAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "line",
            providerAccountId: input.lineUserId,
          },
        },
        select: { userId: true },
      });
      // 5a-i. Account[line] exists BUT points at a DIFFERENT userId —
      // detected FIRST (PR #242 Codex P2 round 8) so this branch
      // structurally precedes any repair dispatch. Returns the
      // canonical `customer_locked` status (sub-case documented in
      // the result-type JSDoc on the `customer_locked` variant).
      // Without this explicit branch, control would fall into
      // runAccountOnlyRepairTx → tx.account.create → Prisma P2002 →
      // generic `unique_conflict`, conflating a known drift (staff
      // intervention needed) with a true racing concurrent binder.
      if (existingAccount && existingAccount.userId !== customerUserId) {
        logCustomerLockedAccountOwnerMismatch({
          storeId: input.storeId,
          customerId: customer.id,
          customerUserId,
          accountUserId: existingAccount.userId,
          lineUserId: input.lineUserId,
        });
        return {
          status: "customer_locked",
          customerId: customer.id,
          existingLineUserId: customer.lineUserId,
        };
      }
      // 5a-ii. Account[line] points at same user → idempotent no-op.
      if (existingAccount && existingAccount.userId === customerUserId) {
        return {
          status: "already_synced",
          customerId: customer.id,
          userId: customerUserId,
        };
      }
      // 5a-iii. Account[line] row missing → REPAIR ONLY, return immediately.
      //
      // ⚠ This `return` is the SINGLE exit from the "linked-same +
      //   missing-Account" case. Removing it would let control fall
      //   through past step 5 into step 6's full-bind tx — which writes
      //   the Customer link metadata block (lines ~660 below) and would
      //   silently overwrite historical lineLinkedAt / lineName /
      //   lineLinkStatus. PR #242 Codex P2 round 3 added the defensive
      //   throw guard between step 5 and step 6 to catch exactly this
      //   regression at runtime; tests also pin the source structure.
      return runAccountOnlyRepairTx({
        storeId: input.storeId,
        customerId: customer.id,
        userId: customerUserId,
        lineUserId: input.lineUserId,
      });
    }

    // 5b. Different lineUserId already attached → reject.
    return {
      status: "customer_locked",
      customerId: customer.id,
      existingLineUserId: customer.lineUserId,
    };
  }

  // ── step 5.5: defensive runtime invariant guard (PR #242 Codex P2 round 3+4)
  //
  // TypeScript narrows `customer.lineUserId` to `null` past the dispatch
  // block above. This guard mirrors that property at runtime so that any
  // future refactor that breaks the narrow (e.g. accidentally turning a
  // `return` into a `break`, removing the outer `if`, or restructuring
  // the dispatch) surfaces as an invariant-violation throw rather than a
  // silent overwrite of historical Customer link metadata via the
  // full-bind dispatch below.
  //
  // The cast to `string | null` defeats TypeScript's narrow so the
  // runtime check is preserved. In correct code this throw is provably
  // unreachable — that is its purpose.
  if ((customer.lineUserId as string | null) !== null) {
    throw new Error(
      `[bindLineToExistingCustomerById] internal invariant violation: full-bind path reached with linked customer (customerId=${maskId(
        customer.id,
      )})`,
    );
  }

  // ── step 6: dispatch to runFullBindTx ──────────────────────────────
  //
  // runFullBindTx is the sibling private fn that owns the full-bind
  // Customer write + Account create. By isolating each tx shape
  // behind its own function, this main helper cannot share a tx body
  // with runAccountOnlyRepairTx — see the contract comment block on
  // runFullBindTx below (PR #242 Codex P2 round 4).
  return runFullBindTx({
    storeId: input.storeId,
    customerId: customer.id,
    userId: customerUserId,
    lineUserId: input.lineUserId,
    lineName: input.lineName,
  });
}

/**
 * Shared catch-arm translator for the two atomic write paths inside
 * `bindLineToExistingCustomerById` (full bind tx + Account-only repair tx).
 *
 * Returns a controlled helper-status result for **expected** race / drift
 * errors that Prisma surfaces at Serializable isolation:
 *   - `P2002` → `unique_conflict` (constraint hit; deterministic)
 *   - `P2034` → `write_conflict` (Serializable retryable race; per PR-G5.1.a P2 fix #1)
 *
 * Returns `null` for anything else — caller re-throws so unknown DB
 * failures stay visible up the stack.
 *
 * PII contract: only masked values (`maskId`, `maskLineUserId`) ever reach
 * `console.warn`. Raw storeId / customerId / userId / lineUserId / phone
 * are never logged.
 */

/**
 * Masked log helper for the customer_locked / account-owner-mismatch
 * sub-case in main helper step 5a (PR #242 Codex P2 round 8).
 *
 * Pulled into a named module-private fn so the dispatch branch in the
 * main helper stays pure `if (...) { log(...); return ...; }` — Codex's
 * contract checker reads the branch as a clean customer_locked return.
 *
 * Distinguishes the account-owner-mismatch sub-case from the Customer-
 * side lineUserId-mismatch sub-case via the log line label, without
 * polluting the public discriminated-union type.
 */
function logCustomerLockedAccountOwnerMismatch(ctx: {
  storeId: string;
  customerId: string;
  customerUserId: string;
  accountUserId: string;
  lineUserId: string;
}): void {
  console.warn(
    "[bindLineToExistingCustomerById] customer_locked (account-owner-mismatch sub-case)",
    {
      storeId: maskId(ctx.storeId),
      customerId: maskId(ctx.customerId),
      customerUserId: maskId(ctx.customerUserId),
      accountUserId: maskId(ctx.accountUserId),
      lineUserId: maskLineUserId(ctx.lineUserId),
    },
  );
}

function translateAtomicLineBindTxError(
  err: unknown,
  ctx: {
    storeId: string;
    customerId: string;
    userId: string;
    lineUserId: string;
  },
):
  | { status: "unique_conflict"; conflictTarget: string }
  | { status: "write_conflict"; code: "P2034" }
  | null {
  if (isPrismaUniqueConflict(err)) {
    const target = uniqueConflictTarget(err);
    console.warn("[bindLineToExistingCustomerById] unique_conflict", {
      storeId: maskId(ctx.storeId),
      customerId: maskId(ctx.customerId),
      userId: maskId(ctx.userId),
      lineUserId: maskLineUserId(ctx.lineUserId),
      conflictTarget: target,
    });
    return { status: "unique_conflict", conflictTarget: target };
  }
  if (isPrismaWriteConflict(err)) {
    console.warn("[bindLineToExistingCustomerById] write_conflict", {
      storeId: maskId(ctx.storeId),
      customerId: maskId(ctx.customerId),
      userId: maskId(ctx.userId),
      lineUserId: maskLineUserId(ctx.lineUserId),
      code: "P2034",
    });
    return { status: "write_conflict", code: "P2034" };
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//
//  runAccountOnlyRepairTx — dedicated Account[line] repair, sibling to the
//  full bind tx inside `bindLineToExistingCustomerById`.
//
//  ⚠ HARD INVARIANT (PR #242 Codex P2 round 2 + P2 round 5):
//
//    THIS FUNCTION MUST NEVER WRITE ANY Customer row column.
//
//      • NO `tx.customer.update` / `updateMany` / `upsert` / `create` /
//        `delete` / `deleteMany` call (any Customer WRITE)
//      • NO `prisma.customer.*` write call outside the tx either
//      • NO reference to the strings `lineLinkedAt`, `lineName`,
//        `lineLinkStatus` as a write target (data: literal keys)
//      • NO data object containing those keys
//
//    A read-only `tx.customer.findFirst` IS permitted — and required,
//    per PR #242 Codex P2 round 5 (see the in-tx re-check below). The
//    invariant is about WRITES; a read that drives a stale-state guard
//    cannot mutate Customer.
//
//    The drift case we repair is: Customer already records the correct
//    `lineUserId` from a previous successful bind, but the Account[line]
//    row went missing (PR-F1.2 detects this as the `missing-account`
//    category). The Customer's link metadata — `lineLinkedAt` (original
//    bind timestamp), `lineName` (LINE displayName captured at first
//    bind), `lineLinkStatus` — is **historical truth** and MUST NOT be
//    rewritten by a repair call, especially because the caller's
//    `input.lineName` could legitimately be `null` for an OAuth source
//    that didn't echo displayName.
//
//    The full-bind path lives in `runFullBindTx` and owns the
//    `tx.customer.updateMany` data block. By keeping the repair in THIS
//    function and gating Account.create behind an in-tx Customer
//    re-check, the two write shapes are physically separate AND the
//    repair tx cannot create an orphan Account row for a Customer that
//    has been concurrently unbound / merged / reassigned since the
//    main helper's preflight read.
//
//  ⚠ TOCTOU race protection (PR #242 Codex P2 round 5):
//
//    The main helper's preflight reads Customer outside any tx. By
//    the time the repair tx runs, another flow may have:
//      - unbound the Customer (set lineUserId = null)
//      - reassigned the Customer to a different userId
//      - merged this Customer into another (mergedIntoCustomerId set)
//      - moved the Customer to a different store (very rare; defense
//        in depth)
//    Creating an Account[line] row in any of these cases would leave
//    stale state — an Account pointing to a userId / lineUserId
//    combination that no Customer claims anymore.
//
//    Fix: inside the tx, BEFORE Account.create, run a conditional
//    `tx.customer.findFirst` whose where-clause re-asserts every
//    preflight invariant (id, storeId, userId, lineUserId,
//    mergedIntoCustomerId: null). If the row is no longer there
//    (null result), throw a `StaleCustomerLinkError` sentinel — the
//    tx rolls back (Account.create never runs) and the catch arm
//    returns the same `stale_customer_link` status as the full-bind
//    path. Caller can retry — the next invocation observes the
//    post-mutation state and routes appropriately.
//
//    Tests in `src/__tests__/bind-line-to-existing-customer-by-id.test.ts`
//    sections 11 + 16 lock the per-field preservation invariant and
//    the in-tx re-check race protection.
//
// ════════════════════════════════════════════════════════════════════════════

/**
 * Account[line]-only repair tx for the `missing-account` drift case.
 * See the invariant block above — this function deliberately does NOT
 * write any Customer column. It DOES read Customer in-tx for stale-
 * state protection: the `tx.customer.findFirst` + `if (...) throw` is
 * INLINED (PR #242 Codex P2 round 8) so the gate is structurally
 * obvious and impossible to miss — no helper indirection, the
 * findFirst, the null check, and `tx.account.create` are all in the
 * same lexical block.
 */
async function runAccountOnlyRepairTx(params: {
  storeId: string;
  customerId: string;
  userId: string;
  lineUserId: string;
}): Promise<
  | { status: "account_repaired"; customerId: string; userId: string }
  | { status: "unique_conflict"; conflictTarget: string }
  | { status: "write_conflict"; code: "P2034" }
  | { status: "stale_customer_link"; customerId: string }
> {
  try {
    await prisma.$transaction(
      async (tx) => {
        // ── In-tx Customer re-check GATE (PR #242 Codex P2 round 5/6/7/8) ──
        //
        // Re-assert every Customer-state invariant the main helper's
        // preflight read observed, inside the repair tx. If the
        // Customer was concurrently unbound / reassigned / merged
        // between preflight and tx-start, findFirst returns null,
        // we throw `StaleCustomerLinkError`, Prisma rolls back, and
        // `tx.account.create` is structurally unreachable — no orphan
        // Account row can ever be written.
        //
        // The re-check is INLINED here (no helper indirection) so the
        // gate is visible in the same lexical block as the write it
        // gates. Source tests in section 16 pin: (a) tx.customer.findFirst
        // appears textually before tx.account.create; (b) the 5-predicate
        // where-clause is intact; (c) the null check throws
        // StaleCustomerLinkError; (d) only ONE tx.account.create exists.
        const stillLinked = await tx.customer.findFirst({
          where: {
            id: params.customerId,
            storeId: params.storeId,
            userId: params.userId,
            lineUserId: params.lineUserId,
            mergedIntoCustomerId: null,
          },
          select: { id: true },
        });
        if (stillLinked === null) {
          throw new StaleCustomerLinkError(params.customerId);
        }
        await tx.account.create({
          data: {
            userId: params.userId,
            provider: "line",
            providerAccountId: params.lineUserId,
            type: "oauth",
          },
        });
      },
      // Same isolation contract as the full bind tx so racing binders
      // surface as P2002 / P2034 deterministically.
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    // Stale-link sentinel: controlled return + masked log. Account
    // never reached create(); no orphan row was written.
    if (err instanceof StaleCustomerLinkError) {
      console.warn(
        "[bindLineToExistingCustomerById] stale_customer_link (account-repair)",
        {
          storeId: maskId(params.storeId),
          customerId: maskId(params.customerId),
          userId: maskId(params.userId),
          lineUserId: maskLineUserId(params.lineUserId),
        },
      );
      return {
        status: "stale_customer_link",
        customerId: params.customerId,
      };
    }
    const translated = translateAtomicLineBindTxError(err, params);
    if (translated) return translated;
    throw err;
  }
  return {
    status: "account_repaired",
    customerId: params.customerId,
    userId: params.userId,
  };
}

// ════════════════════════════════════════════════════════════════════════════
//
//  runFullBindTx — first-time bind atomic write, sibling to
//  runAccountOnlyRepairTx inside `bindLineToExistingCustomerById`.
//
//  ⚠ CONTRACT (PR #242 Codex P2 round 4 + P1 round 1):
//
//    THIS FUNCTION OWNS the full-bind metadata write block. Customer
//    link metadata (`lineUserId`, `lineName`, `lineLinkStatus`,
//    `lineLinkedAt`) is written here and ONLY here in the new
//    helper's call graph.
//
//    Caller contract — the main helper MUST guarantee
//    `customer.lineUserId === null` before invoking this function.
//    Step 5 of `bindLineToExistingCustomerById` enforces this both
//    via TypeScript narrowing and via a defensive runtime throw
//    guard placed immediately before the call site (step 5.5).
//    Tests in `src/__tests__/bind-line-to-existing-customer-by-id.test.ts`
//    section 14 lock the source-level invariant: the main helper body
//    contains 0 `tx.customer.updateMany` writes, and the metadata field
//    names live ONLY inside this function's body.
//
//    Tx shape: Customer.updateMany (CONDITIONAL on lineUserId === null
//    at tx-write time) + Account.create, atomic in one Serializable
//    $transaction (A3).
//
//    ⚠ TOCTOU race protection (PR #242 Codex P1 round 1):
//
//    Updating by `id` alone is unsafe — two binders can both pass the
//    main helper's preflight read of `customer.lineUserId === null`
//    and then race into this tx, where the second `update({ where: { id } })`
//    would silently overwrite the first binder's `lineUserId`. Account
//    unique `(provider, providerAccountId)` would not catch it because
//    the two binders bind DIFFERENT lineUserIds.
//
//    Fix: the Customer write is a `tx.customer.updateMany` with
//    `where: { id, storeId, userId, lineUserId: null }`. If another
//    binder has already linked the Customer between preflight and tx
//    boundary, the conditional where matches 0 rows. We then throw a
//    `StaleCustomerLinkError` sentinel inside the tx callback to roll
//    back (no Account.create runs); the catch arm translates the
//    sentinel into a controlled `stale_customer_link` status.
//    Caller can retry — the next invocation will see the linked state
//    and route to `already_synced` / `account_repaired` / `customer_locked`.
//
//    The `storeId` and `userId` predicates are defense-in-depth — the
//    main helper guarantees both, but including them here makes the
//    condition fail closed if any preflight state was already stale.
//
//    Error translation:
//      - StaleCustomerLinkError → stale_customer_link (this fn's catch)
//      - P2002 → unique_conflict (shared translator)
//      - P2034 → write_conflict (shared translator)
//      - anything else → re-thrown
//
// ════════════════════════════════════════════════════════════════════════════

/**
 * Sentinel thrown from inside the runFullBindTx callback when the
 * conditional Customer updateMany affects 0 rows (link state changed
 * between preflight and tx-write boundary). Caught at the tx wrapper
 * to roll back the transaction and translate to the
 * `stale_customer_link` status. Private to this module.
 */
class StaleCustomerLinkError extends Error {
  readonly customerId: string;
  constructor(customerId: string) {
    super(
      "[runFullBindTx] customer link state changed between preflight and tx write",
    );
    this.name = "StaleCustomerLinkError";
    this.customerId = customerId;
  }
}

/**
 * Full-bind tx for the first-time-bind path. Writes Customer link
 * metadata + Account[line] in a single atomic Serializable transaction.
 * Must be called only when `customer.lineUserId === null`. See the
 * contract block above.
 */
async function runFullBindTx(params: {
  storeId: string;
  customerId: string;
  userId: string;
  lineUserId: string;
  lineName: string | null;
}): Promise<
  | { status: "bound_existing"; customerId: string; userId: string }
  | { status: "unique_conflict"; conflictTarget: string }
  | { status: "write_conflict"; code: "P2034" }
  | { status: "stale_customer_link"; customerId: string }
> {
  try {
    await prisma.$transaction(
      async (tx) => {
        // Conditional Customer write — TOCTOU-safe (PR #242 Codex P1/P2).
        //
        // The 5-predicate where-clause below restricts the update to a
        // Customer row that is STILL the exact preflight-observed state
        // at tx-write time:
        //   - `lineUserId: null` — TOCTOU race protection (P1 round 1)
        //   - `mergedIntoCustomerId: null` — exclude merged source row
        //     (P2 round 8); mirrors the repair path's in-tx re-check
        //     predicate so neither dispatch can re-bind LINE to an
        //     obsolete Customer
        //   - `id / storeId / userId` — defense-in-depth identity
        //     re-assertion
        //
        // If count !== 1 the stale-link branch fires; the throw rolls
        // back the (0-row) updateMany and tx.account.create is
        // unreachable.
        const result = await tx.customer.updateMany({
          where: {
            id: params.customerId,
            storeId: params.storeId,
            userId: params.userId,
            lineUserId: null,
            mergedIntoCustomerId: null,
          },
          data: {
            lineUserId: params.lineUserId,
            lineName: params.lineName,
            lineLinkStatus: "LINKED",
            lineLinkedAt: new Date(),
          },
        });
        if (result.count !== 1) {
          throw new StaleCustomerLinkError(params.customerId);
        }
        await tx.account.create({
          data: {
            userId: params.userId,
            provider: "line",
            providerAccountId: params.lineUserId,
            type: "oauth",
          },
        });
      },
      // Serializable per PR-G5.0 §5.3 step 5 (A3 atomicity).
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    // Stale-link sentinel: controlled return + masked log. Account
    // never reached create(); Customer never reached update (count 0).
    if (err instanceof StaleCustomerLinkError) {
      console.warn("[bindLineToExistingCustomerById] stale_customer_link", {
        storeId: maskId(params.storeId),
        customerId: maskId(params.customerId),
        userId: maskId(params.userId),
        lineUserId: maskLineUserId(params.lineUserId),
      });
      return {
        status: "stale_customer_link",
        customerId: params.customerId,
      };
    }
    const translated = translateAtomicLineBindTxError(err, {
      storeId: params.storeId,
      customerId: params.customerId,
      userId: params.userId,
      lineUserId: params.lineUserId,
    });
    if (translated) return translated;
    throw err;
  }
  return {
    status: "bound_existing",
    customerId: params.customerId,
    userId: params.userId,
  };
}
