"use server";

import { signIn, signOut } from "@/lib/auth";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";
import { getStoreSlugById } from "@/lib/store-resolver";

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

  // 查 role + storeId，決定登入後導向
  let redirectTo = "/hq/dashboard";
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        role: true,
        staff: { select: { storeId: true } },
        customer: { select: { storeId: true } },
      },
    });
    if (user) {
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
    }
  } catch {
    // DB 查詢失敗時 fallback
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "Email 或密碼錯誤，請重新確認" };
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
  try {
    await signOut({ redirectTo });
  } catch (e) {
    // signOut throws a NEXT_REDIRECT — re-throw it so Next.js handles the redirect
    if (e instanceof Error && e.message?.includes("NEXT_REDIRECT")) {
      throw e;
    }
    console.error("[logout] signOut failed:", e);
    // Fallback: force redirect even if signOut errored
    const { redirect } = await import("next/navigation");
    redirect(redirectTo);
  }
}
