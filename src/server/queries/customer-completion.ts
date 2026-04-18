import { prisma } from "@/lib/db";
import {
  REQUIRED_CUSTOMER_FIELDS,
  missingRequiredFields,
  type RequiredCustomerField,
} from "@/lib/customer-completion";

/**
 * 前台顧客「目前 session 對應到哪一筆 customer」的唯一 resolver
 *
 * render（profile page）與 submit（updateProfileAction）都必須走這裡，
 * 不得各自用不同 key 查 customer，避免「顯示看得到、儲存找不到」。
 *
 * 查找順序（嚴格同店；任一命中即回）：
 *   A. session.customerId 直查
 *   B. Customer.userId = session.userId（auto-bind 已完成但 JWT 尚未刷新）
 *   C. 同店 email 唯一匹配（來源：session.email 或 payload.email）
 *   D. 同店 phone 唯一匹配（僅 payload.phone；session 無 phone）
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
      console.warn("[resolveCustomer] sessionCustomerId set but record missing", logCtx);
    } catch (err) {
      console.error("[resolveCustomer] lookup by id failed", { ...logCtx, err });
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
        if (c.userId && c.userId !== opts.userId) {
          console.warn("[resolveCustomer] conflict_already_linked_email", {
            ...logCtx,
            customerId: c.id,
            existingUserId: c.userId,
          });
          return {
            customer: null,
            reason: "conflict_already_linked_email",
            conflict: true,
          };
        }
        if (!c.userId) {
          await prisma.customer.update({
            where: { id: c.id },
            data: { userId: opts.userId },
          });
        }
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
  if (opts.payloadPhone && opts.storeId) {
    try {
      const candidates = await prisma.customer.findMany({
        where: { phone: opts.payloadPhone, storeId: opts.storeId },
        select: CUSTOMER_SELECT,
        take: 2,
      });
      if (candidates.length > 1) {
        console.warn("[resolveCustomer] conflict_multiple_phone", {
          ...logCtx,
          phone: opts.payloadPhone,
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
        if (c.userId && c.userId !== opts.userId) {
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
        if (!c.userId) {
          await prisma.customer.update({
            where: { id: c.id },
            data: { userId: opts.userId },
          });
        }
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

  // 全部找不到
  console.info("[resolveCustomer] not_found", logCtx);
  return { customer: null, reason: "not_found" };
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
