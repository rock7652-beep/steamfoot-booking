"use server";

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";
import { normalizePhone } from "@/lib/normalize";
import {
  getOAuthTempSession,
  clearOAuthTempSession,
} from "@/lib/server/oauth-temp-session";
import { syncLineAccountForUser } from "@/server/services/line-account-sync";
import { bindLineToExistingCustomerById } from "@/server/services/bind-line-to-customer";
import { upsertCustomerIdentityLink } from "@/server/services/customer-identity-link";

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
  | { status: "NEED_LOGIN"; phone: string; maskedPhone: string; customerId: string }
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
      return {
        status: "NEED_LOGIN",
        phone,
        maskedPhone: `*******${phone.slice(-3)}`,
        customerId: byPhone.id,
      };
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
    // 同步 NextAuth Account[line]：避免 Customer.lineUserId 已設但 Account 缺失的分裂狀態。
    // byPhone.userId 為 null 時跳過（純佔位 Customer 還沒有 User 可綁）。
    if (byPhone.userId) {
      await syncLineAccountForUser({
        userId: byPhone.userId,
        lineUserId: session.lineUserId,
      });
      await upsertCustomerIdentityLink({
        userId: byPhone.userId,
        storeId: session.storeId,
        customerId: byPhone.id,
        provider: "line",
        providerAccountId: session.lineUserId,
        lineUserId: session.lineUserId,
      });
    }
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

// ============================================================
// oauthConfirmLogin — PR-2 step 4a
// ============================================================
// NEED_LOGIN 路徑的密碼登入。簽進 customer-phone 之後，redirect 到
// /oauth-confirm/finalize（NextAuth signIn 已寫好 JWT cookie，下一個請求 auth()
// 就讀得到 → finalize 頁可以 verify session 後 call finalizeLineBind）。
//
// 為什麼不直接在這裡做 finalize？
//   signIn() 在 server action 內設 cookie，但同一個 request 內 auth() 讀不到剛
//   寫的 cookie（NextAuth 的 JWT 取自 request cookies，不是 response）。所以
//   bind 操作必須在「下一個 request」做 — 也就是 redirect 後的 finalize 頁。

export type OAuthConfirmLoginState = { error: string | null };

export async function oauthConfirmLoginAction(
  _prev: OAuthConfirmLoginState,
  formData: FormData,
): Promise<OAuthConfirmLoginState> {
  const password = (formData.get("password") as string) ?? "";
  const customerId = (formData.get("customerId") as string) ?? "";
  const callbackUrl = (formData.get("callbackUrl") as string) ?? "/";

  // phone 從 temp session 拿（不從 form 帶，避免 client tamper）
  const session = await getOAuthTempSession();
  if (!session) {
    return { error: "登入流程已過期，請重新從 LINE 登入" };
  }

  // 拿 customer 的 phone — 必須 belong to session.storeId
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId: session.storeId },
    select: { phone: true },
  });
  if (!customer) {
    return { error: "顧客資料不存在或跨店錯誤，請重新嘗試" };
  }

  if (!password) {
    return { error: "請輸入密碼" };
  }

  // signIn redirect 到 /oauth-confirm/finalize；finalize 頁負責呼叫 finalizeLineBind
  const finalizePath = `/oauth-confirm/finalize?customerId=${encodeURIComponent(customerId)}&callbackUrl=${encodeURIComponent(callbackUrl)}`;

  try {
    await signIn("customer-phone", {
      phone: customer.phone,
      password,
      storeId: session.storeId,
      redirectTo: finalizePath,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "密碼錯誤，請重新輸入" };
    }
    // Next.js redirect 會 throw 一個 NEXT_REDIRECT error — 讓它往上傳
    throw e;
  }

  return { error: null };
}

// ============================================================
// finalizeLineBind — PR-2 step 4b · PR-G5.2.a wires D3 helper
// ============================================================
// /oauth-confirm/finalize 頁載入後呼叫。NEED_LOGIN 流程在這裡才寫 lineUserId，
// 因為要先確保使用者已通過密碼登入（auth() session 已建立）。
//
// 安全閘：
//   1. 必須有 NextAuth session（auth().user.id 存在）
//   2. 必須有 OAuth temp session（lineUserId 來源；PR-G5.1.c HMAC 簽章驗證）
//   3. session.user 必須是 customerId 的擁有者（防 URL 篡改）
//   4. 同 store 的 lineUserId 不可已綁定其他 Customer（Step 0 防身份轉移）
//   5. 寫入：委派到 D3 helper `bindLineToExistingCustomerById`，原子化
//      Customer.updateMany + Account[line].create（同一 Serializable
//      transaction，all-or-nothing） — 取代 PR-G5.2.a 前「customer.update
//      + post-tx syncLineAccountForUser」非原子流程
//   6. 寫完強制 clearOAuthTempSession 防 nonce reuse
//
// 為什麼接 D3？
//   PR-G5.2.a 前，本函式分兩步：先 customer.update 寫 LINE 欄位，再 post-tx
//   呼叫 syncLineAccountForUser 補 Account[line]。若 Account create 失敗，
//   Customer.lineUserId 已 commit、Account 缺失 → "missing-account" 分裂
//   狀態（正是 PR-F1.2 audit / PR-F2 repair 在收拾的歷史殘屑）。
//
//   D3 (`bindLineToExistingCustomerById`, PR-G5.1.a #242) 把兩件事收進
//   單一 Serializable transaction：updateMany (CAS predicate) +
//   account.create，任一失敗整組 rollback。本 PR 是純 wiring：D3 已上
//   main 但無 caller、是 dead code，這支接上後 finalize 流程正式 atomic。

export type FinalizeLineBindResult =
  | { status: "BOUND"; action: "RELOGIN" | "COMPLETE"; callbackUrl: string }
  | {
      error:
        | "session_expired"
        | "auth_required"
        | "customer_mismatch"
        | "line_already_bound_other"
        // PR-G5.2.a 新增：D3 helper 回報的可重試 / 撞 unique constraint
        // 競態狀況（在原本「post-tx best-effort」流程中會被吞掉成靜默錯
        // 誤，現在 D3 把它們具名化）。
        | "bind_conflict"
        | "write_conflict";
    };

export async function finalizeLineBind(input: {
  customerId: string;
  callbackUrl: string;
}): Promise<FinalizeLineBindResult> {
  // ── 1. NextAuth session ──
  const nextAuthSession = await auth();
  if (!nextAuthSession?.user?.id) {
    return { error: "auth_required" };
  }

  // ── 2. OAuth temp session ──
  const tempSession = await getOAuthTempSession();
  if (!tempSession) {
    return { error: "session_expired" };
  }

  // ── 3. 防 URL 篡改：customerId 必須屬於當前 user，且同 store ──
  const customer = await prisma.customer.findFirst({
    where: {
      id: input.customerId,
      storeId: tempSession.storeId,
      userId: nextAuthSession.user.id,
    },
    select: { id: true, lineUserId: true },
  });
  if (!customer) {
    return { error: "customer_mismatch" };
  }

  // ── 4. Step 0 防身份轉移：lineUserId 不可已綁其他 Customer ──
  // 在這個 request 路徑罕見（resolveLineLogin Step 0 已過濾），但 finalize 是
  // 寫入點，必須再驗一次。D3 helper 內部還有 customer_locked / unique_conflict
  // 第二道防線，本檢查的價值是回更明確、更快的錯誤訊息。
  if (customer.lineUserId && customer.lineUserId !== tempSession.lineUserId) {
    return { error: "line_already_bound_other" };
  }
  const otherWithSameLine = await prisma.customer.findFirst({
    where: {
      storeId: tempSession.storeId,
      lineUserId: tempSession.lineUserId,
      id: { not: customer.id },
    },
    select: { id: true },
  });
  if (otherWithSameLine) {
    return { error: "line_already_bound_other" };
  }

  // ── 5. 委派到 D3 helper — atomic Serializable tx ──
  //    取代原「customer.update + post-tx syncLineAccountForUser」非原子流程。
  //    D3 內含：
  //      - Customer.updateMany (CAS predicate: id + storeId + userId not-null
  //        + lineUserId null-or-matches-input + mergedIntoCustomerId null)
  //      - Account[line].create
  //      - 同一個 Serializable transaction 包起來，任一失敗整組 rollback
  //    authSource 維持原值 — D3 不動 authSource 欄位，本 Customer 原是
  //    EMAIL/PHONE_PASSWORD 註冊、後綁 LINE，derived source helper（PR-1）
  //    會推導真實標籤。
  const bindResult = await bindLineToExistingCustomerById({
    storeId: tempSession.storeId,
    customerId: customer.id,
    lineUserId: tempSession.lineUserId,
    lineName: tempSession.displayName,
  });

  switch (bindResult.status) {
    case "bound_existing":
    case "already_synced":
    case "account_repaired":
    case "customer_repaired":
      // 成功路徑（四種子狀態都是成功）：
      //   - bound_existing：第一次寫入 Customer.lineUserId + Account[line]
      //   - already_synced：idempotent 重綁，Customer + Account 都早已正確
      //   - account_repaired：Customer.lineUserId 已正確但 Account[line] 缺失
      //     （pre-G5.x 殘屑），helper 補建 Account；Customer 鏈接 metadata
      //     不動（lineLinkedAt / lineName 保留歷史值）
      //   - customer_repaired：mirror of account_repaired — Account[line]
      //     已存在且 userId 一致，Customer.lineUserId 卻是 null（PR-G5.2.a
      //     Codex P2 round 1 新增）。helper 寫 Customer 鏈接欄位，跳過
      //     Account.create。此 drift 在舊流程靠 customer.update +
      //     syncLineAccountForUser best-effort 修補；G5.2.a 接 D3 後若無
      //     此 branch 會撞 P2002 整個 rollback、drift 無法修復。
      // 都清 temp session 防 nonce reuse，回 RELOGIN signal 讓 client 觸發
      // signIn() 取得帶 LINE 身份的新 NextAuth session。
      await upsertCustomerIdentityLink({
        userId: bindResult.userId,
        storeId: tempSession.storeId,
        customerId: bindResult.customerId,
        provider: "line",
        providerAccountId: tempSession.lineUserId,
        lineUserId: tempSession.lineUserId,
      });
      await clearOAuthTempSession();
      return {
        status: "BOUND",
        action: "RELOGIN",
        callbackUrl: input.callbackUrl,
      };

    case "customer_locked":
      // D3 偵測到衝突（Customer 已綁不同 LINE / Account 指向別的 User）
      // — 對應原 `line_already_bound_other` 語意，保留前端文案行為。
      return { error: "line_already_bound_other" };

    case "store_mismatch":
    case "customer_has_no_user":
      // 防禦性：guard 3 已驗 customer.storeId === tempSession.storeId AND
      // customer.userId === nextAuthSession.user.id，到 D3 內部 re-read
      // 仍對不上的話幾乎只可能是極端並發（user/customer 在這個 request 中
      // 被改動）。映射到既有的 customer_mismatch 錯誤，保留 API 穩定。
      return { error: "customer_mismatch" };

    case "unique_conflict":
      // P2002：D3 tx 內遇到 (storeId, lineUserId) 或 (provider,
      // providerAccountId) 競態衝突。新 error variant — 原本走
      // post-tx best-effort 時這類失敗會被靜默吞掉。
      return { error: "bind_conflict" };

    case "write_conflict":
    case "stale_customer_link":
      // 都是可重試的競態：
      //   - write_conflict：Prisma P2034，DB 偵測到 serialization race
      //   - stale_customer_link：D3 內部 TOCTOU — Customer 鏈接狀態在
      //     preflight 與 tx-write 之間被另一個 binder 改動
      // 對 caller 而言處理相同：重試一次通常會落到 already_synced /
      // account_repaired / customer_locked 其中一條 deterministic 路徑。
      return { error: "write_conflict" };

    default: {
      // TypeScript exhaustiveness check — 若 D3 helper 未來加新 status
      // variant 而本檔忘記 map，tsc 會在這裡報錯（_never 不再是 never 型別）。
      const _never: never = bindResult;
      void _never;
      return { error: "customer_mismatch" };
    }
  }
}
