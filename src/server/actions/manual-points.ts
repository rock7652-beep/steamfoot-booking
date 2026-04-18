"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { awardPoints } from "./points";
import { revalidatePath } from "next/cache";

/**
 * ADMIN 沒有 session.storeId，需從 cookie 取得目前切換的店。
 */
async function resolveStoreId(user: { role: string; storeId?: string | null }): Promise<string> {
  if (user.role !== "ADMIN" && user.storeId) return user.storeId;
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) throw new Error("請先切換到特定分店");
  return storeId;
}

/**
 * 手動為顧客加分（後台操作）
 *
 * 使用 MANUAL_ADJUSTMENT type，透過 pointsOverride 指定分數。
 * note 欄位記錄原因（可能來自 BonusRule 名稱或自由輸入）。
 */
export async function manualAwardPoints(formData: FormData) {
  const user = await requireStaffSession();
  const storeId = await resolveStoreId(user);

  const customerId = formData.get("customerId") as string;
  const pointsStr = formData.get("points") as string;
  const note = (formData.get("note") as string)?.trim();
  const bonusRuleId = formData.get("bonusRuleId") as string | null;

  if (!customerId) throw new Error("缺少顧客 ID");

  const points = parseInt(pointsStr, 10);
  if (!points || points === 0) throw new Error("點數不可為 0");

  // 驗證顧客存在且屬於此店
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId },
    select: { id: true },
  });
  if (!customer) throw new Error("顧客不存在");

  // 如果選了 bonusRule，驗證存在並取得名稱作 note
  let finalNote = note || "手動調整";
  if (bonusRuleId) {
    const rule = await prisma.bonusRule.findFirst({
      where: { id: bonusRuleId, storeId, isActive: true },
      select: { name: true },
    });
    if (rule) {
      finalNote = rule.name + (note ? `（${note}）` : "");
    }
  }

  await awardPoints({
    customerId,
    storeId,
    type: "MANUAL_ADJUSTMENT",
    note: finalNote,
    pointsOverride: points,
  });

  revalidatePath(`/dashboard/customers/${customerId}`);
}
