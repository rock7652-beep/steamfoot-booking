"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { revalidateBonusRules } from "@/lib/revalidation";

/**
 * ADMIN 沒有 session.storeId，需從 cookie 取得目前切換的店。
 * OWNER/PARTNER 直接用 session.storeId。
 */
async function resolveStoreId(user: { role: string; storeId?: string | null }): Promise<string> {
  // 非 ADMIN：直接用 session storeId
  if (user.role !== "ADMIN" && user.storeId) return user.storeId;
  // ADMIN：從 cookie 解析目前查看的店
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) throw new Error("請先切換到特定分店");
  return storeId;
}

/**
 * 新增獎勵項目
 *
 * Result-returning shape so the drawer can show errors inline; legacy
 * callers using <form action> get exception behaviour preserved via
 * `throw` if they choose, but the new manager awaits the result.
 */
export async function createBonusRule(
  formData: FormData,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const user = await requireStaffSession();
    if (user.role !== "ADMIN" && user.role !== "OWNER") {
      return { success: false, error: "僅店長或總部可管理獎勵項目" };
    }
    const storeId = await resolveStoreId(user);

    const name = (formData.get("name") as string)?.trim();
    const pointsStr = formData.get("points") as string;
    const description = (formData.get("description") as string)?.trim() || null;
    const startDateStr = formData.get("startDate") as string | null;
    const endDateStr = formData.get("endDate") as string | null;

    if (!name) return { success: false, error: "名稱不可為空" };
    const points = parseInt(pointsStr, 10);
    if (!points || points <= 0)
      return { success: false, error: "點數必須大於 0" };

    const created = await prisma.bonusRule.create({
      data: {
        storeId,
        name,
        points,
        description,
        startDate: startDateStr ? new Date(startDateStr) : null,
        endDate: endDateStr ? new Date(endDateStr) : null,
      },
    });

    revalidateBonusRules();
    return { success: true, id: created.id };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "新增失敗",
    };
  }
}

/**
 * 更新獎勵項目
 */
export async function updateBonusRule(
  formData: FormData,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await requireStaffSession();
    if (user.role !== "ADMIN" && user.role !== "OWNER") {
      return { success: false, error: "僅店長或總部可管理獎勵項目" };
    }
    const storeId = await resolveStoreId(user);

    const id = formData.get("id") as string;
    const name = (formData.get("name") as string)?.trim();
    const pointsStr = formData.get("points") as string;
    const description = (formData.get("description") as string)?.trim() || null;
    const isActive = formData.get("isActive") === "true";
    const startDateStr = formData.get("startDate") as string | null;
    const endDateStr = formData.get("endDate") as string | null;

    if (!id) return { success: false, error: "缺少 ID" };
    if (!name) return { success: false, error: "名稱不可為空" };
    const points = parseInt(pointsStr, 10);
    if (!points || points <= 0)
      return { success: false, error: "點數必須大於 0" };

    // 確認屬於此店
    const existing = await prisma.bonusRule.findFirst({
      where: { id, storeId },
    });
    if (!existing) return { success: false, error: "獎勵項目不存在" };

    await prisma.bonusRule.update({
      where: { id },
      data: {
        name,
        points,
        description,
        isActive,
        startDate: startDateStr ? new Date(startDateStr) : null,
        endDate: endDateStr ? new Date(endDateStr) : null,
      },
    });

    revalidateBonusRules();
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "更新失敗",
    };
  }
}

/**
 * 刪除獎勵項目（hard delete）
 *
 * 之前實作是 soft-delete（只翻 isActive: false），但 UI 的「刪除」按鈕
 * 只在 isActive=false 時才顯示 — 結果是按鈕對「已停用」規則呼叫此 action
 * 等於 no-op，使用者看起來「按了沒反應」。
 *
 * 改為真正的 DELETE：
 * - PointRecord 沒有 BonusRuleId FK（per schema），刪除安全。
 * - 歷史 PointRecord.note 已在發點當下複製規則名稱（manual-points.ts:54），
 *   不會因為刪規則而失資料。
 * - 「停用 / 啟用」由 updateBonusRule 處理；此 action 專責永久移除。
 *
 * 回傳 { success: true } 讓客戶端能 await 後切 UI（之前 throw 在 useTransition
 * 裡會被 silent swallow，使用者看不到錯誤）。
 */
export async function deleteBonusRule(
  formData: FormData,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await requireStaffSession();
    if (user.role !== "ADMIN" && user.role !== "OWNER") {
      return { success: false, error: "僅店長或總部可管理獎勵項目" };
    }
    const storeId = await resolveStoreId(user);

    const id = formData.get("id") as string;
    if (!id) return { success: false, error: "缺少 ID" };

    const existing = await prisma.bonusRule.findFirst({
      where: { id, storeId },
    });
    if (!existing) return { success: false, error: "獎勵項目不存在" };

    await prisma.bonusRule.delete({ where: { id } });

    revalidateBonusRules();
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "刪除失敗",
    };
  }
}
