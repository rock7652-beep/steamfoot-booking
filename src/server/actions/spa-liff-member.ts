"use server";

import { readFetchSpaLiffBookings, readFetchSpaLiffEntitlements } from "@/server/queries/spa-liff-member";
import { requireSession } from "@/lib/session";
import { requireSpaStore } from "@/lib/industry-module-server";
import { resolveCentralMemberCustomerForStore } from "@/server/services/central-member-resolver";
import { resolveMemberRequestStoreId } from "@/server/services/member-request-store";
import type { LiffBookingRow } from "@/server/actions/liff-my-bookings";
import type {
  LiffMakeupCreditRow,
  LiffWalletRow,
} from "@/server/actions/liff-my-wallets";

type SpaMemberContext = { storeId: string; customerId: string };

async function resolveSpaMemberContext(): Promise<SpaMemberContext | null> {
  let user;
  try {
    user = await requireSession();
  } catch {
    return null;
  }

  const storeId = await resolveMemberRequestStoreId(user.storeId ?? null);
  if (!storeId) return null;
  await requireSpaStore(storeId);

  // A fixed, verified user-to-customer membership is the authorization source.
  // Name and phone are deliberately not used to infer access.
  const membership = await resolveCentralMemberCustomerForStore(user.id, storeId);
  if (!membership) return null;
  return { storeId, customerId: membership.customerId };
}

export type SpaLiffBookingRow = LiffBookingRow & {
  endTime: string;
  serviceName: string;
  staffName: string;
  locationName: string;
};

export type FetchSpaLiffBookingsResult =
  | { status: "ok"; upcoming: SpaLiffBookingRow[]; history: SpaLiffBookingRow[] }
  | { status: "no_customer" }
  | { status: "service_unavailable" };

export async function fetchSpaLiffBookings(): Promise<FetchSpaLiffBookingsResult> {
  try {
    const context = await resolveSpaMemberContext();
    return context ? await readFetchSpaLiffBookings(context) : { status: "no_customer" };
  } catch (error) {
    console.error("[fetchSpaLiffBookings] failed", error);
    return { status: "service_unavailable" };
  }
}

export type FetchSpaLiffEntitlementsResult =
  | {
      status: "ok";
      active: LiffWalletRow[];
      expired: LiffWalletRow[];
      history: LiffWalletRow[];
      makeupCredits: LiffMakeupCreditRow[];
    }
  | { status: "no_customer" }
  | { status: "service_unavailable" };

export async function fetchSpaLiffEntitlements(): Promise<FetchSpaLiffEntitlementsResult> {
  try {
    const context = await resolveSpaMemberContext();
    return context ? await readFetchSpaLiffEntitlements(context) : { status: "no_customer" };
  } catch (error) {
    console.error("[fetchSpaLiffEntitlements] failed", error);
    return { status: "service_unavailable" };
  }
}
