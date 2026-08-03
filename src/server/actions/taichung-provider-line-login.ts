"use server";

import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { getOAuthTempSession } from "@/lib/server/oauth-temp-session";
import { resolveCentralUserForStoreCustomer } from "@/server/services/resolve-central-user-for-store-customer";
import type {
  ResolveLineLoginError,
  ResolveLineLoginResult,
} from "@/server/actions/oauth-confirm";

const PHONE_RE = /^09\d{8}$/;

/**
 * The Taichung coordinator has a verified LINE Login subject, but an
 * unrecognised subject must still prove ownership with phone + password. Do
 * not inspect Customer.lineUserId, legacy `line`, or line_messaging here:
 * none of those namespaces authorise LINE Login.
 */
export async function resolveTaichungProviderLineLogin(input: {
  phone: string;
}): Promise<ResolveLineLoginResult | ResolveLineLoginError> {
  const phone = normalizePhone(input.phone ?? "");
  if (!PHONE_RE.test(phone)) return { error: "invalid_phone" };

  const tempSession = await getOAuthTempSession();
  if (!tempSession) return { error: "session_expired" };
  if (tempSession.channelKey !== "taichung") return { error: "session_expired" };

  const customer = await prisma.customer.findFirst({
    where: {
      storeId: tempSession.storeId,
      phone,
      mergedIntoCustomerId: null,
    },
    select: { id: true },
  });
  if (!customer) return { error: "line_already_bound_other" };

  // A historical Customer without a central password account cannot prove
  // ownership through this password gate. Do not show a fake "old password"
  // prompt or accept a default password; the separate activation flow owns
  // account creation and verification.
  const resolution = await resolveCentralUserForStoreCustomer({
    customerId: customer.id,
    storeId: tempSession.storeId,
  });
  if (
    resolution.status !== "resolved" ||
    resolution.user.role !== "CUSTOMER" ||
    resolution.user.status !== "ACTIVE"
  ) return { status: "ACCOUNT_ACTIVATION_REQUIRED", customerId: customer.id };
  const user = await prisma.user.findUnique({
    where: { id: resolution.user.id },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) return { status: "ACCOUNT_ACTIVATION_REQUIRED", customerId: customer.id };

  return {
    status: "NEED_LOGIN",
    phone,
    maskedPhone: `*******${phone.slice(-3)}`,
    customerId: customer.id,
  };
}
