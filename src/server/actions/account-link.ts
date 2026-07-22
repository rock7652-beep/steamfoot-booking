"use server";

import { cookies } from "next/headers";
import {
  ACCOUNT_LINK_COOKIE,
  ACCOUNT_LINK_TTL_SECONDS,
  issueAccountLinkHandshake,
  type LinkableOAuthProvider,
} from "@/lib/account-link-handshake";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function beginOAuthAccountLinkAction(
  provider: LinkableOAuthProvider,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (provider !== "google" && provider !== "line") {
    return { ok: false, message: "不支援的登入方式" };
  }

  const session = await requireSession();
  if (session.role !== "CUSTOMER") {
    return { ok: false, message: "只有顧客會員可以補綁登入方式" };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { role: true, status: true },
  });
  if (!user || user.role !== "CUSTOMER" || user.status !== "ACTIVE") {
    return { ok: false, message: "目前帳號無法補綁，請聯絡門市協助" };
  }

  const token = await issueAccountLinkHandshake({
    userId: session.id,
    provider,
  });
  const cookieStore = await cookies();
  cookieStore.set(ACCOUNT_LINK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCOUNT_LINK_TTL_SECONDS,
  });
  return { ok: true };
}
