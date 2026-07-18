import { prisma } from "@/lib/db";
import {
  REQUIRED_CUSTOMER_FIELDS,
  missingRequiredFields,
  type RequiredCustomerField,
} from "@/lib/customer-completion";
import { normalizePhone } from "@/lib/normalize";
import { upsertCustomerIdentityLink } from "@/server/services/customer-identity-link";

/**
 * 前台顧客「目前 session 對應到哪一筆 customer」的唯一 resolver
 *
 * render（profile page）與 submit（updateProfileAction）都必須走這裡，
 * 不得各自用不同 key 查 customer，避免「顯示看得到、儲存找不到」。
 *
 * 查找順序（嚴格同店；任一命中即回）：
 *   A. session.customerId 直查（會驗證 DB 是否存在且同店，stale 則 fall through）
 *   B. CustomerIdentityLink（provider+providerAccountId+storeId / userId+storeId）
 *   C. Customer.userId = session.userId（legacy；有 storeId 時必須同店）
 *   D. 同店 (lineUserId) 唯一匹配 — LINE OAuth user 即使 session.email 為 null
 *      也能命中既有 Customer（避免被誤判 not_found 後再建一筆 placeholder）
 *   E. 同店 email 唯一匹配（來源：session.email 或 payload.email）
 *   F. 同店 phone 唯一匹配（僅 payload.phone；session 無 phone）
 *
 * 穩定性保證：
 *   - sessionCustomerId 可能 stale（顧客被刪、清庫後 cookie 殘留、跨環境 JWT），
 *     A 路徑會驗 DB；找不到時 log warning 並 fall through 到 B/C/D/E，不會直接失敗
 *   - B/C/D/E 都找不到 → 回傳 reason: "not_found"，由 caller 走 create / re-bind
 *
 * 安全規則：
 *   - 嚴格 store-scoped（storeId 必符）
 *   - C/D/E 僅在 candidates.length === 1 才綁
 *   - 若目標已有 userId 且非當前 user → conflict_already_linked，不綁
 *   - 每一步皆 log，含 reason 便於後台排查
 */

export type ResolveReason =
  | "found_by_id"
  | "found_by_identity_link"
  | "found_by_userid"
  | "bound_by_line_user_id"
  | "bound_by_email"
  | "bound_by_phone"
  | "not_found"
  | "conflict_multiple_email"
  | "conflict_multiple_phone"
  | "conflict_already_linked_line_user_id"
  | "conflict_already_linked_email"
  | "conflict_already_linked_phone";

export interface ResolvedCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  birthday: Date | null;
  gender: string | null;
  storeId: string;
  userId: string | null;
  lineUserId: string | null;
}

export interface ResolveOpts {
  userId: string;
  sessionCustomerId: string | null;
  sessionEmail: string | null;
  storeId: string | null;
  storeSlug?: string | null;
  provider?: string | null;
  /** submit 時由表單帶入的 email（優先於 session email 比對） */
  payloadEmail?: string | null;
  /** submit 時由表單帶入的 phone（session 無 phone；僅 submit 路徑會有） */
  payloadPhone?: string | null;
}

export interface ResolveResult {
  customer: ResolvedCustomer | null;
  reason: ResolveReason;
  conflict?: boolean;
  /**
   * 救援訊號：true 表示 session.sessionCustomerId 雖然存在但對應 DB row 已不存在。
   * resolver 已自動 fall through 到後續路徑（B/C/D）。
   * caller 看到此 flag 應：
   *   - 永遠不可 throw / 直接失敗（已被自動處理）
   *   - 若 reason 為 not_found，必須走 create / re-bind 流程，不可中止
   *   - 寫日誌 + 後續 useSession().update() 把 stale customerId 從 JWT 清掉
   */
  staleSessionCleared?: boolean;
}

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  birthday: true,
  gender: true,
  storeId: true,
  userId: true,
  lineUserId: true,
} as const;

async function getLineProviderAccountId(userId: string): Promise<string | null> {
  const lineAcct = await prisma.account.findFirst({
    where: { userId, provider: "line" },
    select: { providerAccountId: true },
  });
  return lineAcct?.providerAccountId ?? null;
}

async function bindLoginIdentityToCustomer(opts: {
  customer: ResolvedCustomer;
  userId: string;
  storeId: string;
  lineUserId: string | null;
}): Promise<ResolvedCustomer> {
  const lineData =
    opts.lineUserId && !opts.customer.lineUserId
      ? {
          authSource: "LINE" as const,
          lineUserId: opts.lineUserId,
          lineLinkStatus: "LINKED" as const,
          lineLinkedAt: new Date(),
        }
      : {};

  const updated = await prisma.customer.update({
    where: { id: opts.customer.id },
    data: {
      userId: opts.userId,
      ...lineData,
    },
    select: CUSTOMER_SELECT,
  });

  if (opts.lineUserId) {
    await upsertCustomerIdentityLink({
      userId: opts.userId,
      storeId: opts.storeId,
      customerId: opts.customer.id,
      provider: "line",
      providerAccountId: opts.lineUserId,
      lineUserId: opts.lineUserId,
    });
  }

  return updated;
}

/**
 * 底層 resolver — 不做 completion 判斷，純粹找出「這個 session 對應到哪筆 customer」。
 */
export async function resolveCustomerForUser(
  opts: ResolveOpts,
): Promise<ResolveResult> {
  // 防呆 normalize — caller 即使忘了 normalize，所有 phone match / rebind 雙因子比對
  // 都拿這個 normalized 值跟 DB 的 09xxxxxxxx 比，不會因格式差異漏比中
  const normalizedPayloadPhone = opts.payloadPhone
    ? normalizePhone(opts.payloadPhone)
    : null;

  const logCtx = {
    userId: opts.userId,
    storeId: opts.storeId,
    storeSlug: opts.storeSlug ?? null,
    provider: opts.provider ?? null,
    hasSessionCustomerId: !!opts.sessionCustomerId,
    hasSessionEmail: !!opts.sessionEmail,
    hasPayloadEmail: !!opts.payloadEmail,
    hasPayloadPhone: !!opts.payloadPhone,
  };

  // ── A. 直接用 session.customerId ─────────────────────
  // 救援機制：sessionCustomerId 可能是 stale JWT（顧客資料被刪、跨環境 session、
  // 清庫後 cookie 殘留）。
  //   - 驗 DB；若 row 存在 → 回傳
  //   - 若 row 不存在 → 視為「session 已 stale，已自動清除」，
  //     設 staleSessionCleared=true 標記，繼續走 B/C/D；
  //     全 miss 則回 not_found（caller 必須走 create / re-bind，永不 throw）
  let staleSessionCleared = false;
  if (opts.sessionCustomerId) {
    try {
      const c = await prisma.customer.findUnique({
        where: { id: opts.sessionCustomerId },
        select: CUSTOMER_SELECT,
      });
      if (c) {
        // 額外驗 userId 仍綁在當前 user。merge 後 placeholder 仍會留在 DB（FK 擋住 delete），
        // 它的 userId 已被清成 null，但 phone 仍是 `_oauth_xxx`；JWT customerId 來不及刷新時
        // 會命中這筆 placeholder → completion gate 判定 phone 缺漏 → 死循環跳回 /profile。
        // 這裡視 userId 不符為 stale，fall through 到 path B (Customer.userId = opts.userId)
        // 找出真正綁定的 row。
        const storeMatches = !opts.storeId || c.storeId === opts.storeId;
        if (c.userId === opts.userId && storeMatches) {
          console.info("[resolveCustomer] found_by_id", {
            ...logCtx,
            customerId: c.id,
            customerStoreId: c.storeId,
          });
          return { customer: c, reason: "found_by_id" };
        }
        staleSessionCleared = true;
        console.warn(
          "[resolveCustomer] sessionCustomerId points to row whose userId/storeId no longer matches; falling through",
          {
            ...logCtx,
            staleCustomerId: c.id,
            rowUserId: c.userId,
            rowStoreId: c.storeId,
            expectedUserId: opts.userId,
            expectedStoreId: opts.storeId,
          },
        );
      } else {
        // ★ stale：sessionCustomerId 指向不存在的 row → 標記 + fall through
        staleSessionCleared = true;
        console.warn(
          "[resolveCustomer] sessionCustomerId STALE — auto-cleared, falling through to userId/email/phone resolver",
          { ...logCtx, staleCustomerId: opts.sessionCustomerId },
        );
      }
    } catch (err) {
      // 連查詢都炸 → 同樣視為 stale，繼續救援
      staleSessionCleared = true;
      console.error("[resolveCustomer] lookup by id failed (treating as stale, fallthrough)", {
        ...logCtx,
        staleCustomerId: opts.sessionCustomerId,
        err,
      });
    }
  }

  // ── B. CustomerIdentityLink（store-scoped identity truth） ─────────────
  if (opts.storeId) {
    try {
      const lineUserId = await getLineProviderAccountId(opts.userId);
      if (lineUserId) {
        const link = await prisma.customerIdentityLink.findUnique({
          where: {
            uq_customer_identity_provider_store: {
              provider: "line",
              providerAccountId: lineUserId,
              storeId: opts.storeId,
            },
          },
          select: { customer: { select: CUSTOMER_SELECT } },
        });
        if (link?.customer) {
          console.info("[resolveCustomer] found_by_identity_link (provider)", {
            ...logCtx,
            customerId: link.customer.id,
          });
          return { customer: link.customer, reason: "found_by_identity_link" };
        }
      }

      const link = await prisma.customerIdentityLink.findFirst({
        where: { userId: opts.userId, storeId: opts.storeId },
        select: { customer: { select: CUSTOMER_SELECT } },
      });
      if (link?.customer) {
        console.info("[resolveCustomer] found_by_identity_link (user-store)", {
          ...logCtx,
          customerId: link.customer.id,
        });
        return { customer: link.customer, reason: "found_by_identity_link" };
      }
    } catch (err) {
      console.error("[resolveCustomer] identity link lookup failed", { ...logCtx, err });
    }
  }

  // ── C. Customer.userId = session.userId（legacy） ─────────────
  // PR-1 多店身份模型後，Customer.userId 保留 legacy，但有 store context 時不可
  // 再跨店接受，否則同一 LINE User 進 /s/hsinchu 會被帶回 /s/zhubei 的 Customer。
  try {
    const c = await prisma.customer.findFirst({
      where: opts.storeId
        ? { userId: opts.userId, storeId: opts.storeId }
        : { userId: opts.userId },
      select: CUSTOMER_SELECT,
    });
    if (c) {
      console.info("[resolveCustomer] found_by_userid", {
        ...logCtx,
        customerId: c.id,
      });
      return { customer: c, reason: "found_by_userid" };
    }
  } catch (err) {
    console.error("[resolveCustomer] lookup by userId failed", { ...logCtx, err });
  }

  // ── D. 同店 (lineUserId) 唯一匹配 ───────────────────
  // LINE OAuth 顧客的 session.email 常常是 null，B path 又只在 Customer.userId
  // 已被回填時才能命中。先用 lineUserId 救一輪，避免 LINE 重綁 / 手動 merge 後
  // userId 為 null 時被誤判 not_found 重新跳「補資料」。
  if (opts.storeId) {
    try {
      const lineUserId = await getLineProviderAccountId(opts.userId);
      if (lineUserId) {
        const c = await prisma.customer.findFirst({
          where: { storeId: opts.storeId, lineUserId },
          select: CUSTOMER_SELECT,
        });
        if (c) {
          if (c.userId === opts.userId) {
            console.info("[resolveCustomer] bound_by_line_user_id (already)", {
              ...logCtx,
              customerId: c.id,
            });
            return { customer: c, reason: "bound_by_line_user_id" };
          }
          if (!c.userId) {
            // 安全直綁：lineUserId 是 OAuth 簽出的不可偽造身份，
            // userId 為 null 表示 staff 建好顧客後第一次 LINE 登入回流。
            const updated = await bindLoginIdentityToCustomer({
              customer: c,
              userId: opts.userId,
              storeId: opts.storeId,
              lineUserId,
            });
            console.info("[resolveCustomer] bound_by_line_user_id", {
              ...logCtx,
              customerId: c.id,
            });
            return {
              customer: updated,
              reason: "bound_by_line_user_id",
            };
          }
          // c.userId 已綁到別人 — 不能搶 LINE 身份，回 conflict
          console.warn("[resolveCustomer] conflict_already_linked_line_user_id", {
            ...logCtx,
            customerId: c.id,
            existingUserId: c.userId,
          });
          return {
            customer: null,
            reason: "conflict_already_linked_line_user_id",
            conflict: true,
          };
        }
      }
    } catch (err) {
      console.error("[resolveCustomer] lineUserId lookup failed", { ...logCtx, err });
    }
  }

  // ── E. 同店 email 唯一匹配 ───────────────────────────
  const emailForLookup = opts.payloadEmail ?? opts.sessionEmail;
  if (emailForLookup && opts.storeId) {
    try {
      const candidates = await prisma.customer.findMany({
        where: { email: emailForLookup, storeId: opts.storeId },
        select: CUSTOMER_SELECT,
        take: 2,
      });
      if (candidates.length > 1) {
        console.warn("[resolveCustomer] conflict_multiple_email", {
          ...logCtx,
          email: emailForLookup,
          count: candidates.length,
        });
        // 繼續嘗試 phone
      } else if (candidates.length === 1) {
        const c = candidates[0];
        if (c.userId === opts.userId) {
          // 已綁定同一 user，直接返回
          console.info("[resolveCustomer] bound_by_email (already)", {
            ...logCtx,
            customerId: c.id,
          });
          return { customer: c, reason: "bound_by_email" };
        }
        if (c.userId && c.userId !== opts.userId) {
          // 有人綁過：需要雙因子（email + phone 皆對）才允許 rebind，防止帳號劫持
          const phoneMatches =
            !!normalizedPayloadPhone && c.phone === normalizedPayloadPhone;
          if (phoneMatches) {
            console.warn("[resolveCustomer] rebind_by_email (phone matched)", {
              ...logCtx,
              customerId: c.id,
              previousUserId: c.userId,
            });
            const lineUserId = await getLineProviderAccountId(opts.userId);
            const updated = await bindLoginIdentityToCustomer({
              customer: c,
              userId: opts.userId,
              storeId: opts.storeId,
              lineUserId,
            });
            return {
              customer: updated,
              reason: "bound_by_email",
            };
          }
          console.warn("[resolveCustomer] conflict_already_linked_email", {
            ...logCtx,
            customerId: c.id,
            existingUserId: c.userId,
            phoneProvided: !!opts.payloadPhone,
          });
          return {
            customer: null,
            reason: "conflict_already_linked_email",
            conflict: true,
          };
        }
        // c.userId 為 null → 安全直綁
        const lineUserId = await getLineProviderAccountId(opts.userId);
        if (lineUserId && c.lineUserId && c.lineUserId !== lineUserId) {
          return {
            customer: null,
            reason: "conflict_already_linked_line_user_id",
            conflict: true,
          };
        }
        const updated = await bindLoginIdentityToCustomer({
          customer: c,
          userId: opts.userId,
          storeId: opts.storeId,
          lineUserId,
        });
        console.info("[resolveCustomer] bound_by_email", {
          ...logCtx,
          customerId: c.id,
          email: emailForLookup,
        });
        return { customer: updated, reason: "bound_by_email" };
      }
    } catch (err) {
      console.error("[resolveCustomer] email lookup failed", { ...logCtx, err });
    }
  }

  // ── F. 同店 phone 唯一匹配（僅 submit 路徑有 payloadPhone） ──
  if (normalizedPayloadPhone && opts.storeId) {
    try {
      const candidates = await prisma.customer.findMany({
        where: { phone: normalizedPayloadPhone, storeId: opts.storeId },
        select: CUSTOMER_SELECT,
        take: 2,
      });
      if (candidates.length > 1) {
        console.warn("[resolveCustomer] conflict_multiple_phone", {
          ...logCtx,
          phone: normalizedPayloadPhone,
          count: candidates.length,
        });
        return {
          customer: null,
          reason: "conflict_multiple_phone",
          conflict: true,
        };
      }
      if (candidates.length === 1) {
        const c = candidates[0];
        if (c.userId === opts.userId) {
          console.info("[resolveCustomer] bound_by_phone (already)", {
            ...logCtx,
            customerId: c.id,
          });
          return { customer: c, reason: "bound_by_phone" };
        }
        if (c.userId && c.userId !== opts.userId) {
          // 雙因子：email + phone 皆對才允許 rebind
          const emailMatches =
            !!(opts.payloadEmail ?? opts.sessionEmail) &&
            c.email === (opts.payloadEmail ?? opts.sessionEmail);
          if (emailMatches) {
            console.warn("[resolveCustomer] rebind_by_phone (email matched)", {
              ...logCtx,
              customerId: c.id,
              previousUserId: c.userId,
            });
            const lineUserId = await getLineProviderAccountId(opts.userId);
            const updated = await bindLoginIdentityToCustomer({
              customer: c,
              userId: opts.userId,
              storeId: opts.storeId,
              lineUserId,
            });
            return {
              customer: updated,
              reason: "bound_by_phone",
            };
          }
          console.warn("[resolveCustomer] conflict_already_linked_phone", {
            ...logCtx,
            customerId: c.id,
            existingUserId: c.userId,
          });
          return {
            customer: null,
            reason: "conflict_already_linked_phone",
            conflict: true,
          };
        }
        // c.userId 為 null → 安全直綁
        const lineUserId = await getLineProviderAccountId(opts.userId);
        if (lineUserId && c.lineUserId && c.lineUserId !== lineUserId) {
          return {
            customer: null,
            reason: "conflict_already_linked_line_user_id",
            conflict: true,
          };
        }
        const updated = await bindLoginIdentityToCustomer({
          customer: c,
          userId: opts.userId,
          storeId: opts.storeId,
          lineUserId,
        });
        console.info("[resolveCustomer] bound_by_phone", {
          ...logCtx,
          customerId: c.id,
        });
        return { customer: updated, reason: "bound_by_phone" };
      }
    } catch (err) {
      console.error("[resolveCustomer] phone lookup failed", { ...logCtx, err });
    }
  }

  // 全部找不到 — 帶上 staleSessionCleared 訊號讓 caller 知道：
  //   * 若為 true：原 sessionCustomerId 是 stale，已自動 fall through，
  //                caller 必須走 create，永不可 throw / 失敗
  //   * 若為 false：純粹新使用者沒既有 customer，caller 同樣走 create
  console.info("[resolveCustomer] not_found", { ...logCtx, staleSessionCleared });
  return { customer: null, reason: "not_found", staleSessionCleared };
}

/**
 * 上層 API — 在 resolve 結果上加上 completion 判斷。
 * 供 layout gate / profile page render 使用。
 */
export interface CompletionStatus {
  customerExists: boolean;
  isComplete: boolean;
  missingFields: RequiredCustomerField[];
  needsBinding: boolean;
  customerId: string | null;
  reason: ResolveReason;
}

export async function resolveCustomerCompletionStatus(
  opts: Omit<ResolveOpts, "payloadEmail" | "payloadPhone">,
): Promise<CompletionStatus> {
  const r = await resolveCustomerForUser(opts);
  if (!r.customer) {
    return {
      customerExists: false,
      isComplete: false,
      missingFields: [...REQUIRED_CUSTOMER_FIELDS],
      needsBinding: true,
      customerId: null,
      reason: r.reason,
    };
  }
  const missing = missingRequiredFields(r.customer);
  return {
    customerExists: true,
    isComplete: missing.length === 0,
    missingFields: missing,
    needsBinding: false,
    customerId: r.customer.id,
    reason: r.reason,
  };
}
