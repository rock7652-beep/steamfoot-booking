"use server";

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { normalizePhone } from "@/lib/normalize";
import {
  getOAuthTempSession,
  clearOAuthTempSession,
} from "@/lib/oauth-temp-session";

/**
 * resolveLineLogin — PR-2 step 3b
 *
 * /oauth-confirm 表單提交後的核心 server action。從 OAuth temp session 拿 lineUserId，
 * 與使用者輸入的 phone 一起決定身份狀態。Server 不做 redirect，全部回傳
 * discriminated union 由 client 處理（避免 redirect 地獄）。
 *
 * 設計依據：docs/identity-flow.md §3
 */

const PHONE_RE = /^09\d{8}$/;

export type ResolveLineLoginResult =
  | { status: "NEW_USER"; customerId: string }
  | { status: "BOUND_EXISTING"; customerId: string }
  | { status: "NEED_LOGIN"; phone: string; customerId: string };

export type ResolveLineLoginError = {
  error: "session_expired" | "invalid_phone" | "line_already_bound_other";
};

export async function resolveLineLogin(input: {
  phone: string;
}): Promise<ResolveLineLoginResult | ResolveLineLoginError> {
  // ── Validate phone ──
  const phone = normalizePhone(input.phone ?? "");
  if (!PHONE_RE.test(phone)) {
    return { error: "invalid_phone" };
  }

  // ── Read & verify temp session ──
  const session = await getOAuthTempSession();
  if (!session) {
    return { error: "session_expired" };
  }

  // ── Step 0（防身份轉移）：lineUserId 必須在最前面查 ──
  // 避免「A 已綁 LINE → 又走 oauth-confirm → 輸入 B 的手機 → LINE 從 A 跳到 B」
  // 的身份轉移攻擊（比分裂更慘）。詳見 docs/identity-flow.md §3 Step 0。
  const byLine = await prisma.customer.findFirst({
    where: { storeId: session.storeId, lineUserId: session.lineUserId },
    select: { id: true },
  });
  if (byLine) {
    await clearOAuthTempSession();
    return { status: "BOUND_EXISTING", customerId: byLine.id };
  }

  // ── Step 1：用 phone + storeId 查既有 Customer ──
  const byPhone = await prisma.customer.findFirst({
    where: { storeId: session.storeId, phone },
    select: {
      id: true,
      userId: true,
      lineUserId: true,
      user: { select: { passwordHash: true } },
    },
  });

  if (byPhone) {
    // 防呆：此 phone Customer 已綁「不同的」LINE 帳號 → 拒絕
    // （Step 0 已處理同 lineUserId 的情況，這裡只會撞到不同的 lineUserId）
    if (byPhone.lineUserId && byPhone.lineUserId !== session.lineUserId) {
      return { error: "line_already_bound_other" };
    }

    // 判斷「已啟用」：有 passwordHash 或有任何 OAuth Account
    const hasPassword = !!byPhone.user?.passwordHash;
    const hasOAuth = byPhone.userId
      ? (await prisma.account.count({ where: { userId: byPhone.userId } })) > 0
      : false;
    const isActivated = hasPassword || hasOAuth;

    if (isActivated) {
      // 🔴 NEED_LOGIN — 不動 DB，保留 temp session 等 finalize 階段使用。
      // 「找到 phone ≠ 找到本人」: 已啟用顧客必須過密碼這道閘。
      return { status: "NEED_LOGIN", phone, customerId: byPhone.id };
    }

    // 🟡 未啟用（占位符 / 後台手建）→ 直接綁
    // 安全性說明：占位符 Customer 沒有 password 也沒有 OAuth，無人擁有；
    // 攻擊者需精確猜中此 phone 才能 claim，且其 LINE 帳號可被稽核。
    // 已知接受風險：若占位符已預載 wallet / 點數，被認領後即歸屬該人；
    // 風險可由「店長建檔時 phone 必填且核對」緩解。
    await prisma.customer.update({
      where: { id: byPhone.id },
      data: {
        lineUserId: session.lineUserId,
        lineLinkStatus: "LINKED",
        lineLinkedAt: new Date(),
        lineName: session.displayName,
        // 占位符 authSource 通常是 MANUAL/EMAIL；bind 後升級為 LINE 才反映真實
        authSource: "LINE",
      },
    });
    await clearOAuthTempSession();
    return { status: "BOUND_EXISTING", customerId: byPhone.id };
  }

  // ── Step 2：找不到 phone → 建新 Customer（NEW_USER） ──
  // userId 留空 — 後續 client redirect 到 LINE OAuth 重來，auth.ts 會走
  // 「Customer 存在但無 User」分支建 User 並 link。
  try {
    const created = await prisma.customer.create({
      data: {
        name: session.displayName,
        phone,
        storeId: session.storeId,
        authSource: "LINE",
        lineUserId: session.lineUserId,
        lineLinkStatus: "LINKED",
        lineLinkedAt: new Date(),
        lineName: session.displayName,
        customerStage: "LEAD",
      },
      select: { id: true },
    });
    await clearOAuthTempSession();
    return { status: "NEW_USER", customerId: created.id };
  } catch (err) {
    // 競態（多 tab / 雙擊）：另一個請求剛搶先建出同 phone 或同 lineUserId
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // 遞迴一次：Step 0 / Step 1 重新走，必命中其中之一
      return resolveLineLogin(input);
    }
    throw err;
  }
}
