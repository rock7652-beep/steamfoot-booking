/**
 * 客戶端健康評估卡片資料查詢
 *
 * 供 /my-bookings 和 /book 使用
 *
 * PR-H2c：暴露 `summary` 取代 `score`。HealthFlow summary API 不回官方 score，
 * Steamfoot 自算的 score 與 HealthFlow 原站不一致，會誤導顧客。卡片只顯示量測摘要
 * + alert badge；正式分數導 HealthFlow 原站看。
 */

import { prisma } from "@/lib/db";
import { getHealthSummarySafe, type HealthSummary } from "@/lib/health-service";
import { hasFeature, FEATURES } from "@/lib/feature-flags";
import { getStorePlanById } from "@/lib/store-plan";
import { getCurrentUser } from "@/lib/session";
import { isOwner } from "@/lib/permissions";

export interface HealthCardData {
  available: true;
  /** HealthFlow summary — latest 量測 + alerts + trend + meta，由 view 自行渲染 */
  summary: HealthSummary;
}

export interface HealthCardUnavailable {
  available: false;
  reason: "no-customer" | "not-linked" | "no-data" | "error";
}

export type HealthCardResult = HealthCardData | HealthCardUnavailable;

/**
 * 取得客戶的健康評估卡片資料
 * 失敗時靜默返回 unavailable（不阻塞頁面渲染）
 */
export async function getHealthCardData(
  customerId: string | null | undefined
): Promise<HealthCardResult> {
  if (!customerId) {
    return { available: false, reason: "no-customer" };
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        storeId: true,
        healthProfileId: true,
        healthLinkStatus: true,
      },
    });

    if (!customer) {
      return { available: false, reason: "no-customer" };
    }

    // Store ownership check: non-ADMIN users can only access their own store's customers
    const user = await getCurrentUser();
    if (user && !isOwner(user.role) && user.storeId && customer.storeId !== user.storeId) {
      return { available: false, reason: "no-customer" };
    }

    // PricingPlan feature gate: AI 健康摘要需 GROWTH+
    const storePlan = await getStorePlanById(customer.storeId);
    if (!hasFeature(storePlan, FEATURES.AI_HEALTH_SUMMARY)) {
      return { available: false, reason: "not-linked" };
    }

    if (!customer.healthProfileId || customer.healthLinkStatus !== "linked") {
      return { available: false, reason: "not-linked" };
    }

    const summary = await getHealthSummarySafe(customer.healthProfileId, { customerId });
    if (!summary || !summary.latest) {
      return { available: false, reason: "no-data" };
    }

    return { available: true, summary };
  } catch {
    return { available: false, reason: "error" };
  }
}
