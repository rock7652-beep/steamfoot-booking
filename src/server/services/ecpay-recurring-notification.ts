import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addTaiwanDuration, parseTaiwanDateToDbDate, toLocalDateStr, parseTaipeiDateTime } from "@/lib/date-utils";
import { getEcpayRecurringCredentials, type EcpayFields, verifyEcpayCheckMacValue } from "@/lib/ecpay-recurring";
import { cancelEcpayAgreementIfEligible } from "@/server/services/ecpay-recurring-cancel";

export type EcpayNotificationResult = { status: "accepted" | "duplicate" };

export class InvalidEcpayNotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEcpayNotificationError";
  }
}

function getInt(fields: EcpayFields, name: string): number | null {
  const value = Number(fields[name]);
  return Number.isSafeInteger(value) ? value : null;
}

function getTaiwanProcessDate(value: EcpayFields["ProcessDate"]): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return parseTaipeiDateTime(`${match[1]}-${match[2]}-${match[3]}`, `${match[4]}:${match[5]}`);
}

export async function processEcpayRecurringNotification(fields: EcpayFields): Promise<EcpayNotificationResult> {
  const credentials = getEcpayRecurringCredentials();
  if (fields.MerchantID !== credentials.merchantId || !verifyEcpayCheckMacValue(fields, credentials)) {
    throw new InvalidEcpayNotificationError("ECPay notification signature is invalid");
  }
  const merchantTradeNo = fields.MerchantTradeNo;
  if (typeof merchantTradeNo !== "string" || !/^[A-Za-z0-9]{1,20}$/.test(merchantTradeNo)) {
    throw new InvalidEcpayNotificationError("ECPay notification trade number is invalid");
  }
  const agreement = await prisma.ecpayRecurringAgreement.findUnique({
    where: { merchantTradeNo },
    include: { subscription: true },
  });
  if (!agreement) throw new InvalidEcpayNotificationError("ECPay notification agreement was not found");

  const rtnCode = getInt(fields, "RtnCode");
  const receivedAmount = getInt(fields, "Amount") ?? getInt(fields, "TotalAmount");
  const successTimes = getInt(fields, "TotalSuccessTimes");
  if (rtnCode === null) throw new InvalidEcpayNotificationError("ECPay notification result code is invalid");
  const isSuccess = rtnCode === 1 && receivedAmount === agreement.monthlyAmount;
  const isSimulated = getInt(fields, "SimulatePaid") === 1;
  const canonical = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
  const eventKey = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  const paymentAt = getTaiwanProcessDate(fields.ProcessDate) ?? new Date();

  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ecpay-recurring:${agreement.storeId}`}, 0))`;
      const currentAgreement = await tx.ecpayRecurringAgreement.findUnique({
        where: { id: agreement.id },
        include: { subscription: true },
      });
      if (!currentAgreement) throw new InvalidEcpayNotificationError("ECPay notification agreement was not found");
      await tx.ecpayRecurringPaymentEvent.create({
        data: {
          agreementId: currentAgreement.id,
          eventKey,
          merchantTradeNo,
          providerTradeNo: typeof fields.gwsr === "string" ? fields.gwsr : null,
          rtnCode,
          amount: receivedAmount,
          totalSuccessTimes: successTimes,
          processDate: typeof fields.ProcessDate === "string" ? fields.ProcessDate : null,
          simulatedPaid: isSimulated,
        },
      });

      if (isSimulated) return;
      if (!isSuccess) {
        await tx.ecpayRecurringAgreement.update({
          where: { id: currentAgreement.id },
          data: { status: currentAgreement.status === "PENDING_AUTHORIZATION" ? "PAST_DUE" : currentAgreement.status, lastProviderCode: String(rtnCode), lastProviderMessage: String(fields.RtnMsg ?? "付款失敗").slice(0, 200) },
        });
        await tx.storeSubscription.update({
          where: { id: currentAgreement.subscriptionId },
          data: { billingStatus: "FAILED" },
        });
        return;
      }

      const paymentCount = Math.max(currentAgreement.successfulPaymentCount + 1, successTimes ?? 0);
      const isFirstPayment = currentAgreement.successfulPaymentCount === 0;
      const startDate = isFirstPayment ? toLocalDateStr(paymentAt) : toLocalDateStr(currentAgreement.subscription.startedAt);
      const periodEnd = parseTaiwanDateToDbDate(addTaiwanDuration(
        addTaiwanDuration(startDate, paymentCount, "MONTH"),
        -1,
        "DAY",
      ));
      await tx.ecpayRecurringAgreement.update({
        where: { id: currentAgreement.id },
        data: {
          status: currentAgreement.status === "CANCEL_REQUESTED" ? "CANCEL_REQUESTED" : "ACTIVE",
          successfulPaymentCount: paymentCount,
          lastPaymentAt: paymentAt,
          lastProviderCode: String(rtnCode),
          lastProviderMessage: String(fields.RtnMsg ?? "付款成功").slice(0, 200),
        },
      });
      await tx.storeSubscription.update({
        where: { id: currentAgreement.subscriptionId },
        data: {
          status: "ACTIVE",
          billingStatus: "PAID",
          paymentMethod: "CREDIT_CARD",
          startedAt: isFirstPayment ? paymentAt : currentAgreement.subscription.startedAt,
          effectiveAt: isFirstPayment ? paymentAt : currentAgreement.subscription.effectiveAt,
          expiresAt: periodEnd,
        },
      });
      const store = await tx.store.findUniqueOrThrow({
        where: { id: agreement.storeId },
        select: { plan: true, planStatus: true, currentSubscriptionId: true },
      });
      if (isFirstPayment) {
        if (store.currentSubscriptionId && store.currentSubscriptionId !== currentAgreement.subscriptionId) {
          await tx.storeSubscription.update({
            where: { id: store.currentSubscriptionId },
            data: { status: "CANCELLED", cancelledAt: paymentAt },
          });
        }
        await tx.store.update({
          where: { id: agreement.storeId },
          data: {
            plan: agreement.plan,
            planStatus: "ACTIVE",
            planEffectiveAt: paymentAt,
            planExpiresAt: periodEnd,
            currentSubscriptionId: currentAgreement.subscriptionId,
          },
        });
        await tx.storePlanChange.create({
          data: {
            storeId: agreement.storeId,
            changeType: "PAYMENT_CONFIRMED",
            fromPlan: store.plan,
            toPlan: agreement.plan,
            fromStatus: store.planStatus,
            toStatus: "ACTIVE",
            subscriptionId: currentAgreement.subscriptionId,
            reason: "綠界信用卡定期扣款首次授權成功",
            metadataJson: { merchantTradeNo, amount: currentAgreement.monthlyAmount, totalSuccessTimes: paymentCount },
          },
        });
      } else if (store.currentSubscriptionId === currentAgreement.subscriptionId) {
        await tx.store.update({ where: { id: agreement.storeId }, data: { planExpiresAt: periodEnd } });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await cancelEcpayAgreementIfEligible(agreement.id);
      return { status: "duplicate" };
    }
    throw error;
  }
  if (isSuccess && !isSimulated) await cancelEcpayAgreementIfEligible(agreement.id);
  return { status: "accepted" };
}
