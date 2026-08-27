"use server";

import { getCanonicalCustomerIdForSession } from "@/lib/customer-identity";
import { requireSession } from "@/lib/session";
import { getReferralShareContext } from "@/server/queries/referral-share-context";

export type LiffReferralShareContext = {
  storeName: string;
  referralUrl: string;
  shareTemplate: string | null;
  address: string | null;
  mapUrl: string | null;
};

export type FetchLiffReferralShareContextResult =
  | { status: "ok"; context: LiffReferralShareContext }
  | { status: "unavailable" };

/**
 * LIFF 首頁分享 context。零 client 參數，店別與顧客完全取自已驗證 session。
 */
export async function fetchLiffReferralShareContext(): Promise<FetchLiffReferralShareContextResult> {
  try {
    const user = await requireSession();
    if (
      user.role !== "CUSTOMER" ||
      !user.storeId ||
      !user.storeSlug
    ) {
      return { status: "unavailable" };
    }
    const customerId = await getCanonicalCustomerIdForSession(user);
    if (!customerId) return { status: "unavailable" };

    const context = await getReferralShareContext({
      customerId,
      storeId: user.storeId,
      storeSlug: user.storeSlug,
    });
    if (!context.available) return { status: "unavailable" };

    return {
      status: "ok",
      context: {
        storeName: context.storeName,
        referralUrl: context.publicTrialReferralUrl,
        shareTemplate: context.shareTemplate,
        address: context.address,
        mapUrl: context.mapUrl,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}
