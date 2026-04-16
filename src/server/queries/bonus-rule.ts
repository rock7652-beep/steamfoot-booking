"use server";

import { prisma } from "@/lib/db";

export interface BonusRuleItem {
  id: string;
  name: string;
  points: number;
  description: string | null;
  isActive: boolean;
  startDate: Date | null;
  endDate: Date | null;
  sortOrder: number;
}

/**
 * 取得店鋪的所有獎勵項目（後台管理用）
 */
export async function getBonusRules(storeId: string): Promise<BonusRuleItem[]> {
  return prisma.bonusRule.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      points: true,
      description: true,
      isActive: true,
      startDate: true,
      endDate: true,
      sortOrder: true,
    },
  });
}

/**
 * 取得店鋪啟用中的獎勵項目（前台顯示 & 手動加分選單用）
 * 會過濾掉已停用和已過期的項目
 */
export async function getActiveBonusRules(storeId: string): Promise<BonusRuleItem[]> {
  const now = new Date();
  return prisma.bonusRule.findMany({
    where: {
      storeId,
      isActive: true,
      OR: [
        { endDate: null },
        { endDate: { gte: now } },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      points: true,
      description: true,
      isActive: true,
      startDate: true,
      endDate: true,
      sortOrder: true,
    },
  });
}
