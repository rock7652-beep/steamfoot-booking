"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { assertStoreAccess } from "@/lib/manager-visibility";
import {
  createReferralSchema,
  updateReferralStatusSchema,
  convertReferralSchema,
} from "@/lib/validators/referral";
import { REFERRAL_STATUS_TRANSITIONS } from "@/types/referral";
import { awardPoints } from "@/server/actions/points";
import type { ActionResult } from "@/types";
import type { ReferralStatus } from "@prisma/client";

// 允許發起轉介紹的最低階段（排除 LEAD / CUSTOMER）
const REFERRER_MIN_STAGES = new Set([
  "REGULAR",
  "POTENTIAL_PARTNER",
  "PARTNER",
  "FUTURE_OWNER",
  "OWNER",
]);

// ── 建立轉介紹 ─────────────────────────────

export async function createReferral(
  input: unknown,
): Promise<ActionResult<{ referralId: string }>> {
  try {
    const user = await requirePermission("talent.manage");
    const data = createReferralSchema.parse(input);

    // 驗證介紹人存在
    const referrer = await prisma.customer.findUnique({
      where: { id: data.referrerId },
      select: { id: true, storeId: true, name: true, talentStage: true },
    });
    if (!referrer) throw new AppError("NOT_FOUND", "找不到介紹人");
    assertStoreAccess(user, referrer.storeId);

    // 驗證介紹人階段（至少 REGULAR 才能轉介紹）
    if (!REFERRER_MIN_STAGES.has(referrer.talentStage)) {
      throw new AppError(
        "BUSINESS_RULE",
        "此顧客階段尚不能發起轉介紹（至少需為「常客」以上）",
      );
    }

    // 防重複：同一介紹人 + 同名 + 同電話，5 分鐘內不可重複建立
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const duplicate = await prisma.referral.findFirst({
      where: {
        referrerId: data.referrerId,
        referredName: data.referredName,
        referredPhone: data.referredPhone || null,
        createdAt: { gte: fiveMinAgo },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppError("BUSINESS_RULE", "此轉介紹剛剛已建立，請勿重複提交");
    }

    const referral = await prisma.referral.create({
      data: {
        storeId: referrer.storeId,
        referrerId: data.referrerId,
        referredName: data.referredName,
        referredPhone: data.referredPhone || null,
        note: data.note ?? null,
      },
    });

    // 自動給分：轉介紹登記 +10
    await awardPoints({
      customerId: data.referrerId,
      storeId: referrer.storeId,
      type: "REFERRAL_CREATED",
      note: `介紹 ${data.referredName}`,
    });

    revalidatePath("/dashboard/growth");
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/customers/${data.referrerId}`);

    return { success: true, data: { referralId: referral.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ── 更新轉介紹狀態 ─────────────────────────────

export async function updateReferralStatus(
  input: unknown,
): Promise<ActionResult<{ referralId: string }>> {
  try {
    const user = await requirePermission("talent.manage");
    const data = updateReferralStatusSchema.parse(input);

    const referral = await prisma.referral.findUnique({
      where: { id: data.referralId },
      select: {
        id: true,
        storeId: true,
        referrerId: true,
        status: true,
        referredName: true,
      },
    });
    if (!referral) throw new AppError("NOT_FOUND", "找不到轉介紹紀錄");
    assertStoreAccess(user, referral.storeId);

    // 檢查狀態轉換合法性
    const allowedNext = REFERRAL_STATUS_TRANSITIONS[referral.status];
    if (!allowedNext.includes(data.newStatus as ReferralStatus)) {
      throw new AppError(
        "BUSINESS_RULE",
        `無法從「${referral.status}」轉換到「${data.newStatus}」`,
      );
    }

    // 樂觀鎖：WHERE 同時比對 id + 舊狀態，防止併發覆蓋
    const updated = await prisma.referral.updateMany({
      where: { id: data.referralId, status: referral.status },
      data: { status: data.newStatus as ReferralStatus },
    });
    if (updated.count === 0) {
      throw new AppError("BUSINESS_RULE", "狀態已被其他操作更新，請重新整理頁面");
    }

    // 自動給分
    if (data.newStatus === "VISITED") {
      await awardPoints({
        customerId: referral.referrerId,
        storeId: referral.storeId,
        type: "REFERRAL_VISITED",
        note: `${referral.referredName} 到店`,
      });
    } else if (data.newStatus === "CONVERTED") {
      await awardPoints({
        customerId: referral.referrerId,
        storeId: referral.storeId,
        type: "REFERRAL_CONVERTED",
        note: `${referral.referredName} 成為顧客`,
      });
    }

    revalidatePath("/dashboard/growth");
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/customers/${referral.referrerId}`);

    return { success: true, data: { referralId: data.referralId } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ── 連接轉介紹 → 顧客（不自動設 sponsor，保留人工判斷）──

export async function convertReferral(
  input: unknown,
): Promise<ActionResult<{ referralId: string }>> {
  try {
    const user = await requirePermission("talent.manage");
    const data = convertReferralSchema.parse(input);

    const referral = await prisma.referral.findUnique({
      where: { id: data.referralId },
      select: {
        id: true,
        storeId: true,
        referrerId: true,
        status: true,
        referredName: true,
        convertedCustomerId: true,
      },
    });
    if (!referral) throw new AppError("NOT_FOUND", "找不到轉介紹紀錄");
    assertStoreAccess(user, referral.storeId);

    if (referral.convertedCustomerId) {
      throw new AppError("BUSINESS_RULE", "此轉介紹已連接顧客");
    }

    // 只允許 VISITED 或 PENDING 狀態才能連接顧客
    if (referral.status !== "VISITED" && referral.status !== "PENDING") {
      throw new AppError(
        "BUSINESS_RULE",
        `目前狀態「${referral.status}」無法連接顧客`,
      );
    }

    // 驗證目標顧客存在且同店
    const customer = await prisma.customer.findUnique({
      where: { id: data.convertedCustomerId },
      select: { id: true, storeId: true, sponsorId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "找不到目標顧客");
    if (customer.storeId !== referral.storeId) {
      throw new AppError("VALIDATION", "目標顧客不在同一間店");
    }

    // 樂觀鎖：確保狀態和 convertedCustomerId 未被併發修改
    const updated = await prisma.referral.updateMany({
      where: {
        id: data.referralId,
        status: referral.status,
        convertedCustomerId: null,
      },
      data: {
        convertedCustomerId: data.convertedCustomerId,
        status: "CONVERTED",
      },
    });
    if (updated.count === 0) {
      throw new AppError("BUSINESS_RULE", "此紀錄已被其他操作更新，請重新整理頁面");
    }

    // 如果明確選擇設定 sponsor（人工判斷後勾選）
    if (data.setSponsor && !customer.sponsorId) {
      await prisma.customer.update({
        where: { id: data.convertedCustomerId },
        data: { sponsorId: referral.referrerId },
      });
    }

    // 如果原本不是 CONVERTED，補給分
    if (referral.status === "PENDING" || referral.status === "VISITED") {
      // 先補 VISITED（如果原本是 PENDING 直接跳 CONVERTED）
      if (referral.status === "PENDING") {
        await awardPoints({
          customerId: referral.referrerId,
          storeId: referral.storeId,
          type: "REFERRAL_VISITED",
          note: `${referral.referredName} 到店（連接顧客時補發）`,
        });
      }
      await awardPoints({
        customerId: referral.referrerId,
        storeId: referral.storeId,
        type: "REFERRAL_CONVERTED",
        note: `${referral.referredName} 成為顧客`,
      });
    }

    revalidatePath("/dashboard/growth");
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/customers/${referral.referrerId}`);
    revalidatePath(`/dashboard/customers/${data.convertedCustomerId}`);

    return { success: true, data: { referralId: data.referralId } };
  } catch (e) {
    return handleActionError(e);
  }
}
