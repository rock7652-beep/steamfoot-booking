/**
 * 體驗課（單一 TRIAL ServicePlan）service
 *
 * 規格：「體驗課只有一個」。每店至多一條 canonical 體驗 ServicePlan
 *   (category = TRIAL, sessionCount = 1)，由本服務結構性保證。
 *
 * 設計原則：
 *  - 不影響舊資料：若店內已有 active TRIAL plan，沿用「最早建立」那一條，
 *    不刪除、不停用其他 legacy TRIAL plan、不改其價格（避免動到既有交易/錢包）。
 *  - 只在「完全沒有 active TRIAL plan」時才建立一條，初始價沿用體驗課設定。
 *  - 單筆體驗交易的金額一律以建立當下的快照為準，不依賴 plan.price，
 *    故本服務不會回頭同步既有 plan 的價格。
 *  - 接受 tx，方便包進建立體驗單的原子交易。
 */

import { prisma } from "@/lib/db";
import type { Prisma, ServicePlan } from "@prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

const TRIAL_PLAN_NAME = "體驗課";

/**
 * 取得（或建立）該店唯一的體驗 ServicePlan。
 *
 * @param defaultPrice 無 plan 時建立用的初始價（來自 ShopConfig.trialDefaultPrice）
 */
export async function ensureTrialPlan(
  storeId: string,
  defaultPrice: number,
  db: Db = prisma
): Promise<ServicePlan> {
  // 1. 沿用既有 active TRIAL plan（最早建立的視為 canonical）
  const existing = await db.servicePlan.findFirst({
    where: { storeId, category: "TRIAL", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  // 2. 名稱可能被 inactive 的舊體驗 plan 佔用（@@unique[storeId, name]）；
  //    若有就重新啟用該筆，避免 unique 衝突 / 重複建立。
  const byName = await db.servicePlan.findFirst({
    where: { storeId, name: TRIAL_PLAN_NAME },
  });
  if (byName) {
    return db.servicePlan.update({
      where: { id: byName.id },
      data: { isActive: true, category: "TRIAL", sessionCount: 1 },
    });
  }

  // 3. 全新建立
  return db.servicePlan.create({
    data: {
      storeId,
      name: TRIAL_PLAN_NAME,
      category: "TRIAL",
      price: Math.max(0, Math.round(defaultPrice)),
      sessionCount: 1,
      validityDays: null,
      isActive: true,
      publicVisible: false,
      sortOrder: 0,
      description: "體驗客專用，單堂體驗",
    },
  });
}
