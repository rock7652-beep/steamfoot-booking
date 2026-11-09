import {assertSubscriptionReferralQa} from "../../../scripts/subscription-referral-qa-scope.mjs";
import {ReferralQaShell} from "@/components/subscription-referrals/qa-shell";
import DashboardLayout from "@/components/dashboard-layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  if(assertSubscriptionReferralQa())return <ReferralQaShell>{children}</ReferralQaShell>;
  return <DashboardLayout>{children}</DashboardLayout>;
}
