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
 *
 * 用法：在 server action 的 requirePermission/storeId 之後、實際寫入之前呼叫：
 *   await assertStoreSubscriptionWritable(storeId);
 */
export async function assertStoreSubscriptionWritable(
  storeId: string | null | undefined,
): Promise<void> {
  if (!storeId) return; // 無 store 範圍 → 不擋

  let sub: { status: string; expiresAt: Date | null } | null = null;
  try {
    sub = await prisma.storeSubscription.findFirst({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      select: { status: true, expiresAt: true },
    });
  } catch {
    // 查詢失敗 → 保守放行，不因系統錯誤擋住營運
    return;
  }

  // 無訂閱 → 不擋（req：避免既有正式站誤傷）
  if (!sub) return;

  const lc = computeLifecycle(
    { status: sub.status, expiresAt: sub.expiresAt },
    toLocalDateStr(),
  );

  if (lc.state === "EXPIRED") {
    throw new AppError(
      "FORBIDDEN",
      "系統使用期限已到期，目前為唯讀模式。請聯繫總部完成續約後即可恢復操作。",
    );
  }
  if (lc.state === "SUSPENDED") {
    throw new AppError(
      "FORBIDDEN",
      "系統已暫停使用。請聯繫總部完成續約後即可恢復操作。",
    );
  }
}
