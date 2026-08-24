/**
 * 客戶端健康評估卡片資料查詢
 *
 * 供 /my-bookings 和 /book 使用
 *
 * 資料直接讀取蒸管家原生健康量測表，不依賴外部網站。
 */

import { prisma } from "@/lib/db";
import type { HealthSummary } from "@/lib/health-service";
import { getNativeHealthSummary } from "@/lib/native-health-service";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { getCurrentUser } from "@/lib/session";
import { isOwner } from "@/lib/permissions";

export interface HealthCardData {
  available: true;
  /** 蒸管家原生量測摘要 */
  summary: HealthSummary;
}

export interface HealthCardUnavailable {
  available: false;
  reason:
    | "no-customer"
    | "feature-unavailable"
    | "not-linked"
    | "no-data"
    | "error";
}

export type HealthCardResult = HealthCardData | HealthCardUnavailable;

/**
 * 取得客戶的健康評估卡片資料
 * 失敗時靜默返回 unavailable（不阻塞頁面渲染）
 */
export async function getHealthCardData(
  customerId: string | null | undefined,
): Promise<HealthCardResult> {
  if (!customerId) {
    return { available: false, reason: "no-customer" };
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        storeId: true,
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

    // StoreFeatureEntitlement-aware gate：同一個 ai_health_summary 開關同時控制
    // 顧客健康評估入口、顧客端摘要與店長後台摘要。
    if (!(await hasStoreFeature(customer.storeId, FEATURES.AI_HEALTH_SUMMARY))) {
      return { available: false, reason: "feature-unavailable" };
    }

    const summary = await getNativeHealthSummary(customerId, customer.storeId);
    if (!summary.latest) {
      return { available: false, reason: "no-data" };
    }

    return { available: true, summary };
  } catch {
    return { available: false, reason: "error" };
  }
}
