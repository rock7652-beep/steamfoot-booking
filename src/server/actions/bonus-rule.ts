"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { revalidatePath } from "next/cache";

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
 */
export async function createBonusRule(formData: FormData) {
  const user = await requireStaffSession();
  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    throw new Error("僅店長或總部可管理獎勵項目");
  }
  const storeId = await resolveStoreId(user);

  const name = (formData.get("name") as string)?.trim();
  const pointsStr = formData.get("points") as string;
  const description = (formData.get("description") as string)?.trim() || null;
  const startDateStr = formData.get("startDate") as string | null;
  const endDateStr = formData.get("endDate") as string | null;

  if (!name) throw new Error("名稱不可為空");
  const points = parseInt(pointsStr, 10);
  if (!points || points <= 0) throw new Error("積分必須大於 0");

  await prisma.bonusRule.create({
    data: {
      storeId,
      name,
      points,
      description,
      startDate: startDateStr ? new Date(startDateStr) : null,
      endDate: endDateStr ? new Date(endDateStr) : null,
    },
  });

  revalidatePath("/dashboard/bonus-rules");
}

/**
 * 更新獎勵項目
 */
export async function updateBonusRule(formData: FormData) {
  const user = await requireStaffSession();
  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    throw new Error("僅店長或總部可管理獎勵項目");
  }
  const storeId = await resolveStoreId(user);

  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const pointsStr = formData.get("points") as string;
  const description = (formData.get("description") as string)?.trim() || null;
  const isActive = formData.get("isActive") === "true";
  const startDateStr = formData.get("startDate") as string | null;
  const endDateStr = formData.get("endDate") as string | null;

  if (!id) throw new Error("缺少 ID");
  if (!name) throw new Error("名稱不可為空");
  const points = parseInt(pointsStr, 10);
  if (!points || points <= 0) throw new Error("積分必須大於 0");

  // 確認屬於此店
  const existing = await prisma.bonusRule.findFirst({
    where: { id, storeId },
  });
  if (!existing) throw new Error("獎勵項目不存在");

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

  revalidatePath("/dashboard/bonus-rules");
}

/**
 * 刪除獎勵項目（軟刪除 = isActive: false）
 */
export async function deleteBonusRule(formData: FormData) {
  const user = await requireStaffSession();
  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    throw new Error("僅店長或總部可管理獎勵項目");
  }
  const storeId = await resolveStoreId(user);

  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少 ID");

  const existing = await prisma.bonusRule.findFirst({
    where: { id, storeId },
  });
  if (!existing) throw new Error("獎勵項目不存在");

  await prisma.bonusRule.update({
    where: { id },
    data: { isActive: false },
  });

  revalidatePath("/dashboard/bonus-rules");
}
