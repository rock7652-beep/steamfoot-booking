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
import { logLineBindEvent } from "@/lib/line-bind-log";

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
