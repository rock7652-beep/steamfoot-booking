import { describe, expect, it } from "vitest";
import { evaluateSubscriptionReferral, planSubscriptionReferralRedemption, type SubscriptionReferralEvidence, type ReferralRedemptionInput } from "@/lib/subscription-referral-policy";

const now = new Date("2026-11-01T10:00:00+08:00");
function evidence(): SubscriptionReferralEvidence {
  return { relationId: "relation-a", referrerAccountId: "account-a", referredAccountId: "account-b", boundAt: new Date("2026-09-30T10:00:00+08:00"), identityReview: "DISTINCT", payment: { receiptId: "receipt-1", accountId: "account-b", isFirstPaidOrder: true, settledAt: new Date("2026-10-01T10:00:00+08:00"), activatedAt: new Date("2026-10-02T10:00:00+08:00"), refunded: false, refundCheckedAt: now } };
}
function subscription(): ReferralRedemptionInput {
  return { subscriptionId: "sub-a", status: "ACTIVE", expiresOn: "2026-11-01", billingCycle: "YEARLY" };
}
describe("subscription referral eligibility", () => {
  it("uses the later actual receipt/activation instant and waits the complete 30 days", () => {
    const input = evidence();input.payment.refundCheckedAt = new Date(now.getTime() - 1);
    expect(evaluateSubscriptionReferral(input, new Date(now.getTime() - 1))).toEqual({ state: "WAITING", eligibleAt: now });
    input.payment.refundCheckedAt = now;
    expect(evaluateSubscriptionReferral(input, now).state).toBe("ELIGIBLE");
    input.payment.settledAt = new Date("2026-10-03T10:00:00+08:00");
    expect(evaluateSubscriptionReferral(input, now)).toEqual({ state: "WAITING", eligibleAt: new Date("2026-11-02T10:00:00+08:00") });
  });
  it.each(["SELF_REFERRAL", "SAME_OPERATOR", "NOT_FIRST_PAYMENT", "REFUNDED", "LATE_BINDING", "PAYMENT_ACCOUNT_MISMATCH"] as const)("rejects %s before creating any reward intent", reason => {
    const input=evidence();
    if(reason==="SELF_REFERRAL")input.referrerAccountId=input.referredAccountId;
    if(reason==="SAME_OPERATOR")input.identityReview="SAME_OPERATOR";
    if(reason==="NOT_FIRST_PAYMENT")input.payment.isFirstPaidOrder=false;
    if(reason==="REFUNDED")input.payment.refunded=true;
    if(reason==="LATE_BINDING")input.boundAt=new Date("2026-10-01T10:00:01+08:00");
    if(reason==="PAYMENT_ACCOUNT_MISMATCH")input.payment.accountId="other-account";
    expect(evaluateSubscriptionReferral(input,now)).toEqual({state:"REJECTED",reason});
  });
  it("does not guess whether two accounts belong to distinct operators",()=>{
    const input=evidence();input.identityReview="UNVERIFIED";
    expect(evaluateSubscriptionReferral(input,now)).toEqual({state:"REVIEW_REQUIRED",reason:"IDENTITY_UNVERIFIED"});
  });
  it("requires a refund check at/after maturity",()=>{
    const input=evidence();input.payment.refundCheckedAt=new Date("2026-10-31T10:00:00+08:00");
    expect(evaluateSubscriptionReferral(input,now)).toEqual({state:"REVIEW_REQUIRED",reason:"REFUND_CHECK_REQUIRED"});
  });
  it("does not reuse an older refund snapshot after maturity",()=>{
    const input=evidence();input.payment.refundCheckedAt=new Date(now.getTime()-1);
    expect(evaluateSubscriptionReferral(input,new Date(now.getTime()+1000))).toEqual({state:"REVIEW_REQUIRED",reason:"REFUND_CHECK_REQUIRED"});
  });
  it("returns two distinct stable reward keys; a separate referral earns new keys",()=>{
    const input=evidence(),a=evaluateSubscriptionReferral(input,now),b=evaluateSubscriptionReferral(input,now);
    expect(a).toEqual(b);if(a.state!=="ELIGIBLE")throw Error("expected eligibility");
    expect(a.rewards.map(r=>[r.accountId,r.days])).toEqual([["account-a",30],["account-b",30]]);
    expect(new Set(a.rewards.map(r=>r.key)).size).toBe(2);
    const c=evaluateSubscriptionReferral({...input,relationId:"relation-b"},now);
    if(c.state!=="ELIGIBLE")throw Error("expected second eligibility");
    expect(c.rewards[0].key).not.toBe(a.rewards[0].key);
  });
  it("rejects invalid/future evidence instead of inferring payment times",()=>{
    const input=evidence();input.payment.settledAt=new Date("invalid");
    expect(()=>evaluateSubscriptionReferral(input,now)).toThrow("日期無效");
    input.payment.settledAt=new Date("2026-11-02T00:00:00+08:00");
    expect(()=>evaluateSubscriptionReferral(input,now)).toThrow("不可晚於");
  });
});
describe("subscription reward redemption plan",()=>{
  it("adds 30 calendar days after the existing inclusive expiry, retaining annual bonuses",()=>{
    expect(planSubscriptionReferralRedemption(subscription(),now)).toEqual({state:"READY",subscriptionId:"sub-a",previousExpiresOn:"2026-11-01",freeFromOn:"2026-11-02",newExpiresOn:"2026-12-01",days:30});
    const first=planSubscriptionReferralRedemption({...subscription(),expiresOn:"2026-12-31"},now);
    expect(first.state==="READY"&&first.newExpiresOn).toBe("2027-01-30");
  });
  it("allows active trial expiry extension without requiring a paid referrer status",()=>{
    expect(planSubscriptionReferralRedemption({...subscription(),status:"TRIAL",billingCycle:"NOT_REQUIRED"},now).state).toBe("READY");
  });
  it.each(["EXPIRED","CANCELLED","PENDING_ACTIVATION"] as const)("holds %s accounts instead of reopening access",status=>{
    expect(planSubscriptionReferralRedemption({...subscription(),status},now)).toEqual({state:"HELD",reason:"WAITING_REACTIVATION"});
  });
  it("uses Taiwan business dates across UTC midnight",()=>{
    expect(planSubscriptionReferralRedemption(subscription(),new Date("2026-11-01T16:00:00Z"))).toEqual({state:"HELD",reason:"WAITING_REACTIVATION"});
    expect(planSubscriptionReferralRedemption(subscription(),new Date("2026-11-01T15:59:59Z")).state).toBe("READY");
  });
  it("does not invent an expiry for unlimited or invalid subscriptions",()=>{
    expect(planSubscriptionReferralRedemption({...subscription(),expiresOn:null},now)).toEqual({state:"HELD",reason:"UNBOUNDED_SUBSCRIPTION"});
    expect(()=>planSubscriptionReferralRedemption({...subscription(),expiresOn:"2026-02-30"},now)).toThrow();
  });
  it("blocks monthly extension until the exact free period and subscription are confirmed",()=>{
    const monthly={...subscription(),billingCycle:"MONTHLY" as const};
    expect(planSubscriptionReferralRedemption(monthly,now)).toEqual({state:"HELD",reason:"BILLING_CONFIRMATION_REQUIRED"});
    const proof={reference:"billing-review-1",subscriptionId:"sub-a",freeFromOn:"2026-11-02",freeThroughOn:"2026-12-01",checkedAt:now};
    expect(planSubscriptionReferralRedemption({...monthly,billingConfirmation:proof},now).state).toBe("READY");
    for(const patch of [{subscriptionId:"other-sub"},{freeThroughOn:"2026-11-30"},{reference:""},{checkedAt:new Date("2026-11-02T10:00:00+08:00")}])expect(planSubscriptionReferralRedemption({...monthly,billingConfirmation:{...proof,...patch}},now).state).toBe("HELD");
  });
});
