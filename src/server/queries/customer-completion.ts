import { prisma } from "@/lib/db";
import {
  REQUIRED_CUSTOMER_FIELDS,
  missingRequiredFields,
  type RequiredCustomerField,
} from "@/lib/customer-completion";

/**
 * 前台顧客完成註冊 / 綁定狀態解析
 *
 * 執行順序：
 *   1. 若 session 已帶 customerId → 直接查（快速路徑）
 *   2. 若沒有，於「同店內」以 email 唯一匹配做 auto-bind
 *      （僅當候選唯一 & 對方尚未綁定其他 User 時才自動綁）
 *   3. 還是找不到 → customer_not_found，需進 profile 補資料
 *
 * 嚴格規則：
 *   - 跨店絕不自動綁
 *   - 多筆候選絕不自動綁
 *   - 已有 userId 絕不自動綁
 *   - 所有 log 含 storeId / userId / reason 供後台排查
 */
export interface CompletionStatus {
  customerExists: boolean;
  isComplete: boolean;
  missingFields: RequiredCustomerField[];
  needsBinding: boolean;
  customerId: string | null;
  /** 本次解析的最終 reason（見 log 常數） */
  reason: CompletionReason;
}

export type CompletionReason =
  | "customer_complete_ok"
  | "customer_incomplete"
  | "customer_bind_by_email"
  | "customer_bind_conflict_multiple"
  | "customer_bind_conflict_already_linked"
  | "customer_not_found";

export interface ResolveOpts {
  userId: string;
  customerId: string | null;
  email: string | null;
  storeId: string | null;
  storeSlug?: string | null;
  provider?: string | null;
}

export async function resolveCustomerCompletionStatus(
  opts: ResolveOpts,
): Promise<CompletionStatus> {
  const logCtx = {
    userId: opts.userId,
    storeId: opts.storeId,
    storeSlug: opts.storeSlug ?? null,
    provider: opts.provider ?? null,
    hasCustomerId: !!opts.customerId,
    hasEmail: !!opts.email,
  };

  // Step 1: Direct lookup by session customerId
  if (opts.customerId) {
    try {
      const c = await prisma.customer.findUnique({
        where: { id: opts.customerId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          birthday: true,
          gender: true,
          storeId: true,
          userId: true,
        },
      });
      if (c) {
        if (opts.storeId && c.storeId !== opts.storeId) {
          console.warn("[completion] customer-store mismatch", {
            ...logCtx,
            customerStoreId: c.storeId,
          });
        }
        const missing = missingRequiredFields(c);
        const reason: CompletionReason =
          missing.length === 0 ? "customer_complete_ok" : "customer_incomplete";
        console.info(`[completion] ${reason}`, {
          ...logCtx,
          customerId: c.id,
          missingFields: missing,
        });
        return {
          customerExists: true,
          isComplete: missing.length === 0,
          missingFields: missing,
          needsBinding: false,
          customerId: c.id,
          reason,
        };
      }
      console.warn("[completion] customerId set but record missing", logCtx);
    } catch (err) {
      console.error("[completion] lookup by id failed", { ...logCtx, err });
    }
  }

  // Step 2: Auto-bind by email in same store
  if (opts.email && opts.storeId && opts.userId) {
    try {
      const candidates = await prisma.customer.findMany({
        where: { email: opts.email, storeId: opts.storeId },
        select: {
          id: true,
          userId: true,
          name: true,
          phone: true,
          email: true,
          birthday: true,
          gender: true,
        },
        take: 2, // 只要知道是否唯一
      });

      if (candidates.length > 1) {
        console.warn("[completion] customer_bind_conflict_multiple", {
          ...logCtx,
          count: candidates.length,
        });
        // 不自動綁，繼續下一步
      } else if (candidates.length === 1) {
        const c = candidates[0];
        if (c.userId && c.userId !== opts.userId) {
          console.warn("[completion] customer_bind_conflict_already_linked", {
            ...logCtx,
            customerId: c.id,
            existingUserId: c.userId,
          });
        } else {
          // 安全可綁：c.userId 為 null 或已經等於 opts.userId
          if (!c.userId) {
            await prisma.customer.update({
              where: { id: c.id },
              data: { userId: opts.userId },
            });
            console.info("[completion] customer_bind_by_email", {
              ...logCtx,
              customerId: c.id,
            });
          }
          const missing = missingRequiredFields(c);
          return {
            customerExists: true,
            isComplete: missing.length === 0,
            missingFields: missing,
            needsBinding: false,
            customerId: c.id,
            reason: "customer_bind_by_email",
          };
        }
      }
    } catch (err) {
      console.error("[completion] auto-bind by email failed", {
        ...logCtx,
        err,
      });
    }
  }

  // Step 3: Not found — user must complete profile to create / be assisted
  console.info("[completion] customer_not_found", logCtx);
  return {
    customerExists: false,
    isComplete: false,
    missingFields: [...REQUIRED_CUSTOMER_FIELDS],
    needsBinding: true,
    customerId: null,
    reason: "customer_not_found",
  };
}
