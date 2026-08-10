"use server";

import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { getOAuthTempSession } from "@/lib/server/oauth-temp-session";
import { resolveCentralUserForStoreCustomer } from "@/server/services/resolve-central-user-for-store-customer";
import { CUSTOMER_IDENTITY_PROVIDER } from "@/lib/customer-identity-provider";
import { logTaichungLineHandoff } from "@/lib/line-oauth/taichung-handoff-log";
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
  if (!PHONE_RE.test(phone)) {
    logTaichungLineHandoff("login_gate_rejected", { errorCode: "invalid_phone" });
    return { error: "invalid_phone" };
  }

  const tempSession = await getOAuthTempSession();
  if (!tempSession) {
    logTaichungLineHandoff("login_gate_rejected", { errorCode: "session_expired" });
    return { error: "session_expired" };
  }
  if (tempSession.channelKey !== "taichung") {
    logTaichungLineHandoff("login_gate_rejected", {
      storeId: tempSession.storeId,
      errorCode: "session_store_mismatch",
    });
    return { error: "session_expired" };
  }

  const customer = await prisma.customer.findFirst({
    where: {
      storeId: tempSession.storeId,
      phone,
      mergedIntoCustomerId: null,
    },
    select: {
      id: true,
      userId: true,
      identityLinks: {
        where: { provider: { in: [CUSTOMER_IDENTITY_PROVIDER.PHONE, CUSTOMER_IDENTITY_PROVIDER.LINE_LOGIN] } },
        select: { provider: true },
      },
    },
  });
  if (!customer) {
    logTaichungLineHandoff("login_gate_rejected", {
      storeId: tempSession.storeId,
      errorCode: "customer_not_found",
    });
    return { error: "line_already_bound_other" };
  }

  // A historical Customer without a central password account cannot prove
  // ownership through this password gate. Do not show a fake "old password"
  // prompt or accept a default password; the separate activation flow owns
  // account creation and verification.
  // Only a genuinely unactivated legacy customer enters self-service
  // activation. Any partial identity state is an ownership conflict, never a
  // reason to offer a claim form.
  if (customer.userId === null) {
    if (customer.identityLinks.length !== 0) {
      logTaichungLineHandoff("login_gate_rejected", {
        customerId: customer.id,
        storeId: tempSession.storeId,
        errorCode: "customer_identity_conflict",
      });
      return { error: "line_already_bound_other" };
    }
    const existingLineLogin = await prisma.customerIdentityLink.findFirst({
      where: {
        provider: CUSTOMER_IDENTITY_PROVIDER.LINE_LOGIN,
        providerAccountId: tempSession.lineUserId,
      },
      select: { id: true },
    });
    if (existingLineLogin) {
      logTaichungLineHandoff("login_gate_rejected", {
        customerId: customer.id,
        storeId: tempSession.storeId,
        errorCode: "line_login_conflict",
      });
      return { error: "line_already_bound_other" };
    }
    return { status: "ACCOUNT_ACTIVATION_REQUIRED", customerId: customer.id };
  }

  const resolution = await resolveCentralUserForStoreCustomer({
    customerId: customer.id,
    storeId: tempSession.storeId,
  });
  if (
    resolution.status !== "resolved" ||
    resolution.user.role !== "CUSTOMER" ||
    resolution.user.status !== "ACTIVE"
  ) {
    logTaichungLineHandoff("login_gate_rejected", {
      customerId: customer.id,
      storeId: tempSession.storeId,
      errorCode: "central_user_not_eligible",
    });
    return { status: "ACCOUNT_ACTIVATION_REQUIRED", customerId: customer.id };
  }
  const user = await prisma.user.findUnique({
    where: { id: resolution.user.id },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) {
    logTaichungLineHandoff("login_gate_rejected", {
      customerId: customer.id,
      storeId: tempSession.storeId,
      errorCode: "password_activation_required",
    });
    return { status: "ACCOUNT_ACTIVATION_REQUIRED", customerId: customer.id };
  }

  return {
    status: "NEED_LOGIN",
    phone,
    maskedPhone: `*******${phone.slice(-3)}`,
    customerId: customer.id,
  };
}
