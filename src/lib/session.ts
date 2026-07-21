import { cache } from "react";
import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { isStaffRole } from "@/lib/permissions";
import { resolveCentralMemberCustomerForStore } from "@/server/services/central-member-resolver";

// ============================================================
// Session helpers
// ============================================================

type CustomerSessionUser = {
  id: string;
  role: string;
  customerId: string | null;
  storeId: string | null;
  storeSlug: string | null;
};

/**
 * 解析這次 request 所屬店舖。
 *
 * 顧客可從不同店舖入口登入，因此 URL/proxy 注入的 store slug 優先於
 * JWT 內可能過期的 storeId。若 request context 不可用，再退回 session store。
 */
async function resolveCustomerRequestStore(user: CustomerSessionUser): Promise<{
  storeId: string;
  storeSlug: string | null;
} | null> {
  let requestStoreSlug: string | null = null;
  try {
    const headerList = await headers();
    const cookieStore = await cookies();
    requestStoreSlug =
      headerList.get("x-store-slug") ??
      cookieStore.get("store-slug")?.value ??
      null;
  } catch {
    // 非 request context（例如部分 isolated tests）時，改用 session store。
  }

  if (requestStoreSlug && requestStoreSlug !== "__hq__") {
    try {
      const store = await prisma.store.findUnique({
        where: { slug: requestStoreSlug },
        select: { id: true, slug: true },
      });
      if (store) return { storeId: store.id, storeSlug: store.slug };
    } catch (error) {
      console.error("[getCurrentUser] request store lookup failed", {
        userId: user.id,
        requestStoreSlug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return user.storeId
    ? { storeId: user.storeId, storeSlug: user.storeSlug ?? requestStoreSlug }
    : null;
}

/**
 * 防漏網：JWT 可能在 LINE OAuth 綁定 Customer 前就已簽發，造成 session.customerId
 * 暫時為 null，但 DB 的 Customer / CustomerIdentityLink 已經完成。
 *
 * 所有 server page/action 都會經過 getCurrentUser()，因此在這裡依「目前店舖」
 * 找回 canonical Customer，可一次保護預約、方案、健康評估與個人資料等前台功能，
 * 避免各頁用 `if (!user.customerId) redirect(...)` 形成 redirect loop。
 */
async function recoverMissingCustomerIdentity<T extends CustomerSessionUser>(user: T): Promise<T> {
  if (user.role !== "CUSTOMER" || user.customerId) return user;

  const requestStore = await resolveCustomerRequestStore(user);
  if (!requestStore) return user;

  try {
    const linkedMembership = await resolveCentralMemberCustomerForStore(
      user.id,
      requestStore.storeId,
    );

    const customer =
      (linkedMembership
        ? {
            id: linkedMembership.customerId,
            storeId: linkedMembership.storeId,
            store: { slug: linkedMembership.storeSlug },
          }
        : null) ??
      (await prisma.customer.findFirst({
        where: {
          userId: user.id,
          storeId: requestStore.storeId,
          mergedIntoCustomerId: null,
        },
        select: {
          id: true,
          storeId: true,
          store: { select: { slug: true } },
        },
      }));

    if (!customer) return user;

    console.info("[getCurrentUser] recovered missing customerId", {
      userId: user.id,
      customerId: customer.id,
      storeId: customer.storeId,
      source: linkedMembership ? "identity-link" : "legacy-user-link",
    });

    return {
      ...user,
      customerId: customer.id,
      storeId: customer.storeId,
      storeSlug: customer.store.slug,
    };
  } catch (error) {
    // 身份修復失敗不可讓所有頁面掛掉；保留原 session，交由既有頁面 gate 處理。
    console.error("[getCurrentUser] customer identity recovery failed", {
      userId: user.id,
      storeId: requestStore.storeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return user;
  }
}

/** 取得當前 session user（null = 未登入）— React cache 確保同一 request 只查一次 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user) return null;
  return recoverMissingCustomerIdentity(session.user);
});

/** 取得 session；若未登入拋出 UNAUTHORIZED */
export async function requireSession() {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHORIZED", "請先登入");
  return user;
}

/** 要求任意員工身份（ADMIN / OWNER / PARTNER） */
export async function requireStaffSession() {
  const user = await requireSession();
  if (!isStaffRole(user.role)) {
    // 記下呼叫堆疊，方便將來找出哪個 server action / query 在顧客流程裡誤用了 staff guard。
    // 直接走 console（伺服器端）即可，避免帶入 logger 的循環依賴。
    if (process.env.NODE_ENV !== "production" || process.env.LOG_STAFF_GUARD_LEAK === "1") {
      console.warn("[requireStaffSession] non-staff hit staff guard", {
        role: user.role,
        userId: user.id,
        customerId: user.customerId ?? null,
        stack: new Error("staff-guard-stack").stack?.split("\n").slice(1, 6).join("\n"),
      });
    }
    throw new AppError("FORBIDDEN", "此功能僅限員工使用");
  }
  if (!user.storeId && user.role !== "ADMIN") {
    throw new AppError("UNAUTHORIZED", "缺少店舖資訊，請登出後重新登入");
  }
  return user;
}

/** 要求 Admin 身份 */
export async function requireAdminSession() {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "此功能僅限系統管理者使用");
  }
  return user;
}

/** @deprecated 使用 requireAdminSession() 代替 */
export const requireOwnerSession = requireAdminSession;

/** 取得當前 Staff 記錄（所有員工角色皆有）— React cache 同一 request 只查一次 */
export const getCurrentStaff = cache(async () => {
  const user = await getCurrentUser();
  if (!user?.staffId) return null;
  return prisma.staff.findUnique({
    where: { id: user.staffId },
  });
});

/**
 * 取得當前 Customer 記錄。
 *
 * ⚠ 穩定性提醒：session.user.customerId 可能 stale（JWT 尚未刷新、顧客資料
 * 已被刪除、清庫後殘留 cookie、跨環境 session）。本函式驗 DB；若 stale 會：
 *   - 記 warning（含 staleCustomerId）
 *   - 回傳 null（與「未綁定」同義）
 * 不會 throw、不會用 stale 指向回傳虛假資料。
 *
 * 若 caller 需要進一步走 fallback resolver（用 userId / email / phone 找回），
 * 改呼叫 `resolveCustomerForUser` 而非本函式。
 */
export async function getCurrentCustomer() {
  const user = await getCurrentUser();
  if (!user?.customerId) return null;
  const customer = await prisma.customer.findUnique({
    where: { id: user.customerId },
  });
  if (!customer) {
    console.warn("[getCurrentCustomer] sessionCustomerId STALE — returning null", {
      userId: user.id,
      staleCustomerId: user.customerId,
      sessionStoreId: user.storeId ?? null,
    });
  }
  return customer;
}

/**
 * 驗證 session.user.customerId 是否仍指向真實存在的 Customer row。
 *
 * - 回傳 customerId（合法）：DB 存在
 * - 回傳 null：sessionCustomerId 為 null/空 OR stale（指向不存在的 row）
 *
 * 用法：給「只需要快速判斷有無 customer 上下文」的 page / route handler，
 * 取代裸的 `if (!user.customerId) redirect(...)` 寫法 — 後者在 stale 時
 * 會通過判斷然後查 DB 拿 null，造成 silent 空畫面。
 *
 * 若已經要走完整 resolve（含 userId/email/phone fallback），改用
 * `resolveCustomerForUser`。
 */
export async function resolveValidatedCustomerId(
  user: { id: string; customerId: string | null } | null,
): Promise<string | null> {
  if (!user?.customerId) return null;
  const exists = await prisma.customer.findUnique({
    where: { id: user.customerId },
    select: { id: true },
  });
  if (!exists) {
    console.warn(
      "[resolveValidatedCustomerId] sessionCustomerId STALE — caller should treat as no customer",
      { userId: user.id, staleCustomerId: user.customerId },
    );
    return null;
  }
  return user.customerId;
}
