// src/server/auth/resolve-login-redirect.ts

import type { UserRole } from "@prisma/client";

export type LoginEntryType = "hq" | "store-admin" | "customer";

export type LoginRedirectError =
  | "missing-store"
  | "missing-user-store"
  | "wrong-entry";

export type ResolveLoginRedirectInput = {
  userRole: UserRole;
  entry: LoginEntryType;

  /**
   * 從入口取得的店 slug：
   * - /hq/login?store=zhubei
   * - /s/zhubei/admin/login
   * - /s/zhubei
   */
  targetStoreSlug?: string | null;

  /**
   * 從 DB / session / staff relation 解析出的使用者所屬店 slug
   */
  userStoreSlug?: string | null;
};

export type ResolveLoginRedirectOutput = {
  redirectTo: string;
  clearStoreContext: boolean;
  setStoreSlug: string | null;
  error: LoginRedirectError | null;
};

function cleanSlug(slug?: string | null): string | null {
  const value = slug?.trim();
  return value ? value : null;
}

function storeAdminPath(slug: string) {
  return `/s/${slug}/admin/dashboard`;
}

function customerPath(slug: string) {
  return `/s/${slug}/book`;
}

export function resolveLoginRedirect(
  input: ResolveLoginRedirectInput
): ResolveLoginRedirectOutput {
  const role = input.userRole;
  const targetStoreSlug = cleanSlug(input.targetStoreSlug);
  const userStoreSlug = cleanSlug(input.userStoreSlug);

  /**
   * Phase 1 決策：
   * 目前系統只有 ADMIN / OWNER / PARTNER / CUSTOMER。
   * 先把 ADMIN 視為 HQ 權限。
   * 不在此階段新增 HQ / SUPER_ADMIN。
   */
  const isAdmin = role === "ADMIN";
  const isStoreStaff = role === "OWNER" || role === "PARTNER";
  const isCustomer = role === "CUSTOMER";

  if (input.entry === "hq") {
    if (isAdmin) {
      return {
        redirectTo: "/hq/dashboard",
        clearStoreContext: true,
        setStoreSlug: null,
        error: null,
      };
    }

    /**
     * Phase 1 保留舊行為：
     * OWNER / PARTNER 從 /hq/login 登入，不 reject，
     * 直接導回自己的店後台。
     */
    if (isStoreStaff) {
      if (!userStoreSlug) {
        return {
          redirectTo: "/hq/login?error=missing-store",
          clearStoreContext: false,
          setStoreSlug: null,
          error: "missing-user-store",
        };
      }

      return {
        redirectTo: storeAdminPath(userStoreSlug),
        clearStoreContext: false,
        setStoreSlug: userStoreSlug,
        error: null,
      };
    }

    if (isCustomer) {
      const slug = userStoreSlug ?? targetStoreSlug;

      if (!slug) {
        return {
          redirectTo: "/hq/login?error=wrong-entry",
          clearStoreContext: true,
          setStoreSlug: null,
          error: "wrong-entry",
        };
      }

      return {
        redirectTo: customerPath(slug),
        clearStoreContext: false,
        setStoreSlug: null,
        error: "wrong-entry",
      };
    }
  }

  if (input.entry === "store-admin") {
    if (!targetStoreSlug) {
      return {
        redirectTo: "/hq/login?error=missing-store",
        clearStoreContext: false,
        setStoreSlug: null,
        error: "missing-store",
      };
    }

    if (isAdmin) {
      return {
        redirectTo: storeAdminPath(targetStoreSlug),
        clearStoreContext: false,
        setStoreSlug: targetStoreSlug,
        error: null,
      };
    }

    if (isStoreStaff) {
      const slug = userStoreSlug ?? targetStoreSlug;

      return {
        redirectTo: storeAdminPath(slug),
        clearStoreContext: false,
        setStoreSlug: slug,
        error: null,
      };
    }

    if (isCustomer) {
      return {
        redirectTo: customerPath(targetStoreSlug),
        clearStoreContext: false,
        setStoreSlug: null,
        error: "wrong-entry",
      };
    }
  }

  if (input.entry === "customer") {
    const slug = targetStoreSlug ?? userStoreSlug;

    if (!slug) {
      return {
        redirectTo: "/",
        clearStoreContext: false,
        setStoreSlug: null,
        error: "missing-store",
      };
    }

    if (isCustomer) {
      return {
        redirectTo: customerPath(slug),
        clearStoreContext: false,
        setStoreSlug: null,
        error: null,
      };
    }

    if (isAdmin || isStoreStaff) {
      // Staff 優先用自己的店；沒有就用 guard 後已確定非 null 的 slug。
      const staffSlug: string = userStoreSlug ?? slug;

      return {
        redirectTo: storeAdminPath(staffSlug),
        clearStoreContext: false,
        setStoreSlug: staffSlug,
        error: "wrong-entry",
      };
    }
  }

  return {
    redirectTo: "/hq/login?error=wrong-entry",
    clearStoreContext: true,
    setStoreSlug: null,
    error: "wrong-entry",
  };
}
