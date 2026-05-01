import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * syncLineAccountForUser — 把 Customer.lineUserId 與 NextAuth Account[line] 對齊
 *
 * 為什麼需要：
 *   多個路徑會寫 Customer.lineUserId（webhook 綁定碼 / resolveLineLogin /
 *   finalizeLineBind / mergePlaceholderCustomerIntoRealCustomer），原本都假設
 *   「Account 等下次 LINE OAuth 由 auth.ts 補建」。實際上若 user 之前未走過
 *   完整 LINE OAuth（例如只用密碼登入過），Account[line] 永遠不存在；下次 LINE
 *   OAuth 又因 storeId / cookie 等因素 miss 既有 Customer，就會繞道建新 user
 *   造成分裂。本 helper 在每個 bind 寫入點同步補 Account，把資料整齊度推回對的形狀。
 *
 * 行為（idempotent + 安全）：
 *   - Account(provider="line", providerAccountId=lineUserId) 不存在 → create
 *   - 已存在且 userId 相同 → no-op
 *   - 已存在但 userId 不同 → 不覆蓋，log warn，回 already_linked_other_user
 *     （這是身份衝突案例，需要人工處理；本 helper 不做自動 reassign）
 *   - 任何 prisma 錯誤都 catch 起來不上拋 — 上游 bind 已經成功，Account 同步失敗
 *     不應 break user 主流程；改靠診斷腳本（diagnose-line-account-drift.ts）找回。
 *
 * 不做的事：
 *   - 不寫 access_token / refresh_token（webhook 路徑沒這些；auth.ts existing-user
 *     分支保留原本含 token 的寫法，那個由 NextAuth OAuth 流程自帶 token）
 *   - 不刪除 / 重新指定既有 Account.userId
 *   - 不建立 User（caller 須確保 userId 對應 row 存在）
 */

export type LineAccountSyncResult =
  | { status: "noop_already_synced" }
  | { status: "created" }
  | { status: "skipped_already_linked_other_user"; existingUserId: string }
  | { status: "error"; error: string };

export async function syncLineAccountForUser(opts: {
  userId: string;
  lineUserId: string;
  /** 在 transaction 內呼叫時傳入 tx client，確保與其他寫入同一 transaction */
  tx?: Prisma.TransactionClient;
}): Promise<LineAccountSyncResult> {
  if (!opts.userId || !opts.lineUserId) {
    console.warn("[syncLineAccount] skipped: missing userId or lineUserId", {
      hasUserId: !!opts.userId,
      hasLineUserId: !!opts.lineUserId,
    });
    return { status: "error", error: "missing_input" };
  }

  const client = opts.tx ?? prisma;

  try {
    const existing = await client.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "line",
          providerAccountId: opts.lineUserId,
        },
      },
      select: { id: true, userId: true },
    });

    if (existing) {
      if (existing.userId === opts.userId) {
        return { status: "noop_already_synced" };
      }
      console.warn("[syncLineAccount] skipped: already_linked_other_user", {
        lineUserId: opts.lineUserId,
        requestedUserId: opts.userId,
        existingUserId: existing.userId,
      });
      return {
        status: "skipped_already_linked_other_user",
        existingUserId: existing.userId,
      };
    }

    await client.account.create({
      data: {
        userId: opts.userId,
        provider: "line",
        providerAccountId: opts.lineUserId,
        type: "oauth",
      },
    });
    console.info("[syncLineAccount] created", {
      userId: opts.userId,
      lineUserId: opts.lineUserId,
    });
    return { status: "created" };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[syncLineAccount] failed", {
      userId: opts.userId,
      lineUserId: opts.lineUserId,
      error: errMsg,
    });
    return { status: "error", error: errMsg };
  }
}
