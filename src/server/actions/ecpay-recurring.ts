"use server";

import { createHash, randomBytes } from "node:crypto";
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import type { PricingPlan } from "@prisma/client";
import type { ActionResult } from "@/types";
import { cancelEcpayAgreementIfEligible } from "@/server/services/ecpay-recurring-cancel";

const MONTHLY_PRICES: Record<Exclude<PricingPlan, "EXPERIENCE">, number> = {
  BASIC: 1490,
  GROWTH: 2490,
  ALLIANCE: 2980,
};
const TERMS_VERSION = "monthly-12m-renewal-2026-10-13-v1";

function termsSnapshot(planName: string, amount: number): string {
  return [
    `方案：${planName}月繳，NT$${amount.toLocaleString("zh-TW")}／月。`,
    `最低承諾期間 12 個月，按月收取 12 期，主方案總額 NT$${(amount * 12).toLocaleString("zh-TW")}；月繳不含年繳贈送月份。`,
    "最低承諾期間內因店家自身需求提前取消或停止使用，仍須支付原訂單尚未到期的期款，服務可使用至原約定期間屆滿。",
    "最低承諾期滿後按月續約，維持本訂單月費；可在下一次扣款日前依取消與退費政策提出取消。調整月費須事前通知，必要時重新取得付款授權。",
    "本次付款將授權綠界科技依每月週期向此信用卡扣款。付款成功後服務開通；首次授權失敗則不會啟動定期扣款。信用卡資料由綠界處理，蒸管家不保存完整卡號或安全碼。",
    "除服務條款及取消與退費政策列明的例外或依法應退費情形外，依約支付的服務費用不因自行停止使用而按未使用天數退還。",
  ].join("\n");
}

function baseUrl() {
  const value = process.env.ECPAY_CALLBACK_BASE_URL ?? process.env.NEXTAUTH_URL;
  if (!value) throw new AppError("VALIDATION", "尚未設定付款回傳網址");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new AppError("VALIDATION", "正式環境付款回傳網址必須使用 HTTPS");
  }
  return parsed.origin;
}

export async function createEcpayRecurringCheckoutLink(input: {
  storeId: string;
  plan: Exclude<PricingPlan, "EXPERIENCE">;
}): Promise<ActionResult<{ url: string }>> {
  try {
    const actor = await requireStaffSession();
    if (getEffectiveActorRole(actor) !== "ADMIN") {
      throw new AppError("FORBIDDEN", "此功能僅限總部管理者");
    }
    if (!(input.plan in MONTHLY_PRICES)) throw new AppError("VALIDATION", "此方案不支援月繳");

    const store = await prisma.store.findUnique({
      where: { id: input.storeId },
      select: { id: true, name: true, isDemo: true, currentSubscription: { select: { status: true } } },
    });
    if (!store) throw new AppError("NOT_FOUND", "店舖不存在");
    if (store.isDemo) throw new AppError("VALIDATION", "展示店不支援建立正式付款連結");
    if (store.currentSubscription?.status === "ACTIVE") {
      throw new AppError("CONFLICT", "此店已有正式訂閱；請先確認既有合約的續約日期，再建立月繳訂單");
    }

    const amount = MONTHLY_PRICES[input.plan];
    const planName = input.plan === "BASIC" ? "基本版" : input.plan === "GROWTH" ? "專業版" : "展店版";
    const token = randomBytes(32).toString("base64url");
    const checkoutTokenHash = createHash("sha256").update(token).digest("hex");
    const merchantTradeNo = randomBytes(10).toString("hex");
    const origin = baseUrl();
    const now = new Date();
    const tokenExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const snapshot = termsSnapshot(planName, amount);

    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`subscription:${store.id}`}, 0))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ecpay-recurring:${store.id}`}, 0))`;
      const freshStore = await tx.store.findUniqueOrThrow({
        where: { id: store.id },
        select: { currentSubscription: { select: { status: true } } },
      });
      if (freshStore.currentSubscription?.status === "ACTIVE") {
        throw new AppError("CONFLICT", "此店已有正式訂閱；請先確認既有合約的續約日期，再建立月繳訂單");
      }
      const pending = await tx.ecpayRecurringAgreement.findFirst({
        where: {
          storeId: store.id,
          OR: [
            { status: { in: ["ACTIVE", "CANCEL_REQUESTED"] } },
            { status: "PENDING_AUTHORIZATION", tokenExpiresAt: { gt: now } },
          ],
        },
        select: { id: true },
      });
      if (pending) throw new AppError("CONFLICT", "此店已有待授權或使用中的信用卡定期扣款");
      const expired = await tx.ecpayRecurringAgreement.findMany({
        where: { storeId: store.id, status: "PENDING_AUTHORIZATION", tokenExpiresAt: { lte: now } },
        select: { id: true, subscriptionId: true },
      });
      if (expired.length) {
        await tx.ecpayRecurringAgreement.updateMany({
          where: { id: { in: expired.map(item => item.id) } },
          data: { status: "CANCELLED", cancelledAt: now, lastProviderCode: "CHECKOUT_EXPIRED", lastProviderMessage: "付款連結已逾期，尚未授權" },
        });
        await tx.storeSubscription.updateMany({
          where: { id: { in: expired.map(item => item.subscriptionId) } },
          data: { status: "CANCELLED", cancelledAt: now },
        });
      }
      const subscription = await tx.storeSubscription.create({
        data: {
          storeId: store.id,
          plan: input.plan,
          status: "PAYMENT_PENDING",
          startedAt: now,
          billingCycle: "MONTHLY",
          billingStatus: "PENDING",
          paymentMethod: "CREDIT_CARD",
          priceAmount: amount * 12,
          priceCurrency: "TWD",
          createdBy: actor.id,
          updatedBy: actor.id,
          note: "信用卡定期扣款，等待店家於綠界完成首次授權。",
        },
      });
      await tx.ecpayRecurringAgreement.create({
        data: {
          storeId: store.id,
          subscriptionId: subscription.id,
          merchantTradeNo,
          checkoutTokenHash,
          plan: input.plan,
          monthlyAmount: amount,
          initialTermMonths: 12,
          termsVersion: TERMS_VERSION,
          termsSnapshot: snapshot,
          tokenExpiresAt,
          createdBy: actor.id,
        },
      });
    });
    return { success: true, data: { url: `${origin}/checkout/monthly/${token}` } };
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.message };
    return { success: false, error: error instanceof Error ? error.message : "付款連結建立失敗" };
  }
}

export async function requestEcpayRecurringCancellation(input: {
  agreementId: string;
}): Promise<ActionResult<{ scheduled: boolean }>> {
  try {
    const actor = await requireStaffSession();
    if (getEffectiveActorRole(actor) !== "ADMIN") {
      throw new AppError("FORBIDDEN", "此功能僅限總部管理者");
    }
    const agreement = await prisma.ecpayRecurringAgreement.findUnique({ where: { id: input.agreementId } });
    if (!agreement) throw new AppError("NOT_FOUND", "找不到信用卡定期扣款紀錄");
    if (agreement.status === "CANCELLED") return { success: true, data: { scheduled: false } };

    if (agreement.status === "PENDING_AUTHORIZATION" || (agreement.status === "PAST_DUE" && agreement.successfulPaymentCount === 0)) {
      const now = new Date();
      await prisma.$transaction(async tx => {
        await tx.ecpayRecurringAgreement.update({ where: { id: agreement.id }, data: { status: "CANCELLED", cancelledAt: now, lastProviderCode: "CANCELLED_BEFORE_AUTH", lastProviderMessage: "首次扣款成功前已取消" } });
        await tx.storeSubscription.update({ where: { id: agreement.subscriptionId }, data: { status: "CANCELLED", cancelledAt: now } });
      });
      return { success: true, data: { scheduled: false } };
    }

    const cancelAfterSuccessCount = Math.max(agreement.initialTermMonths, agreement.successfulPaymentCount);
    await prisma.ecpayRecurringAgreement.update({
      where: { id: agreement.id },
      data: { status: "CANCEL_REQUESTED", cancelRequestedAt: agreement.cancelRequestedAt ?? new Date(), cancelAfterSuccessCount },
    });
    if (agreement.successfulPaymentCount < cancelAfterSuccessCount) {
      return { success: true, data: { scheduled: true } };
    }
    await cancelEcpayAgreementIfEligible(agreement.id);
    return { success: true, data: { scheduled: false } };
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.message };
    return { success: false, error: error instanceof Error ? error.message : "取消定期扣款失敗" };
  }
}
