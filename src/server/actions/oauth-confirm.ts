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
  // 寫入完成、需要 RELOGIN 取得 NextAuth session
  | { status: "NEW_USER"; action: "RELOGIN"; customerId: string }
  | { status: "BOUND_EXISTING"; action: "RELOGIN"; customerId: string }
  // 已啟用顧客必須先過密碼閘
  | { status: "NEED_LOGIN"; phone: string; customerId: string }
  // 占位符 + 已預載資產（wallet/booking/transactions/points）→ 不可 silent claim
  | { status: "BLOCKED_NEEDS_STAFF"; customerId: string };

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
    return { status: "BOUND_EXISTING", action: "RELOGIN", customerId: byLine.id };
  }

  // ── Step 1：用 phone + storeId 查既有 Customer ──
  // 一次撈完啟用判斷與資產數量，避免多次 round-trip。
  const byPhone = await prisma.customer.findFirst({
    where: { storeId: session.storeId, phone },
    select: {
      id: true,
      userId: true,
      lineUserId: true,
      totalPoints: true,
      user: { select: { passwordHash: true } },
      _count: {
        select: { planWallets: true, bookings: true, transactions: true },
      },
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

    // 🟠 占位符 + 有資產（wallet/booking/transactions/points）→ BLOCKED_NEEDS_STAFF
    // 防誤 claim：若店長已預載課程方案 / 預約 / 點數，可能正等本人來認領，
    // 此時不可被「猜中 phone 的陌生人」綁走。導向店家協助流程而非 silent bind。
    const hasAssets =
      byPhone.totalPoints > 0 ||
      byPhone._count.planWallets > 0 ||
      byPhone._count.bookings > 0 ||
      byPhone._count.transactions > 0;
    if (hasAssets) {
      return { status: "BLOCKED_NEEDS_STAFF", customerId: byPhone.id };
    }

    // 🟡 占位符 + 無資產 → 可直接綁
    // 純占位符 Customer（純 phone + 姓名占位，沒任何業務資料），讓 LINE 認領是
    // 安全的：攻擊者就算猜中 phone，claim 到的 Customer 也沒任何資產可拿。
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
    return { status: "BOUND_EXISTING", action: "RELOGIN", customerId: byPhone.id };
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
    return { status: "NEW_USER", action: "RELOGIN", customerId: created.id };
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
