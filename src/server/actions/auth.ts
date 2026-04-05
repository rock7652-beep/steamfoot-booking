"use server";

import { signIn, signOut } from "@/lib/auth";
import { AuthError } from "next-auth";

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

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
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
