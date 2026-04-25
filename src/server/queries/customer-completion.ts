import { prisma } from "@/lib/db";
import {
  REQUIRED_CUSTOMER_FIELDS,
  missingRequiredFields,
  type RequiredCustomerField,
} from "@/lib/customer-completion";
import { normalizePhone } from "@/lib/normalize";

/**
 * 前台顧客「目前 session 對應到哪一筆 customer」的唯一 resolver
 *
 * render（profile page）與 submit（updateProfileAction）都必須走這裡，
 * 不得各自用不同 key 查 customer，避免「顯示看得到、儲存找不到」。
 *
 * 查找順序（嚴格同店；任一命中即回）：
 *   A. session.customerId 直查（會驗證 DB 是否存在，stale 則 fall through）
 *   B. Customer.userId = session.userId（auto-bind 已完成但 JWT 尚未刷新）
 *   C. 同店 email 唯一匹配（來源：session.email 或 payload.email）
 *   D. 同店 phone 唯一匹配（僅 payload.phone；session 無 phone）
 *
 * 穩定性保證：
 *   - sessionCustomerId 可能 stale（顧客被刪、清庫後 cookie 殘留、跨環境 JWT），
 *     A 路徑會驗 DB；找不到時 log warning 並 fall through 到 B/C/D，不會直接失敗
 *   - B/C/D 都找不到 → 回傳 reason: "not_found"，由 caller 走 create / re-bind
 *
 * 安全規則：
 *   - 嚴格 store-scoped（storeId 必符）
 *   - C / D 僅在 candidates.length === 1 才綁
 *   - 若目標已有 userId 且非當前 user → conflict_already_linked，不綁
 *   - 每一步皆 log，含 reason 便於後台排查
 */

export type ResolveReason =
  | "found_by_id"
  | "found_by_userid"
  | "bound_by_email"
  | "bound_by_phone"
  | "not_found"
  | "conflict_multiple_email"
  | "conflict_multiple_phone"
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
} as const;

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
        console.info("[resolveCustomer] found_by_id", {
          ...logCtx,
          customerId: c.id,
          customerStoreId: c.storeId,
        });
        return { customer: c, reason: "found_by_id" };
      }
      // ★ stale：sessionCustomerId 指向不存在的 row → 標記 + fall through
      staleSessionCleared = true;
      console.warn(
        "[resolveCustomer] sessionCustomerId STALE — auto-cleared, falling through to userId/email/phone resolver",
        { ...logCtx, staleCustomerId: opts.sessionCustomerId },
      );
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

  // ── B. Customer.userId = session.userId ─────────────
  try {
    const c = await prisma.customer.findFirst({
      where: { userId: opts.userId },
      select: CUSTOMER_SELECT,
    });
    if (c) {
      // 同店 assertion — 若 storeId 不符，不要誤綁（理論上不該發生，因為 userId 是 1:1）
      if (opts.storeId && c.storeId !== opts.storeId) {
        console.warn("[resolveCustomer] userId match but store mismatch", {
          ...logCtx,
          customerId: c.id,
          customerStoreId: c.storeId,
        });
      } else {
        console.info("[resolveCustomer] found_by_userid", {
          ...logCtx,
          customerId: c.id,
        });
        return { customer: c, reason: "found_by_userid" };
      }
    }
  } catch (err) {
    console.error("[resolveCustomer] lookup by userId failed", { ...logCtx, err });
  }

  // ── C. 同店 email 唯一匹配 ───────────────────────────
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
            await prisma.customer.update({
              where: { id: c.id },
              data: { userId: opts.userId },
            });
            return {
              customer: { ...c, userId: opts.userId },
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
        await prisma.customer.update({
          where: { id: c.id },
          data: { userId: opts.userId },
        });
        console.info("[resolveCustomer] bound_by_email", {
          ...logCtx,
          customerId: c.id,
          email: emailForLookup,
        });
        return { customer: { ...c, userId: opts.userId }, reason: "bound_by_email" };
      }
    } catch (err) {
      console.error("[resolveCustomer] email lookup failed", { ...logCtx, err });
    }
  }

  // ── D. 同店 phone 唯一匹配（僅 submit 路徑有 payloadPhone） ──
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
            await prisma.customer.update({
              where: { id: c.id },
              data: { userId: opts.userId },
            });
            return {
              customer: { ...c, userId: opts.userId },
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
        await prisma.customer.update({
          where: { id: c.id },
          data: { userId: opts.userId },
        });
        console.info("[resolveCustomer] bound_by_phone", {
          ...logCtx,
          customerId: c.id,
        });
        return { customer: { ...c, userId: opts.userId }, reason: "bound_by_phone" };
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
