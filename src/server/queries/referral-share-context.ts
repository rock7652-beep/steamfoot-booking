import { prisma } from "@/lib/db";
import { normalizeLineOfficialUrl } from "@/lib/line-official-url";
import { buildReferralEntryUrl } from "@/lib/share";

export type ReferralShareContext =
  | {
      available: true;
      storeName: string;
      referralUrl: string;
      shareTemplate: string | null;
    }
  | {
      available: false;
      reason:
        | "STORE_UNAVAILABLE"
        | "LINE_NOT_CONFIGURED"
        | "REFERRAL_CODE_MISSING";
    };

/** 由 server 驗證顧客歸屬與店舖設定，client 不接觸 LINE 目的地。 */
export async function getReferralShareContext(input: {
  customerId: string;
  storeId: string;
  storeSlug: string;
}): Promise<ReferralShareContext> {
  const customer = await prisma.customer.findFirst({
    where: {
      id: input.customerId,
      storeId: input.storeId,
      mergedIntoCustomerId: null,
    },
    select: {
      id: true,
      referralCode: true,
      store: {
        select: {
          name: true,
          slug: true,
          operatingStatus: true,
          shopConfig: {
            select: {
              lineOfficialUrl: true,
              referralShareTemplate: true,
            },
          },
        },
      },
    },
  });

  if (
    !customer ||
    customer.store.slug !== input.storeSlug ||
    !["TRIAL", "ACTIVE"].includes(customer.store.operatingStatus)
  ) {
    return { available: false, reason: "STORE_UNAVAILABLE" };
  }
  if (!normalizeLineOfficialUrl(customer.store.shopConfig?.lineOfficialUrl)) {
    return { available: false, reason: "LINE_NOT_CONFIGURED" };
  }

  return {
    available: true,
    storeName: customer.store.name,
    referralUrl: buildReferralEntryUrl(
      customer.store.slug,
      customer.referralCode ?? customer.id,
    ),
    shareTemplate: customer.store.shopConfig?.referralShareTemplate ?? null,
  };
}
