import { z } from "zod";
import { parseTaipeiDateTime } from "./date-utils";
import { SUBSCRIPTION_REFERRAL_CODE_RE, normalizeSubscriptionReferralCode } from "./subscription-referral-code";
export const optionalSubscriptionReferralCode=z.string().max(40).transform(normalizeSubscriptionReferralCode).refine(v=>!v||SUBSCRIPTION_REFERRAL_CODE_RE.test(v),"推薦碼格式無效").optional();
const id=z.string().trim().min(1).max(200);
const checked=z.literal("on");
const taipeiTimestamp=z.string().max(30).refine(v=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)&&!!parseTaipeiDateTime(v.slice(0,10),v.slice(11)),"請填寫台灣時間的收款日期與時間").transform(v=>parseTaipeiDateTime(v.slice(0,10),v.slice(11))!);
export const referralBindSchema=z.object({leadId:id,storeId:id,confirmed:checked});
export const referralVerifySchema=z.object({commandId:z.string().uuid(),referralId:id,subscriptionId:id,receiptRef:id,settledAt:taipeiTimestamp,distinctOperator:checked,firstPaymentConfirmed:checked,refundStatus:z.enum(["CLEAR","REFUNDED"]),verificationRef:id});
export const referralApplySchema=z.object({rewardId:id,expectedExpiresOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),billingReference:z.string().trim().max(200).optional(),billingConfirmed:z.literal("on").optional()});

export const referralApplyBothSchema=z.object({
 referralId:id,
 referrerExpiresOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 referredExpiresOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 referrerBillingReference:z.string().trim().max(200).optional(),
 referredBillingReference:z.string().trim().max(200).optional(),
 billingConfirmed:z.literal("on").optional(),
});
