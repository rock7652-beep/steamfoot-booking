import { prisma } from "@/lib/db";
import { normalizeLineOfficialUrl } from "@/lib/line-official-url";
import { isReferralCodeFormat } from "@/lib/referral-code";

export type LineReferralEntryResult =
  | { status: "READY"; storeId: string; referrerId: string; lineOfficialUrl: string }
  | { status: "STORE_NOT_FOUND" | "STORE_UNAVAILABLE" | "LINE_NOT_CONFIGURED" | "INVALID_REFERRAL" };

export async function resolveLineReferralEntry(
  storeSlug: string | null,
  rawReferralCode: string | null,
): Promise<LineReferralEntryResult> {
  if (!storeSlug) return { status: "STORE_NOT_FOUND" };

  const store = await prisma.store.findUnique({
    where: { slug: storeSlug },
    select: {
      id: true,
      operatingStatus: true,
      shopConfig: { select: { lineOfficialUrl: true } },
    },
  });
  if (!store) return { status: "STORE_NOT_FOUND" };
  if (!["TRIAL", "ACTIVE"].includes(store.operatingStatus)) {
    return { status: "STORE_UNAVAILABLE" };
  }

  const lineOfficialUrl = normalizeLineOfficialUrl(store.shopConfig?.lineOfficialUrl);
  if (!lineOfficialUrl) return { status: "LINE_NOT_CONFIGURED" };

  const referralCode = rawReferralCode?.trim().toUpperCase() ?? "";
  if (!isReferralCodeFormat(referralCode)) return { status: "INVALID_REFERRAL" };

  const referrer = await prisma.customer.findFirst({
    where: { referralCode, storeId: store.id, mergedIntoCustomerId: null },
    select: { id: true },
  });
  if (!referrer) return { status: "INVALID_REFERRAL" };

  return {
    status: "READY",
    storeId: store.id,
    referrerId: referrer.id,
    lineOfficialUrl,
  };
}
