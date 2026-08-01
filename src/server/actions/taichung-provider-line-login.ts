"use server";

import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { getOAuthTempSession } from "@/lib/server/oauth-temp-session";
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

  return {
    status: "NEED_LOGIN",
    phone,
    maskedPhone: `*******${phone.slice(-3)}`,
    customerId: customer.id,
  };
}
