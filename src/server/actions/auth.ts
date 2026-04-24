"use server";

import { signIn, signOut } from "@/lib/auth";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";
import { getStoreSlugById } from "@/lib/store-resolver";
import { clearStoreContextCookies } from "@/server/auth/clear-store-context";

// ============================================================
// hqLoginAction — 後台登入（/hq/login）
// ============================================================

export type LoginState = { error: string | null };

export async function hqLoginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  // 從表單取得 store context（由 /hq/login?store=X 傳入）
  const fromStoreSlug = formData.get("storeSlug") as string | null;

  if (!email || !password) {
    return { error: "請輸入 Email 和密碼" };
  }

  // 查 user — 同時決定 redirectTo、提供錯誤訊息辨識
  // 後台登入（/hq/login）細分錯誤，方便 debug；顧客登入保持模糊以防帳號列舉攻擊
  let user: {
    role: "ADMIN" | "OWNER" | "PARTNER" | "CUSTOMER" | string;
    status: string;
    staff: { storeId: string } | null;
    customer: { storeId: string } | null;
  } | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { email },
      select: {
        role: true,
        status: true,
        staff: { select: { storeId: true } },
        customer: { select: { storeId: true } },
      },
    });
  } catch (err) {
    console.error("[hqLoginAction] DB lookup failed", {
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "系統暫時異常，請稍後再試" };
  }

  if (!user) {
    return { error: "此帳號不存在，請確認 Email 是否正確" };
  }

  if (user.status !== "ACTIVE") {
    return { error: "此帳號已停用，請聯絡管理員" };
  }

  // 決定登入後導向
  let redirectTo = "/hq/dashboard";
  try {
    if (user.role === "CUSTOMER") {
      const storeId = user.customer?.storeId;
      const slug = storeId ? await getStoreSlugById(storeId) : null;
      redirectTo = `/s/${slug ?? fromStoreSlug ?? "zhubei"}/book`;
    } else if (user.role === "ADMIN") {
      redirectTo = "/hq/dashboard";
    } else {
      // OWNER / PARTNER → 優先使用 URL 傳入的 storeSlug，否則查 DB
      const storeId = user.staff?.storeId;
      const slug = fromStoreSlug ?? (storeId ? await getStoreSlugById(storeId) : null);
      redirectTo = `/s/${slug ?? "zhubei"}/admin/dashboard`;
    }
  } catch (err) {
    console.warn("[hqLoginAction] resolve redirect failed, using fallback", {
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    // redirectTo 維持預設值
  }

  // 清除殘留 store context 的條件：
  //   - 沒有 ?store= 參數（純 HQ 登入入口）
  //   - 或登入成 ADMIN（ADMIN 不綁 store，任何殘留 store-slug 都會誤導後續）
  // OWNER/PARTNER 透過 ?store=X 進入者不能清，否則登入後 proxy 會因 store-slug
  // 缺失誤判為未知 store；redirect 目標 /s/{slug}/admin/dashboard 會由 proxy
  // 的 storeRewrite 重設 store-slug cookie。
  const shouldClearStoreContext = !fromStoreSlug || user.role === "ADMIN";
  if (shouldClearStoreContext) {
    await clearStoreContextCookies();
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      // user 已確認存在 + ACTIVE → AuthError 代表密碼錯
      return { error: "密碼錯誤，請重新輸入" };
    }
    throw e;
  }

  return { error: null };
}

// ============================================================
// loginAction — 保留相容性（legacy /login redirect 到 /hq/login）
// ============================================================

/** @deprecated 使用 hqLoginAction 代替 */
export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  return hqLoginAction(_prev, formData);
}

// ============================================================
// logoutAction
// ============================================================

export async function logoutAction(formData?: FormData) {
  const storeSlug = formData?.get("storeSlug") as string | null;
  const redirectTo = storeSlug ? `/s/${storeSlug}/` : "/";
  // 清除 store context cookie，避免登出後殘留的 store-slug / active-store-id
  // 污染下一次 HQ 登入流程。signOut() 僅清 NextAuth session cookie。
  await clearStoreContextCookies();
  // signOut() 內部會呼叫 redirect()，Next.js redirect 以 throw 實現。
  // 只 catch 非 redirect error 以加 log；redirect error 必須原樣重拋，
  // 否則登出會卡在 server action 不會跳頁。
  try {
    await signOut({ redirectTo });
  } catch (err) {
    if (isRedirectError(err)) {
      // signOut 成功 → redirect throw。再清一次 store context cookie 作為防呆。
      await clearStoreContextCookies();
      throw err;
    }
    console.error("[logoutAction] signOut failed (non-redirect)", {
      redirectTo,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Next.js 的 redirect() 用 throw 實現；error.digest 以 "NEXT_REDIRECT" 開頭。 */
function isRedirectError(err: unknown): boolean {
  return (
    err instanceof Error &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
