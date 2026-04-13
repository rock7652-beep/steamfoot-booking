"use client";

import { useState } from "react";
import { ReferralSection } from "./referral-section";
import { ReferralFormDialog } from "@/components/referral-form";
import type { ReferralStatus } from "@prisma/client";

interface ReferralItem {
  id: string;
  referredName: string;
  referredPhone: string | null;
  status: ReferralStatus;
  note: string | null;
  createdAt: string;
}

interface Props {
  customerId: string;
  referrals: ReferralItem[];
  canManage: boolean;
}

export function ReferralWrapper({ customerId, referrals, canManage }: Props) {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <ReferralSection
        customerId={customerId}
        referrals={referrals}
        canManage={canManage}
        onAddClick={() => setShowForm(true)}
      />
      {showForm && (
        <ReferralFormDialog
          referrerId={customerId}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}
