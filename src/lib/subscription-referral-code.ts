/** Subscription referrals are separate from Customer referral/points codes. */
export const SUBSCRIPTION_REFERRAL_CODE_RE = /^SB-[A-HJ-NP-Z2-9]{8}$/;
export function normalizeSubscriptionReferralCode(value: string): string {
  return value.trim().toUpperCase();
}
export function subscriptionReferralLink(code: string, shareOrigin = "https://www.steamfoot.com"): string {
  if (!SUBSCRIPTION_REFERRAL_CODE_RE.test(code)) throw new Error("推薦碼格式無效");
  const origin = new URL(shareOrigin);
  if (origin.protocol !== "https:" || origin.origin !== shareOrigin) throw new Error("推薦連結網址無效");
  return `${origin.origin}/apply?ref=${encodeURIComponent(code)}`;
}
