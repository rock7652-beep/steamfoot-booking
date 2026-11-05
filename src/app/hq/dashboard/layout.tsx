import {assertSubscriptionReferralQa} from "../../../../scripts/subscription-referral-qa-scope.mjs";
import {ReferralQaShell} from "@/components/subscription-referrals/qa-shell";
import DashboardLayout from "@/components/dashboard-layout";

/** HQ-only pages share the same chrome without a selected store's module redirects. */
export default function HqLayout({ children }: { children: React.ReactNode }) {
  if(assertSubscriptionReferralQa())return <ReferralQaShell>{children}</ReferralQaShell>;
  return <DashboardLayout hqPlatform>{children}</DashboardLayout>;
}
