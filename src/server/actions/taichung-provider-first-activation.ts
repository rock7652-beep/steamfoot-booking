"use server";

import { hashSync } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CUSTOMER_IDENTITY_PROVIDER } from "@/lib/customer-identity-provider";
import { normalizePhone } from "@/lib/normalize";
import { getOAuthTempSession } from "@/lib/server/oauth-temp-session";
import { signIn } from "@/lib/auth";
import { createVerifiedCustomerIdentityLink } from "@/server/services/namespaced-customer-identity-link";
import { logTaichungLineHandoff } from "@/lib/line-oauth/taichung-handoff-log";

const PHONE_RE = /^09\d{8}$/;

type ActivationError =
  | "session_expired"
  | "invalid_input"
  | "customer_already_linked"
  | "orphan_user_not_eligible"
  | "orphan_user_status_changed"
  | "orphan_user_has_password"
  | "orphan_user_has_customer"
  | "orphan_user_has_identity"
  | "phone_identity_conflict"
  | "line_login_conflict"
  | "activation_replayed"
  | "transaction_failed";

export type TaichungFirstActivationState = { error: string | null };

export type TaichungFirstActivationResult =
  | { status: "activated"; userId: string }
  | { status: "rejected"; error: ActivationError };

/**
 * Atomically turns a strictly-unactivated Taichung Customer into a central
 * customer account. It deliberately never reads or writes the legacy LINE
 * Messaging fields or Auth.js Account(provider="line").
 */
export async function activateTaichungLegacyCustomer(input: {
  customerId: string;
  phone: string;
  passwordHash: string;
  tempSession: Awaited<ReturnType<typeof getOAuthTempSession>>;
}): Promise<TaichungFirstActivationResult> {
  const phone = normalizePhone(input.phone);
  const temp = input.tempSession;
  if (!PHONE_RE.test(phone)) return { status: "rejected", error: "invalid_input" };
  if (!temp?.attemptId || temp.channelKey !== "taichung") {
    return { status: "rejected", error: "session_expired" };
  }

  try {
    const result = await prisma.$transaction(async (tx): Promise<TaichungFirstActivationResult> => {
      const customer = await tx.customer.findFirst({
        where: {
          id: input.customerId,
          storeId: temp.storeId,
          phone,
          userId: null,
          mergedIntoCustomerId: null,
        },
        select: {
          id: true,
          name: true,
          storeId: true,
          identityLinks: {
            where: { provider: { in: [CUSTOMER_IDENTITY_PROVIDER.PHONE, CUSTOMER_IDENTITY_PROVIDER.LINE_LOGIN] } },
            select: { id: true },
          },
        },
      });
      if (!customer || customer.identityLinks.length !== 0) {
        return { status: "rejected", error: "customer_already_linked" };
      }

      // A phone may have a historical, suspended central shell. It is reusable
      // only when exactly one such shell is entirely orphaned. Any account,
      // customer, password, or identity is an ownership boundary, not a repair
      // opportunity.
      const matchingUsers = await tx.user.findMany({
        where: { phone },
        select: {
          id: true,
          role: true,
          status: true,
          passwordHash: true,
          customer: { select: { id: true } },
          accounts: { select: { id: true } },
          customerIdentityLinks: { select: { id: true } },
        },
      });
      if (matchingUsers.length > 1) {
        return { status: "rejected", error: "phone_identity_conflict" };
      }

      const [existingPhoneIdentity, existingLineLogin] = await Promise.all([
        tx.customerIdentityLink.findFirst({
          where: { provider: CUSTOMER_IDENTITY_PROVIDER.PHONE, providerAccountId: phone },
          select: { id: true },
        }),
        tx.customerIdentityLink.findFirst({
          where: {
            provider: CUSTOMER_IDENTITY_PROVIDER.LINE_LOGIN,
            providerAccountId: temp.lineUserId,
          },
          select: { id: true },
        }),
      ]);
      if (existingPhoneIdentity) {
        return { status: "rejected", error: "phone_identity_conflict" };
      }
      if (existingLineLogin) {
        return { status: "rejected", error: "line_login_conflict" };
      }

      let userId: string;
      const orphan = matchingUsers[0];
      if (!orphan) {
        const user = await tx.user.create({
          data: {
            name: customer.name,
            phone,
            passwordHash: input.passwordHash,
            role: "CUSTOMER",
            status: "ACTIVE",
          },
          select: { id: true },
        });
        userId = user.id;
      } else {
        if (orphan.role !== "CUSTOMER") {
          return { status: "rejected", error: "orphan_user_not_eligible" };
        }
        if (orphan.status !== "SUSPENDED") {
          return { status: "rejected", error: "orphan_user_status_changed" };
        }
        if (orphan.passwordHash !== null) {
          return { status: "rejected", error: "orphan_user_has_password" };
        }
        if (orphan.customer !== null) {
          return { status: "rejected", error: "orphan_user_has_customer" };
        }
        if (orphan.accounts.length !== 0 || orphan.customerIdentityLinks.length !== 0) {
          return { status: "rejected", error: "orphan_user_has_identity" };
        }

        // Compare-and-set turns the read-time orphan proof into a write-time
        // proof. Under Serializable isolation a concurrent link/account write
        // either conflicts or makes this update count zero.
        const reactivated = await tx.user.updateMany({
          where: {
            id: orphan.id,
            phone,
            role: "CUSTOMER",
            status: "SUSPENDED",
            passwordHash: null,
          },
          data: { passwordHash: input.passwordHash, status: "ACTIVE" },
        });
        if (reactivated.count !== 1) throw new Error("orphan_user_status_changed");
        userId = orphan.id;
      }
      const attached = await tx.customer.updateMany({
        where: { id: customer.id, storeId: temp.storeId, userId: null, mergedIntoCustomerId: null },
        data: { userId },
      });
      if (attached.count !== 1) throw new Error("customer_already_linked");

      for (const identity of [
        { provider: CUSTOMER_IDENTITY_PROVIDER.PHONE, providerAccountId: phone },
        { provider: CUSTOMER_IDENTITY_PROVIDER.LINE_LOGIN, providerAccountId: temp.lineUserId },
      ]) {
        const written = await createVerifiedCustomerIdentityLink({
          userId,
          storeId: temp.storeId,
          customerId: customer.id,
          provider: identity.provider,
          providerAccountId: identity.providerAccountId,
          tx,
        });
        if (written.status !== "upserted") throw new Error(`identity:${written.error}`);
      }

      const claimed = await tx.lineOAuthAttempt.updateMany({
        where: {
          id: temp.attemptId,
          storeId: temp.storeId,
          storeSlug: "taichung",
          channelKey: "taichung",
          status: "CONSUMED",
          sessionConsumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { sessionConsumedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("activation_replayed");
      return { status: "activated", userId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.status === "rejected") {
      logTaichungLineHandoff("activation_rejected", {
        attemptId: temp.attemptId,
        customerId: input.customerId,
        storeId: temp.storeId,
        errorCode: result.error,
      });
    } else {
      logTaichungLineHandoff("activation_committed", {
        attemptId: temp.attemptId,
        customerId: input.customerId,
        storeId: temp.storeId,
      });
    }
    return result;
  } catch (error) {
    const errorCode = error instanceof Error && [
      "activation_replayed",
      "orphan_user_status_changed",
      "customer_already_linked",
    ].includes(error.message)
      ? error.message as ActivationError
      : "transaction_failed";
    logTaichungLineHandoff("activation_failed", {
      attemptId: temp.attemptId,
      customerId: input.customerId,
      storeId: temp.storeId,
      errorCode,
    });
    return { status: "rejected", error: errorCode };
  }
}

export async function taichungFirstActivationAction(
  _previous: TaichungFirstActivationState,
  formData: FormData,
): Promise<TaichungFirstActivationState> {
  const customerId = String(formData.get("customerId") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (!customerId || !PHONE_RE.test(normalizePhone(phone)) || password.length < 8 || password !== confirmPassword) {
    return { error: "請確認手機號碼，並設定至少 8 碼且兩次相同的密碼" };
  }

  const tempSession = await getOAuthTempSession();
  const result = await activateTaichungLegacyCustomer({
    customerId,
    phone,
    passwordHash: hashSync(password, 10),
    tempSession,
  });
  if (result.status === "rejected") {
    return { error: result.error === "session_expired" ? "登入流程已過期，請重新從暖沐 LINE 登入" : "無法完成首次啟用，請重新從暖沐 LINE 登入" };
  }

  // Auth.js writes the session cookie on this response. The identity records
  // above are already committed atomically; a sign-in failure is never shown
  // as a successful member-page redirect.
  try {
    await signIn("customer-phone", {
      phone: normalizePhone(phone),
      password,
      storeId: tempSession!.storeId,
      redirectTo: "/s/taichung/book",
    });
  } catch (error) {
    if (error && typeof error === "object" && "type" in error && (error as { type?: unknown }).type === "CredentialsSignin") {
      return { error: "帳號已啟用，但無法建立登入 Session；請重新從暖沐 LINE 登入" };
    }
    // Next.js redirects are intentionally rethrown; this is the only success
    // path to the member page.
    throw error;
  }
  return { error: "無法建立登入 Session，請重新從暖沐 LINE 登入" };
}
