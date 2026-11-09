"use server";

import { OperationTiming } from "@/lib/operation-timing";
import { fetchLiffMemberStoreContext } from "./liff-member-stores";
import { fetchLiffStaffAccess } from "./liff-staff-access";
import { fetchLiffWallets } from "./liff-my-wallets";
import { fetchLiffBookings } from "./liff-my-bookings";
import { fetchLiffHealthSummary } from "./liff-health";
import { fetchLiffReferralShareContext } from "./liff-referral-share";

/** Parallelize inside one request, retaining every reader's session/store authorization. */
export async function fetchLiffHomeAccess() {
  const timing = new OperationTiming("liff.home.access");
  try {
    const [memberContext, workAccess] = await Promise.all([
      timing.measure("memberships", () => fetchLiffMemberStoreContext().catch(() => null)),
      timing.measure("work_access", () => fetchLiffStaffAccess().catch(() => ({ status: "no_access" as const }))),
    ]);
    return { memberContext, workAccess };
  } finally { timing.finish(); }
}

/** No global result cache or caller-supplied identity; original readers remain authoritative. */
export async function fetchLiffHomeSummary(healthRequested: boolean) {
  const timing = new OperationTiming("liff.home.summary");
  try {
    const [wallets, bookings, health, referralShare] = await Promise.all([
      timing.measure("wallets", () => fetchLiffWallets()),
      timing.measure("bookings", () => fetchLiffBookings()),
      healthRequested === true ? timing.measure("health", () => fetchLiffHealthSummary()) : Promise.resolve(null),
      timing.measure("referral", () => fetchLiffReferralShareContext()),
    ]);
    return { wallets, bookings, health, referralShare };
  } finally { timing.finish(); }
}
