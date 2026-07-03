"use server";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import {
  lookupHealthProfileSafe,
  getHealthSummarySafe,
  invalidateHealthCache,
  type HealthSummary,
} from "@/lib/health-service";
import { revalidatePath } from "next/cache";

// ============================================================
// tryAutoLinkHealth — 背景自動比對（前端 useEffect 觸發）
// ============================================================

export async function tryAutoLinkHealth(customerId: string): Promise<{
  status: "linked" | "not_found" | "already_linked" | "no_email" | "error";
  healthProfileId?: string;
}> {
  try {
    await requirePermission("customer.read");

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        email: true,
        phone: true,
        healthProfileId: true,
        healthLinkStatus: true,
      },
    });

    if (!customer) return { status: "error" };

    // 已經綁定
    if (customer.healthProfileId && customer.healthLinkStatus === "linked") {
      return { status: "already_linked", healthProfileId: customer.healthProfileId };
    }

    // 沒有 email 也沒有 phone，無法自動比對
    if (!customer.email && !customer.phone) {
      return { status: "no_email" };
    }

    // 呼叫 AI 健康評估 API 查詢（用 safe wrapper 避免 throw）
    const result = await lookupHealthProfileSafe(customer.email, customer.phone, { customerId });

    if (!result.found || result.profiles.length === 0) {
      // 記錄為 not_found，避免重複嘗試
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          healthLinkStatus: "not_found",
          healthSyncedAt: new Date(),
        },
      });
      return { status: "not_found" };
    }

    // 自動比對只取第一筆（email 在 Supabase Auth 是唯一的）
    const profile = result.profiles[0];

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        healthProfileId: profile.id,
        healthLinkStatus: "linked",
        healthSyncedAt: new Date(),
      },
    });

    revalidatePath(`/dashboard/customers/${customerId}`);
    return { status: "linked", healthProfileId: profile.id };
  } catch (error) {
    console.error("[tryAutoLinkHealth] Error:", error);
    // 記錄為 error，與 not_found 區分
    try {
      await prisma.customer.update({
        where: { id: customerId },
        data: { healthLinkStatus: "error" },
      });
    } catch { /* ignore */ }
    return { status: "error" };
  }
}

// ============================================================
// linkHealthProfile — 手動綁定
// ============================================================

export async function linkHealthProfile(
  customerId: string,
  healthProfileId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission("customer.update");

    if (!healthProfileId || !/^[0-9a-f-]{36}$/i.test(healthProfileId)) {
      return { success: false, error: "無效的 Profile ID" };
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        healthProfileId,
        healthLinkStatus: "linked",
        healthSyncedAt: new Date(),
      },
    });

    invalidateHealthCache(healthProfileId);
    revalidatePath(`/dashboard/customers/${customerId}`);
    return { success: true };
  } catch (error) {
    console.error("[linkHealthProfile] Error:", error);
    return { success: false, error: "綁定失敗" };
  }
}

// ============================================================
// unlinkHealthProfile — 解除綁定
// ============================================================

export async function unlinkHealthProfile(
  customerId: string
): Promise<{ success: boolean }> {
  try {
    await requirePermission("customer.update");

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { healthProfileId: true },
    });

    if (customer?.healthProfileId) {
      invalidateHealthCache(customer.healthProfileId);
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        healthProfileId: null,
        healthLinkStatus: "unlinked",
        healthSyncedAt: null,
      },
    });

    revalidatePath(`/dashboard/customers/${customerId}`);
    return { success: true };
  } catch (error) {
    console.error("[unlinkHealthProfile] Error:", error);
    return { success: false };
  }
}

// ============================================================
// searchHealthProfile — 手動搜尋（用於 Modal）
// ============================================================

export async function searchHealthProfile(
  email?: string,
  phone?: string
): Promise<{
  found: boolean;
  profiles: Array<{
    id: string;
    fullName: string | null;
    gender: string | null;
    age: number | null;
    height: number | null;
    emailHint: string | null;
    phoneHint: string | null;
  }>;
}> {
  try {
    await requirePermission("customer.read");

    return await lookupHealthProfileSafe(email, phone);
  } catch (error) {
    console.error("[searchHealthProfile] Error:", error);
    return { found: false, profiles: [] };
  }
}

// ============================================================
// fetchHealthSummaryForDashboard — lazy summary（顧客頁按需查看）
//
// 設計合約（per dashboard-health-lazy audit 2026-05-27）：
//   1. 嚴格純讀，0 DB write
//   2. 0 page-load 觸發 — 只在店長點「查看健康摘要」按鈕時呼叫
//   3. 不呼叫 tryAutoLinkHealth（避免誤觸發 auto-link 寫流程）
//   4. healthProfileId 不回 client — server-side 內部使用即可
//   5. 重用 getHealthSummarySafe（5 分鐘 LRU + safeApi wrapper：失敗回 null 不 throw）
//   6. 沿用 customer.read 權限；assertStoreAccess 防跨店
//   7. linked 但 API 失敗 → service_unavailable（UI 顯示「暫時無法載入」+ 重試）
// ============================================================

export type FetchHealthSummaryForDashboardResult =
  | { status: "ok"; summary: HealthSummary }
  /** 顧客尚未連結（healthLinkStatus = unlinked 或無 healthProfileId） */
  | { status: "no_profile" }
  /** dashboard 自動配對找不到對應 HealthFlow profile */
  | { status: "not_found" }
  /** dashboard 上次配對發生錯誤 */
  | { status: "error" }
  /** HealthFlow API 暫時無法呼叫（safeApi fallback null） */
  | { status: "service_unavailable" }
  /** requirePermission 或 assertStoreAccess 失敗 / 顧客不存在 */
  | { status: "forbidden" };

export async function fetchHealthSummaryForDashboard(
  customerId: string,
): Promise<FetchHealthSummaryForDashboardResult> {
  let user;
  try {
    user = await requirePermission("customer.read");
  } catch {
    return { status: "forbidden" };
  }

  let customer;
  try {
    customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        storeId: true,
        healthProfileId: true,
        healthLinkStatus: true,
      },
    });
  } catch (err) {
    console.error("[fetchHealthSummaryForDashboard] customer query failed", err);
    return { status: "service_unavailable" };
  }
  if (!customer) return { status: "forbidden" };

  // 跨店防線（與其他 dashboard read action 一致）
  try {
    assertStoreAccess(user, customer.storeId);
  } catch {
    return { status: "forbidden" };
  }

  try {
    await requireStoreFeature(customer.storeId, FEATURES.AI_HEALTH_SUMMARY);
  } catch {
    return { status: "forbidden" };
  }

  // Branch by linkStatus — 不打 HealthFlow API 除非真的 linked + 有 profileId
  if (!customer.healthProfileId || customer.healthLinkStatus !== "linked") {
    if (customer.healthLinkStatus === "not_found") return { status: "not_found" };
    if (customer.healthLinkStatus === "error") return { status: "error" };
    return { status: "no_profile" };
  }

  // linked + 有 profileId → 安全呼叫 HealthFlow（5 分鐘 LRU 命中時不會打 API）
  // safeApi 失敗會自動 logError 並回 null；不 throw。
  const summary = await getHealthSummarySafe(customer.healthProfileId, {
    customerId,
    storeId: customer.storeId,
  });
  if (!summary) {
    return { status: "service_unavailable" };
  }

  return { status: "ok", summary };
}
