"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession, requireAdminSession } from "@/lib/session";
import { currentStoreId } from "@/lib/store";
import { AppError } from "@/lib/errors";
import { revalidateStorePlan, revalidateShopConfig } from "@/lib/revalidation";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import { updateTag } from "next/cache";
import type { PricingPlan, RequestType, RequestSource } from "@prisma/client";
import type { ActionResult } from "@/types";

const VALID_PLANS: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];
const PLAN_ORDER: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];
const SUBMIT_ROLES = ["ADMIN", "STORE_MANAGER"];

/** 計算下月 1 日 00:00 (UTC+8) */
function getNextMonthFirstDay(): Date {
  const now = new Date();
  const twNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = twNow.getUTCFullYear();
  const month = twNow.getUTCMonth() + 1;
  return month === 12
    ? new Date(Date.UTC(year + 1, 0, 1, -8))
    : new Date(Date.UTC(year, month, 1, -8));
}

// ============================================================
// 提交申請（升級 / 降級 / 續約）
// ============================================================

export async function submitUpgradeRequest(input: {
  requestedPlan: PricingPlan;
  requestType: RequestType;
  source: RequestSource;
  reason?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireStaffSession();

    if (!SUBMIT_ROLES.includes(user.role)) {
      return { success: false, error: "僅店長或管理員可提交申請" };
    }

    const storeId = currentStoreId(user);
    const { requestedPlan, requestType, source, reason, contactName, contactPhone, contactEmail } = input;

    if (!VALID_PLANS.includes(requestedPlan)) {
      return { success: false, error: "無效的方案" };
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { plan: true },
    });
    if (!store) {
      return { success: false, error: "店舖不存在" };
    }

    const currentIdx = PLAN_ORDER.indexOf(store.plan);
    const requestedIdx = PLAN_ORDER.indexOf(requestedPlan);

    // 方向驗證
    if (requestType === "UPGRADE" && requestedIdx <= currentIdx) {
      return { success: false, error: "升級申請必須選擇更高方案" };
    }
    if (requestType === "DOWNGRADE" && requestedIdx >= currentIdx) {
      return { success: false, error: "降級申請必須選擇更低方案" };
    }
    if (requestType === "RENEW" && requestedPlan !== store.plan) {
      return { success: false, error: "續約申請必須選擇目前方案" };
    }
    if (requestType !== "RENEW" && requestedPlan === store.plan) {
      return { success: false, error: "申請方案不可與目前方案相同" };
    }

    // 防重複
    const existing = await prisma.upgradeRequest.findFirst({
      where: { storeId, status: "PENDING", requestType },
    });
    if (existing) {
      return { success: false, error: "已有相同類型的待審核申請，請等候審核結果" };
    }

    const request = await prisma.upgradeRequest.create({
      data: {
        storeId,
        currentPlan: store.plan,
        requestedPlan,
        requestType,
        source,
        reason: reason?.trim() || null,
        contactName: contactName?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
        requestedBy: user.id,
      },
    });

    updateTag("upgrade-requests");
    revalidateStorePlan();

    return { success: true, data: { id: request.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}

// ============================================================
// 審核申請（ADMIN — 升級/降級/續約分支 + 付款流程）
// ============================================================

export async function reviewUpgradeRequest(input: {
  requestId: string;
  action: "APPROVED" | "REJECTED";
  reviewNote?: string;
  requiresPayment?: boolean;
}): Promise<ActionResult<void>> {
  try {
    const admin = await requireAdminSession();
    const { requestId, action, reviewNote, requiresPayment } = input;

    await prisma.$transaction(async (tx) => {
      const request = await tx.upgradeRequest.findUnique({
        where: { id: requestId },
      });
      if (!request) throw new AppError("NOT_FOUND", "申請不存在");
      if (request.status !== "PENDING") throw new AppError("CONFLICT", "此申請已被其他管理員處理");

      if (action === "APPROVED") {
        const store = await tx.store.findUnique({
          where: { id: request.storeId },
          select: { plan: true, planStatus: true, currentSubscriptionId: true },
        });
        if (!store) throw new AppError("NOT_FOUND", "店舖不存在");

        // 非續約時檢查方案一致性
        if (request.requestType !== "RENEW" && store.plan !== request.currentPlan) {
          throw new AppError(
            "CONFLICT",
            `店舖目前方案已變更為「${PRICING_PLAN_INFO[store.plan].label}」，與申請時不同，請確認後重新處理`
          );
        }

        // ── 需付款：暫停啟用，等 confirmUpgradePayment ──
        if (requiresPayment) {
          await tx.upgradeRequest.update({
            where: { id: requestId },
            data: {
              status: "APPROVED",
              billingStatus: "PENDING",
              reviewedBy: admin.id,
              reviewedAt: new Date(),
              reviewNote: reviewNote?.trim() || null,
            },
          });

          await tx.store.update({
            where: { id: request.storeId },
            data: { planStatus: "PAYMENT_PENDING" },
          });
          return; // 不繼續啟用
        }

        // ── DOWNGRADE：排程降級 ──
        if (request.requestType === "DOWNGRADE") {
          const effectiveAt = getNextMonthFirstDay();

          await tx.store.update({
            where: { id: request.storeId },
            data: { planStatus: "SCHEDULED_DOWNGRADE", planExpiresAt: effectiveAt },
          });

          await tx.storePlanChange.create({
            data: {
              storeId: request.storeId,
              changeType: "DOWNGRADE_SCHEDULED",
              fromPlan: request.currentPlan,
              toPlan: request.requestedPlan,
              fromStatus: store.planStatus ?? "ACTIVE",
              toStatus: "SCHEDULED_DOWNGRADE",
              requestId: request.id,
              operatorUserId: admin.id,
              reason: reviewNote?.trim() || null,
            },
          });

          await tx.upgradeRequest.update({
            where: { id: requestId },
            data: {
              status: "APPROVED",
              reviewedBy: admin.id,
              reviewedAt: new Date(),
              reviewNote: reviewNote?.trim() || null,
              effectiveAt,
            },
          });

        // ── RENEW：延長訂閱 ──
        } else if (request.requestType === "RENEW") {
          let newExpiresAt: Date;

          if (store.currentSubscriptionId) {
            const currentSub = await tx.storeSubscription.findUnique({
              where: { id: store.currentSubscriptionId },
            });
            const base = currentSub?.expiresAt ?? new Date();
            newExpiresAt = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

            await tx.storeSubscription.update({
              where: { id: store.currentSubscriptionId },
              data: { expiresAt: newExpiresAt, status: "ACTIVE" },
            });
          } else {
            newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          }

          await tx.store.update({
            where: { id: request.storeId },
            data: {
              planStatus: "ACTIVE",
              planExpiresAt: newExpiresAt,
            },
          });

          await tx.storePlanChange.create({
            data: {
              storeId: request.storeId,
              changeType: "PLAN_RENEWED",
              fromPlan: store.plan,
              toPlan: store.plan,
              fromStatus: store.planStatus ?? "ACTIVE",
              toStatus: "ACTIVE",
              requestId: request.id,
              subscriptionId: store.currentSubscriptionId ?? undefined,
              operatorUserId: admin.id,
              reason: reviewNote?.trim() || null,
            },
          });

          await tx.upgradeRequest.update({
            where: { id: requestId },
            data: {
              status: "APPROVED",
              reviewedBy: admin.id,
              reviewedAt: new Date(),
              reviewNote: reviewNote?.trim() || null,
              effectiveAt: new Date(),
            },
          });

        // ── UPGRADE / 其他：立即生效 ──
        } else {
          const subscription = await tx.storeSubscription.create({
            data: {
              storeId: request.storeId,
              plan: request.requestedPlan,
              status: "ACTIVE",
              startedAt: new Date(),
              billingStatus: "NOT_REQUIRED",
              sourceRequestId: request.id,
              createdBy: admin.id,
              note: reviewNote?.trim() || null,
            },
          });

          await tx.store.update({
            where: { id: request.storeId },
            data: {
              plan: request.requestedPlan,
              planStatus: "ACTIVE",
              planEffectiveAt: new Date(),
              planExpiresAt: null,
              currentSubscriptionId: subscription.id,
            },
          });

          await tx.storePlanChange.create({
            data: {
              storeId: request.storeId,
              changeType: "UPGRADE_APPROVED",
              fromPlan: request.currentPlan,
              toPlan: request.requestedPlan,
              fromStatus: store.planStatus ?? "ACTIVE",
              toStatus: "ACTIVE",
              requestId: request.id,
              subscriptionId: subscription.id,
              operatorUserId: admin.id,
              reason: reviewNote?.trim() || null,
            },
          });

          await tx.upgradeRequest.update({
            where: { id: requestId },
            data: {
              status: "APPROVED",
              reviewedBy: admin.id,
              reviewedAt: new Date(),
              reviewNote: reviewNote?.trim() || null,
              effectiveAt: new Date(),
            },
          });
        }
      } else {
        // ── 拒絕 ──
        await tx.upgradeRequest.update({
          where: { id: requestId },
          data: {
            status: "REJECTED",
            reviewedBy: admin.id,
            reviewedAt: new Date(),
            reviewNote: reviewNote?.trim() || null,
          },
        });
      }
    });

    revalidateStorePlan();
    revalidateShopConfig();

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof AppError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}

// ============================================================
// 確認付款（ADMIN — 付款後啟用方案）
// ============================================================

export async function confirmUpgradePayment(input: {
  requestId: string;
}): Promise<ActionResult<void>> {
  try {
    const admin = await requireAdminSession();
    const { requestId } = input;

    await prisma.$transaction(async (tx) => {
      const request = await tx.upgradeRequest.findUnique({
        where: { id: requestId },
      });
      if (!request) throw new AppError("NOT_FOUND", "申請不存在");
      if (request.status !== "APPROVED") throw new AppError("VALIDATION", "此申請尚未核准");
      if (request.billingStatus !== "PENDING") throw new AppError("VALIDATION", "此申請無需付款確認或已確認");

      const store = await tx.store.findUnique({
        where: { id: request.storeId },
        select: { plan: true, planStatus: true, currentSubscriptionId: true },
      });
      if (!store) throw new AppError("NOT_FOUND", "店舖不存在");

      if (request.requestType === "DOWNGRADE") {
        // 降級走排程
        const effectiveAt = getNextMonthFirstDay();
        await tx.store.update({
          where: { id: request.storeId },
          data: { planStatus: "SCHEDULED_DOWNGRADE", planExpiresAt: effectiveAt },
        });
        await tx.storePlanChange.create({
          data: {
            storeId: request.storeId,
            changeType: "DOWNGRADE_SCHEDULED",
            fromPlan: store.plan,
            toPlan: request.requestedPlan,
            fromStatus: "PAYMENT_PENDING",
            toStatus: "SCHEDULED_DOWNGRADE",
            requestId: request.id,
            operatorUserId: admin.id,
            reason: "付款確認後排程降級",
          },
        });
      } else if (request.requestType === "RENEW") {
        // 續約延長
        let newExpiresAt: Date;
        if (store.currentSubscriptionId) {
          const currentSub = await tx.storeSubscription.findUnique({
            where: { id: store.currentSubscriptionId },
          });
          const base = currentSub?.expiresAt ?? new Date();
          newExpiresAt = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
          await tx.storeSubscription.update({
            where: { id: store.currentSubscriptionId },
            data: { expiresAt: newExpiresAt, status: "ACTIVE" },
          });
        } else {
          newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
        await tx.store.update({
          where: { id: request.storeId },
          data: { planStatus: "ACTIVE", planExpiresAt: newExpiresAt },
        });
        await tx.storePlanChange.create({
          data: {
            storeId: request.storeId,
            changeType: "PAYMENT_CONFIRMED",
            fromPlan: store.plan,
            toPlan: store.plan,
            fromStatus: "PAYMENT_PENDING",
            toStatus: "ACTIVE",
            requestId: request.id,
            subscriptionId: store.currentSubscriptionId ?? undefined,
            operatorUserId: admin.id,
            reason: "付款確認，續約生效",
          },
        });
      } else {
        // 升級：建 subscription + 更新 Store.plan
        const subscription = await tx.storeSubscription.create({
          data: {
            storeId: request.storeId,
            plan: request.requestedPlan,
            status: "ACTIVE",
            startedAt: new Date(),
            billingStatus: "PAID",
            sourceRequestId: request.id,
            createdBy: admin.id,
            note: "付款確認後啟用",
          },
        });

        await tx.store.update({
          where: { id: request.storeId },
          data: {
            plan: request.requestedPlan,
            planStatus: "ACTIVE",
            planEffectiveAt: new Date(),
            planExpiresAt: null,
            currentSubscriptionId: subscription.id,
          },
        });

        await tx.storePlanChange.create({
          data: {
            storeId: request.storeId,
            changeType: "PAYMENT_CONFIRMED",
            fromPlan: request.currentPlan,
            toPlan: request.requestedPlan,
            fromStatus: "PAYMENT_PENDING",
            toStatus: "ACTIVE",
            requestId: request.id,
            subscriptionId: subscription.id,
            operatorUserId: admin.id,
            reason: "付款確認，方案啟用",
          },
        });
      }

      // 更新 request
      await tx.upgradeRequest.update({
        where: { id: requestId },
        data: {
          billingStatus: "PAID",
          effectiveAt: new Date(),
        },
      });
    });

    revalidateStorePlan();
    revalidateShopConfig();

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof AppError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}

// ============================================================
// ADMIN 手動調整方案（含留痕）
// ============================================================

export async function adminChangeStorePlan(input: {
  storeId: string;
  newPlan: PricingPlan;
  reason: string;
}): Promise<ActionResult<void>> {
  try {
    const admin = await requireAdminSession();
    const { storeId, newPlan, reason } = input;

    if (!VALID_PLANS.includes(newPlan)) return { success: false, error: "無效的方案" };
    if (!reason.trim()) return { success: false, error: "請填寫調整原因" };

    await prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { id: storeId },
        select: { plan: true, planStatus: true },
      });
      if (!store) throw new AppError("NOT_FOUND", "店舖不存在");
      if (store.plan === newPlan) throw new AppError("VALIDATION", "方案未變更");

      const subscription = await tx.storeSubscription.create({
        data: { storeId, plan: newPlan, status: "ACTIVE", startedAt: new Date(), billingStatus: "NOT_REQUIRED", createdBy: admin.id, note: reason.trim() },
      });

      await tx.store.update({
        where: { id: storeId },
        data: { plan: newPlan, planStatus: "ACTIVE", planEffectiveAt: new Date(), planExpiresAt: null, currentSubscriptionId: subscription.id },
      });

      await tx.storePlanChange.create({
        data: { storeId, changeType: "ADMIN_MANUAL_CHANGE", fromPlan: store.plan, toPlan: newPlan, fromStatus: store.planStatus ?? "ACTIVE", toStatus: "ACTIVE", subscriptionId: subscription.id, operatorUserId: admin.id, reason: reason.trim() },
      });
    });

    revalidateStorePlan();
    revalidateShopConfig();
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof AppError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}

// ============================================================
// 排程降級執行（單一 store）
// ============================================================

export async function applyScheduledDowngrade(storeId: string): Promise<ActionResult<void>> {
  try {
    await prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { id: storeId },
        select: { plan: true, planStatus: true, currentSubscriptionId: true },
      });
      if (!store) throw new AppError("NOT_FOUND", "店舖不存在");
      if (store.planStatus !== "SCHEDULED_DOWNGRADE") throw new AppError("VALIDATION", "此店舖未排定降級");

      const request = await tx.upgradeRequest.findFirst({
        where: { storeId, requestType: "DOWNGRADE", status: "APPROVED" },
        orderBy: { reviewedAt: "desc" },
      });
      if (!request) throw new AppError("NOT_FOUND", "找不到對應的降級申請");

      if (store.currentSubscriptionId) {
        await tx.storeSubscription.update({ where: { id: store.currentSubscriptionId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      }

      const newSub = await tx.storeSubscription.create({
        data: { storeId, plan: request.requestedPlan, status: "ACTIVE", startedAt: new Date(), billingStatus: "NOT_REQUIRED", sourceRequestId: request.id, note: "降級執行" },
      });

      await tx.store.update({
        where: { id: storeId },
        data: { plan: request.requestedPlan, planStatus: "ACTIVE", planEffectiveAt: new Date(), planExpiresAt: null, currentSubscriptionId: newSub.id },
      });

      await tx.storePlanChange.create({
        data: { storeId, changeType: "DOWNGRADE_EXECUTED", fromPlan: store.plan, toPlan: request.requestedPlan, fromStatus: "SCHEDULED_DOWNGRADE", toStatus: "ACTIVE", requestId: request.id, subscriptionId: newSub.id, reason: "排程降級自動執行" },
      });
    });

    revalidateStorePlan();
    revalidateShopConfig();
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof AppError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}

// ============================================================
// 批次處理排程降級（cron 用）
// ============================================================

export async function processScheduledDowngrades(): Promise<{ processed: number; errors: string[] }> {
  const stores = await prisma.store.findMany({
    where: { planStatus: "SCHEDULED_DOWNGRADE", planExpiresAt: { lte: new Date() } },
    select: { id: true, name: true },
  });

  let processed = 0;
  const errors: string[] = [];

  for (const store of stores) {
    try {
      const result = await applyScheduledDowngrade(store.id);
      if (result.success) { processed++; console.log(`[Downgrade] OK: ${store.name}`); }
      else { errors.push(`${store.name}: ${result.error}`); }
    } catch (e) { errors.push(`${store.name}: ${e instanceof Error ? e.message : "unknown"}`); }
  }

  return { processed, errors };
}

// ============================================================
// 批次處理試用到期（cron 用）
// ============================================================

export async function processExpiredTrials(): Promise<{ processed: number; errors: string[] }> {
  const stores = await prisma.store.findMany({
    where: { planStatus: "TRIAL", planExpiresAt: { lte: new Date() } },
    select: { id: true, name: true, plan: true, currentSubscriptionId: true },
  });

  let processed = 0;
  const errors: string[] = [];

  for (const store of stores) {
    try {
      await prisma.$transaction(async (tx) => {
        // 結束 trial subscription
        if (store.currentSubscriptionId) {
          await tx.storeSubscription.update({
            where: { id: store.currentSubscriptionId },
            data: { status: "EXPIRED", cancelledAt: new Date() },
          });
        }

        // 建新 EXPERIENCE subscription（回退最低方案）
        const newSub = await tx.storeSubscription.create({
          data: { storeId: store.id, plan: "EXPERIENCE", status: "ACTIVE", startedAt: new Date(), billingStatus: "NOT_REQUIRED", note: "試用到期，回退體驗版" },
        });

        // 更新 Store
        await tx.store.update({
          where: { id: store.id },
          data: { plan: "EXPERIENCE", planStatus: "EXPIRED", planEffectiveAt: new Date(), planExpiresAt: null, currentSubscriptionId: newSub.id },
        });

        // 寫 change log
        await tx.storePlanChange.create({
          data: { storeId: store.id, changeType: "PLAN_CANCELLED", fromPlan: store.plan, toPlan: "EXPERIENCE", fromStatus: "TRIAL", toStatus: "EXPIRED", subscriptionId: newSub.id, reason: "試用到期，自動回退體驗版" },
        });
      });

      processed++;
      console.log(`[Trial Expired] OK: ${store.name}`);
    } catch (e) {
      errors.push(`${store.name}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return { processed, errors };
}

// ============================================================
// ADMIN 開通試用
// ============================================================

export async function adminStartTrial(input: {
  storeId: string;
  trialPlan: PricingPlan;
  trialDays: number;
  reason?: string;
}): Promise<ActionResult<void>> {
  try {
    const admin = await requireAdminSession();
    const { storeId, trialPlan, trialDays, reason } = input;

    if (!VALID_PLANS.includes(trialPlan)) return { success: false, error: "無效的方案" };
    if (trialDays < 1 || trialDays > 90) return { success: false, error: "試用天數須介於 1~90 天" };

    await prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({ where: { id: storeId }, select: { plan: true, planStatus: true } });
      if (!store) throw new AppError("NOT_FOUND", "店舖不存在");

      const expiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

      const subscription = await tx.storeSubscription.create({
        data: { storeId, plan: trialPlan, status: "TRIAL", isTrial: true, startedAt: new Date(), expiresAt, billingStatus: "NOT_REQUIRED", createdBy: admin.id, note: reason?.trim() || `試用 ${trialDays} 天` },
      });

      await tx.store.update({
        where: { id: storeId },
        data: { plan: trialPlan, planStatus: "TRIAL", planEffectiveAt: new Date(), planExpiresAt: expiresAt, currentSubscriptionId: subscription.id },
      });

      await tx.storePlanChange.create({
        data: { storeId, changeType: "TRIAL_STARTED", fromPlan: store.plan, toPlan: trialPlan, fromStatus: store.planStatus ?? "ACTIVE", toStatus: "TRIAL", subscriptionId: subscription.id, operatorUserId: admin.id, reason: reason?.trim() || `試用 ${trialDays} 天` },
      });
    });

    revalidateStorePlan();
    revalidateShopConfig();
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof AppError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}
