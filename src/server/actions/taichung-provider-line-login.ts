"use server";

import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import {
  clearOAuthTempSession,
  getOAuthTempSession,
} from "@/lib/server/oauth-temp-session";
import {
  resolveLineLogin,
  type ResolveLineLoginError,
  type ResolveLineLoginResult,
} from "@/server/actions/oauth-confirm";

const PHONE_RE = /^09\d{8}$/;

/**
 * Dedicated Taichung LINE Login uses a provider-scoped LINE user ID. When the
 * browser has no central Auth.js session yet, do not fall back to the legacy
 * resolver and reject the historical ID mismatch. Instead require the existing
 * password gate; the finalize step will prove central-user ownership and rotate
 * only the Taichung store identity.
 */
export async function resolveTaichungProviderLineLogin(input: {
  phone: string;
}): Promise<ResolveLineLoginResult | ResolveLineLoginError> {
  const phone = normalizePhone(input.phone ?? "");
  if (!PHONE_RE.test(phone)) return { error: "invalid_phone" };

  const tempSession = await getOAuthTempSession();
  if (!tempSession) return { error: "session_expired" };
  if (tempSession.channelKey !== "taichung") {
    return resolveLineLogin({ phone });
  }

  const customer = await prisma.customer.findFirst({
    where: {
      storeId: tempSession.storeId,
      phone,
      mergedIntoCustomerId: null,
    },
    select: {
      id: true,
      lineUserId: true,
      userId: true,
      user: { select: { passwordHash: true } },
      identityLinks: {
        where: { provider: "line" },
        select: { id: true, userId: true, providerAccountId: true },
        take: 1,
      },
    },
  });

  const link = customer?.identityLinks[0];
  if (!customer || !link) {
    return resolveLineLogin({ phone });
  }

  const nextAuthSession = await auth();
  const authenticatedUserId = nextAuthSession?.user?.id;

  // Normal LINE in-app browser entry has no central Auth.js session. The
  // existing store identity link proves that this is an activated member, but
  // not yet that the current browser owns it, so require password verification.
  if (!authenticatedUserId) {
    return {
      status: "NEED_LOGIN",
      phone,
      maskedPhone: `*******${phone.slice(-3)}`,
      customerId: customer.id,
    };
  }

  if (link.userId !== authenticatedUserId) {
    return { error: "line_already_bound_other" };
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
        const refreshedLink = await tx.customerIdentityLink.findUnique({
          where: { id: link.id },
          select: {
            customerId: true,
            userId: true,
            storeId: true,
            provider: true,
          },
        });
        if (
          !refreshedLink ||
          refreshedLink.customerId !== customer.id ||
          refreshedLink.userId !== authenticatedUserId ||
          refreshedLink.storeId !== tempSession.storeId ||
          refreshedLink.provider !== "line"
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
      return { error: "line_already_bound_other" };
    }
    throw error;
  }

  await clearOAuthTempSession();
  return {
    status: "BOUND_EXISTING",
    action: "RELOGIN",
    customerId: customer.id,
  };
}
