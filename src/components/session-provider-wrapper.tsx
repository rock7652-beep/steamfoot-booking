"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Next-auth v5 SessionProvider client wrapper。
 *
 * 套用於 root layout，讓 client components（例如 profile-form）
 * 可使用 useSession().update() 刷新 JWT（profile 補資料完成後使用）。
 */
export function NextAuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
