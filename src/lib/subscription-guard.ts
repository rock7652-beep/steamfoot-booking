import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";
import { computeLifecycle } from "@/lib/subscription-lifecycle";

/**
 * 訂閱到期保護 — 中央 guard（server 端）。
 *
 * 規則（一切照制度）：
 *   - 該 store 有目前訂閱且 lifecycle = EXPIRED（或未來手動 SUSPENDED）→ 阻擋寫入。
 *   - 該 store **沒有訂閱** → **不擋**（避免竹北總店 / 既有正式站既有流程被誤傷）。
 *   - TRIAL / ACTIVE → 正常。
 *
 * 只讀 status + expiresAt（既有欄位 → prod-safe，不碰 #295 新欄位）。
 * 純擋寫入，不刪任何資料；查不到 store / 查詢失敗時保守放行（不因系統錯誤誤傷營運）。
 */

/** 顧客端建立新預約的通用到期訊息（店長 + 顧客都看得懂） */
export const BOOKING_EXPIRED_MESSAGE =
  "本店系統使用期限已到期，暫時無法建立新預約，請聯繫店家。";

/** 回傳該 store 是否因訂閱到期 / 暫停而應擋寫入（無訂閱 / 查詢失敗 → false 放行）。 */
export async function isStoreSubscriptionWriteBlocked(
  storeId: string | null | undefined,
): Promise<boolean> {
  if (!storeId) return false;

  let sub: { status: string; expiresAt: Date | null } | null = null;
  try {
    sub = await prisma.storeSubscription.findFirst({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      select: { status: true, expiresAt: true },
    });
  } catch {
    return false; // 查詢失敗 → 保守放行
  }
  if (!sub) return false; // 無訂閱 → 不擋

  const lc = computeLifecycle(
    { status: sub.status, expiresAt: sub.expiresAt },
    toLocalDateStr(),
  );
  return lc.state === "EXPIRED" || lc.state === "SUSPENDED";
}

/**
 * 在 server action 寫入前呼叫：到期 / 暫停則 throw FORBIDDEN。
 * @param opts.message 自訂錯誤訊息（如預約用通用文案）；省略則用後台唯讀預設訊息。
 *
 * 用法（requirePermission/storeId 之後、實際寫入之前）：
 *   await assertStoreSubscriptionWritable(storeId);
 *   await assertStoreSubscriptionWritable(storeId, { message: BOOKING_EXPIRED_MESSAGE });
 */
export async function assertStoreSubscriptionWritable(
  storeId: string | null | undefined,
  opts?: { message?: string },
): Promise<void> {
  if (!(await isStoreSubscriptionWriteBlocked(storeId))) return;
  throw new AppError(
    "FORBIDDEN",
    opts?.message ??
      "系統使用期限已到期，目前為唯讀模式。請聯繫總部完成續約後即可恢復操作。",
  );
}
