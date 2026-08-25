"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";
import { resolveCentralMembershipsForUser } from "@/server/services/central-member-resolver";

async function resolveConsentContext() {
  const [session, store] = await Promise.all([requireSession(), getStoreContext()]);
  if (session.role !== "CUSTOMER" || !store?.storeId) return null;

  const resolvedCustomer = await resolveCustomerForUser({
    userId: session.id,
    sessionCustomerId: session.customerId ?? null,
    sessionEmail: session.email ?? null,
    storeId: store.storeId,
    storeSlug: store.storeSlug,
  });
  if (!resolvedCustomer.customer) return null;

  const central = await resolveCentralMembershipsForUser(session.id);
  const target = central.memberships.find(
    (membership) =>
      membership.storeId === store.storeId &&
      membership.customerId === resolvedCustomer.customer?.id,
  );
  if (!target || central.memberships.length < 2) return null;

  return {
    userId: session.id,
    storeId: store.storeId,
    storeSlug: store.storeSlug,
    customerId: target.customerId,
    verifiedStoreCount: central.memberships.length,
  };
}

export async function grantCurrentStoreHealthHistoryAccess(): Promise<void> {
  const context = await resolveConsentContext();
  if (!context) redirect("/?healthConsent=invalid");

  try {
    await prisma.$transaction(async (tx) => {
      const target = await tx.customer.findFirst({
        where: {
          id: context.customerId,
          storeId: context.storeId,
          mergedIntoCustomerId: null,
        },
        select: { id: true },
      });
      if (!target) throw new Error("CONSENT_TARGET_INVALID");

      const existing = await tx.customerHealthHistoryGrant.findFirst({
        where: {
          userId: context.userId,
          targetStoreId: context.storeId,
          targetCustomerId: context.customerId,
          revokedAt: null,
        },
        select: { id: true },
      });
      if (existing) return;

      const grant = await tx.customerHealthHistoryGrant.create({
        data: {
          userId: context.userId,
          targetStoreId: context.storeId,
          targetCustomerId: context.customerId,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: context.userId,
          targetType: "CustomerHealthHistoryGrant",
          targetId: grant.id,
          action: "GRANT_HEALTH_HISTORY_ACCESS",
          afterJson: {
            targetStoreId: context.storeId,
            targetCustomerId: context.customerId,
            verifiedStoreCount: context.verifiedStoreCount,
            access: "READ_ONLY_CUSTOMER_DETAIL",
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      console.error("[health-history-grant] grant failed", {
        userId: context.userId,
        targetStoreId: context.storeId,
        error: error instanceof Error ? error.message : String(error),
      });
      redirect(`/s/${context.storeSlug}/health?healthConsent=error`);
    }
  }

  revalidatePath(`/s/${context.storeSlug}/health`);
  revalidatePath(`/dashboard/customers/${context.customerId}/health`);
  redirect(`/s/${context.storeSlug}/health?healthConsent=granted`);
}

export async function revokeCurrentStoreHealthHistoryAccess(): Promise<void> {
  const context = await resolveConsentContext();
  if (!context) redirect("/?healthConsent=invalid");

  try {
    await prisma.$transaction(async (tx) => {
      const active = await tx.customerHealthHistoryGrant.findFirst({
        where: {
          userId: context.userId,
          targetStoreId: context.storeId,
          targetCustomerId: context.customerId,
          revokedAt: null,
        },
        select: { id: true, grantedAt: true },
      });
      if (!active) return;

      const revokedAt = new Date();
      await tx.customerHealthHistoryGrant.update({
        where: { id: active.id },
        data: { revokedAt },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: context.userId,
          targetType: "CustomerHealthHistoryGrant",
          targetId: active.id,
          action: "REVOKE_HEALTH_HISTORY_ACCESS",
          beforeJson: { grantedAt: active.grantedAt, access: "READ_ONLY_CUSTOMER_DETAIL" },
          afterJson: { revokedAt, targetStoreId: context.storeId },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    console.error("[health-history-grant] revoke failed", {
      userId: context.userId,
      targetStoreId: context.storeId,
      error: error instanceof Error ? error.message : String(error),
    });
    redirect(`/s/${context.storeSlug}/health?healthConsent=error`);
  }

  revalidatePath(`/s/${context.storeSlug}/health`);
  revalidatePath(`/dashboard/customers/${context.customerId}/health`);
  redirect(`/s/${context.storeSlug}/health?healthConsent=revoked`);
}
