"use server";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import {
  lookupHealthProfile,
  invalidateHealthCache,
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

    // 呼叫 AI 健康評估 API 查詢
    const result = await lookupHealthProfile(customer.email, customer.phone);

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

    return await lookupHealthProfile(email, phone);
  } catch (error) {
    console.error("[searchHealthProfile] Error:", error);
    return { found: false, profiles: [] };
  }
}
