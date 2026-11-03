import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { getConfiguredStoreLine, storeLineIdentityProvider } from "@/lib/store-line-config";
import { LineIdentityReviewError } from "./line-identity-review";
import { resolveVerifiedLineCustomer } from "./verified-line-customer";

type Identity = { storeId: string; lineUserId: string; identityProvider: string };
type Tx = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
type Result = { status: "ok" | "invalid_phone" | "identity_review_required" | "service_unavailable" };

/** Only the caller's server-verified LINE subject is accepted. This creates a
 * NEW store membership, never recovers or takes over an existing Customer.
 * The primary identity connection is intentional: the restricted Beauty role
 * must not gain permission to write User / Account / CustomerIdentityLink.
 */
async function inspectNewMembership(tx: Tx, input: Identity, phone: string | null = null) {
  const config = getConfiguredStoreLine(input.storeId);
  if (!config || storeLineIdentityProvider(config) !== input.identityProvider) return null;
  // Same lock as Beauty booking/customer writers; recheck module, store status
  // and LIFF configuration inside the transaction, including direct submits.
  const stores = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Store" WHERE id=${input.storeId} AND slug=${config.slug}
    AND "industryModule"::text='BEAUTY' AND "operatingStatus"::text IN ('ACTIVE','TRIAL')
    AND ("liffId" IS NULL OR "liffId"=${config.liffId}) FOR UPDATE`;
  if (stores.length !== 1) return null;
  const accounts = await tx.$queryRaw<Array<{ userId: string; status: string }>>`
    SELECT a."userId",u.status::text FROM "Account" a JOIN "User" u ON u.id=a."userId"
    WHERE a.provider=${input.identityProvider} AND a."providerAccountId"=${input.lineUserId} FOR UPDATE OF a,u`;
  if (accounts.length > 1 || accounts.some(a => a.status !== "ACTIVE")) return null;
  const userId = accounts[0]?.userId ?? null;
  // Check ALL own-store history, including merged/blocked rows. A matching
  // phone is only a conflict signal, never proof of ownership. Other stores'
  // phone numbers and memberships are not imported or changed.
  const customers = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Customer" WHERE "storeId"=${input.storeId}
    AND ("lineUserId"=${input.lineUserId} OR "userId"=${userId}::text OR phone=${phone}::text) LIMIT 1`;
  const links = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "CustomerIdentityLink" WHERE "storeId"=${input.storeId}
    AND ((provider=${input.identityProvider} AND "providerAccountId"=${input.lineUserId})
      OR "userId"=${userId}::text) LIMIT 1`;
  const unlinks = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "CentralMemberLinkReviewRequest" WHERE "storeId"=${input.storeId}
    AND "userId"=${userId}::text AND type::text='UNLINK_REQUEST'
    AND status::text IN ('PENDING','APPROVED') LIMIT 1`;
  if (customers.length || links.length || unlinks.length) return null;
  return { userId };
}

/** Read-only eligibility. Offering the form does not grant a session or a
 * membership; submit repeats every check under the same store lock. */
export async function canOnboardVerifiedBeautyMember(input: Identity): Promise<boolean> {
  return prisma.$transaction(async tx => Boolean(await inspectNewMembership(tx, input)), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function onboardVerifiedBeautyMember(input: Identity & {
  name: string; phone: string; lineName: string | null;
}): Promise<Result> {
  const phone = normalizePhone(input.phone);
  if (!/^09\d{8}$/.test(phone)) return { status: "invalid_phone" };
  const name = input.name.trim();
  if (!name || name.length > 50) return { status: "service_unavailable" };
  try {
    // Repeated submissions for an already verified member are harmless. Do
    // not update their profile from the submitted name/phone.
    try {
      if (await resolveVerifiedLineCustomer(input.storeId, input.lineUserId, {
        identityProvider: input.identityProvider, explainFailure: true,
      })) return { status: "ok" };
    } catch (error) {
      if (!(error instanceof LineIdentityReviewError)) throw error;
      if (error.reason !== "store_membership_unconfirmed") return { status: "identity_review_required" };
    }
    return await prisma.$transaction(async tx => {
      const eligible = await inspectNewMembership(tx, input, phone);
      if (!eligible) return { status: "identity_review_required" as const };
      const userId = eligible.userId ?? randomUUID();
      const customerId = randomUUID();
      if (!eligible.userId) {
        // Submitted phone is a store contact number, NOT a global login claim.
        await tx.$executeRaw`INSERT INTO "User" (id,name,role,status,"createdAt","updatedAt")
          VALUES (${userId},${name},'CUSTOMER','ACTIVE',NOW(),NOW())`;
        await tx.$executeRaw`INSERT INTO "Account" (id,"userId",type,provider,"providerAccountId")
          VALUES (${randomUUID()},${userId},'oauth',${input.identityProvider},${input.lineUserId})`;
      }
      // Existing global users retain their role, profile and legacy Customer.
      // The scoped link authorizes the CUSTOMER-context session, not staff access.
      await tx.$executeRaw`INSERT INTO "Customer"
        (id,"storeId",name,phone,"authSource","customerStage","selfBookingEnabled",
          "lineUserId","lineName","lineLinkStatus","lineLinkedAt","createdAt","updatedAt")
        VALUES (${customerId},${input.storeId},${name},${phone},'LINE','LEAD',false,
          ${input.identityProvider === "line" ? input.lineUserId : null},${input.lineName ?? name},'LINKED',NOW(),NOW(),NOW())`;
      await tx.$executeRaw`INSERT INTO "CustomerIdentityLink"
        (id,"userId","storeId","customerId",provider,"providerAccountId","lineUserId","createdAt","updatedAt")
        VALUES (${randomUUID()},${userId},${input.storeId},${customerId},${input.identityProvider},${input.lineUserId},${input.lineUserId},NOW(),NOW())`;
      return { status: "ok" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch {
    // Unique/serialization/write failures roll back ALL identity rows. Do not
    // emit tokens, names, phones, raw subjects or database error details.
    console.warn("[beauty-line-onboarding] registration_unavailable", { storeId: input.storeId });
    return { status: "service_unavailable" };
  }
}
