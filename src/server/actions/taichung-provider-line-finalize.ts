"use server";

import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  clearOAuthTempSession,
  getOAuthTempSession,
} from "@/lib/server/oauth-temp-session";
import type { FinalizeLineBindResult } from "@/server/actions/oauth-confirm";

/**
 * Finalizes a Taichung provider-scoped LINE identity after the existing
 * customer-password gate has authenticated the central User.
 */
export async function finalizeTaichungProviderLineBind(input: {
  customerId: string;
  callbackUrl: string;
}): Promise<FinalizeLineBindResult> {
  const nextAuthSession = await auth();
  const authenticatedUserId = nextAuthSession?.user?.id;
  if (!authenticatedUserId) return { error: "auth_required" };

  const tempSession = await getOAuthTempSession();
  if (!tempSession) return { error: "session_expired" };
  if (tempSession.channelKey !== "taichung") {
    return { error: "customer_mismatch" };
  }

  const customer = await prisma.customer.findFirst({
    where: {
      id: input.customerId,
      storeId: tempSession.storeId,
      mergedIntoCustomerId: null,
    },
    select: {
      id: true,
      identityLinks: {
        where: { provider: "line" },
        select: { id: true, userId: true },
        take: 1,
      },
    },
  });
  const link = customer?.identityLinks[0];
  if (!customer || !link || link.userId !== authenticatedUserId) {
    return { error: "customer_mismatch" };
  }

  const conflictingLink = await prisma.customerIdentityLink.findUnique({
    where: {
      uq_customer_identity_provider_store: {
        provider: "line",
        providerAccountId: tempSession.lineUserId,
        storeId: tempSession.storeId,
      },
    },
    select: { customerId: true, userId: true },
  });
  if (
    conflictingLink &&
    (conflictingLink.customerId !== customer.id ||
      conflictingLink.userId !== authenticatedUserId)
  ) {
    return { error: "line_already_bound_other" };
  }

  const otherCustomer = await prisma.customer.findFirst({
    where: {
      storeId: tempSession.storeId,
      lineUserId: tempSession.lineUserId,
      id: { not: customer.id },
      mergedIntoCustomerId: null,
    },
    select: { id: true },
  });
  if (otherCustomer) return { error: "line_already_bound_other" };

  try {
    await prisma.$transaction(
      async (tx) => {
        const lockedLink = await tx.customerIdentityLink.findUnique({
          where: { id: link.id },
          select: {
            customerId: true,
            userId: true,
            storeId: true,
            provider: true,
          },
        });
        if (
          !lockedLink ||
          lockedLink.customerId !== customer.id ||
          lockedLink.userId !== authenticatedUserId ||
          lockedLink.storeId !== tempSession.storeId ||
          lockedLink.provider !== "line"
        ) {
          throw new Error("TAICHUNG_IDENTITY_CONTEXT_CHANGED");
        }

        await tx.customer.update({
          where: { id: customer.id },
          data: {
            lineUserId: tempSession.lineUserId,
            lineLinkStatus: "LINKED",
            lineLinkedAt: new Date(),
            lineName: tempSession.displayName,
            authSource: "LINE",
          },
        });

        await tx.customerIdentityLink.update({
          where: { id: link.id },
          data: {
            providerAccountId: tempSession.lineUserId,
            lineUserId: tempSession.lineUserId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return { error: "bind_conflict" };
    }
    throw error;
  }

  await clearOAuthTempSession();
  return {
    status: "BOUND",
    action: "RELOGIN",
    callbackUrl: input.callbackUrl,
  };
}
