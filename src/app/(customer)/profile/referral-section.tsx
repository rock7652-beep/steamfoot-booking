"use client";

import { ShareReferral } from "@/components/share-referral";

interface Props {
  referralUrl: string;
  referralCount: number;
}

export function ReferralSection({ referralUrl, referralCount }: Props) {
  return <ShareReferral referralUrl={referralUrl} variant="full" referralCount={referralCount} />;
}
