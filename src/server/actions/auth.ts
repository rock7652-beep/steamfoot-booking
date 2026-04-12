"use server";

import { signIn, signOut } from "@/lib/auth";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";

// ============================================================
// loginAction
// ============================================================

export type LoginState = { error: string | null };

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "請輸入 Email 和密碼" };
  }

  // 登入前先查 role，決定登入後導向
  // CUSTOMER → /book，其他角色 → /dashboard
  let redirectTo = "/dashboard";
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { role: true },
    });
    if (user?.role === "CUSTOMER") {
      redirectTo = "/book";
    }
  } catch {
    // DB 查詢失敗時 fallback 到 /dashboard（dashboard layout 會再 redirect）
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
    // Re-throw Next.js redirect error so the browser follows it
    throw e;
  }

  return { error: null };
}

// ============================================================
// logoutAction
// ============================================================

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
