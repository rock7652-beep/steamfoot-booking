"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { assertStoreAccess } from "@/lib/manager-visibility";
import {
  updateTalentStageSchema,
  setSponsorSchema,
} from "@/lib/validators/talent";
import type { ActionResult } from "@/types";

// ── 變更人才階段 ─────────────────────────────

export async function updateTalentStage(
  input: unknown,
): Promise<ActionResult<{ customerId: string }>> {
  try {
    const user = await requirePermission("talent.manage");
    const data = updateTalentStageSchema.parse(input);

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, storeId: true, talentStage: true, sponsorId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "找不到此顧客");
    assertStoreAccess(user, customer.storeId);

    if (customer.talentStage === data.newStage) {
      return { success: true, data: { customerId: data.customerId } };
    }

    await prisma.$transaction([
      prisma.customer.update({
        where: { id: data.customerId },
        data: {
          talentStage: data.newStage,
          stageChangedAt: new Date(),
          stageNote: data.note ?? null,
        },
      }),
      prisma.talentStageLog.create({
        data: {
          customerId: data.customerId,
          storeId: customer.storeId,
          fromStage: customer.talentStage,
          toStage: data.newStage,
          changedById: user.id,
          note: data.note ?? null,
        },
      }),
    ]);

    // 自動給分邏輯
    const { awardPoints } = await import("@/server/actions/points");

    try {
      // 升為 PARTNER → +100（僅首次）
      if (data.newStage === "PARTNER") {
        const alreadyAwarded = await prisma.pointRecord.findFirst({
          where: { customerId: data.customerId, type: "BECAME_PARTNER" },
          select: { id: true },
        });
        if (!alreadyAwarded) {
          await awardPoints({
            customerId: data.customerId,
            storeId: customer.storeId,
            type: "BECAME_PARTNER",
            note: "升為合作店長",
          });
        }

        // 推薦人獲得 REFERRAL_PARTNER +100（僅首次）
        if (customer.sponsorId) {
          const sponsorAlreadyAwarded = await prisma.pointRecord.findFirst({
            where: {
              customerId: customer.sponsorId,
              type: "REFERRAL_PARTNER",
              note: { contains: data.customerId },
            },
            select: { id: true },
          });
          if (!sponsorAlreadyAwarded) {
            const sponsor = await prisma.customer.findUnique({
              where: { id: customer.sponsorId },
              select: { storeId: true },
            });
            if (sponsor) {
              await awardPoints({
                customerId: customer.sponsorId,
                storeId: sponsor.storeId,
                type: "REFERRAL_PARTNER",
                note: `推薦的人升為合作店長 (${data.customerId})`,
              });
            }
          }
        }
      }

      // 升為 FUTURE_OWNER → +200（僅首次）
      if (data.newStage === "FUTURE_OWNER") {
        const alreadyAwarded = await prisma.pointRecord.findFirst({
          where: { customerId: data.customerId, type: "BECAME_FUTURE_OWNER" },
          select: { id: true },
        });
        if (!alreadyAwarded) {
          await awardPoints({
            customerId: data.customerId,
            storeId: customer.storeId,
            type: "BECAME_FUTURE_OWNER",
            note: "升為準店長",
          });
        }
      }
    } catch {
      console.error("[Points] Failed to award stage change points for", data.customerId);
    }

    revalidatePath("/dashboard/growth");
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/customers/${data.customerId}`);

    return { success: true, data: { customerId: data.customerId } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ── 設定推薦人 ─────────────────────────────

export async function setSponsor(
  input: unknown,
): Promise<ActionResult<{ customerId: string }>> {
  try {
    const user = await requirePermission("talent.manage");
    const data = setSponsorSchema.parse(input);

    // 防止自我推薦
    if (data.sponsorId && data.customerId === data.sponsorId) {
      throw new AppError("VALIDATION", "不能設定自己為推薦人");
    }

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, storeId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "找不到此顧客");
    assertStoreAccess(user, customer.storeId);

    // 驗證推薦人存在且同店
    if (data.sponsorId) {
      const sponsor = await prisma.customer.findUnique({
        where: { id: data.sponsorId },
        select: { id: true, storeId: true },
      });
      if (!sponsor) throw new AppError("NOT_FOUND", "找不到推薦人");
      if (sponsor.storeId !== customer.storeId) {
        throw new AppError("VALIDATION", "推薦人必須在同一間店");
      }
    }

    await prisma.customer.update({
      where: { id: data.customerId },
      data: { sponsorId: data.sponsorId },
    });

    revalidatePath("/dashboard/growth");
    revalidatePath(`/dashboard/customers/${data.customerId}`);

    return { success: true, data: { customerId: data.customerId } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ── 手動調整積分 ─────────────────────────────

export async function manualAdjustPoints(
  input: { customerId: string; points: number; note: string },
): Promise<ActionResult<{ customerId: string }>> {
  try {
    const user = await requirePermission("talent.manage");

    if (!input.points || input.points === 0) {
      throw new AppError("VALIDATION", "調整分數不可為 0");
    }
    if (!input.note?.trim()) {
      throw new AppError("VALIDATION", "手動調整必須填寫原因");
    }

    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, storeId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "找不到此顧客");
    assertStoreAccess(user, customer.storeId);

    const { awardPoints } = await import("@/server/actions/points");
    await awardPoints({
      customerId: input.customerId,
      storeId: customer.storeId,
      type: "MANUAL_ADJUSTMENT",
      note: input.note,
      pointsOverride: input.points,
    });

    revalidatePath(`/dashboard/customers/${input.customerId}`);
    revalidatePath("/dashboard/growth");

    return { success: true, data: { customerId: input.customerId } };
  } catch (e) {
    return handleActionError(e);
  }
}
