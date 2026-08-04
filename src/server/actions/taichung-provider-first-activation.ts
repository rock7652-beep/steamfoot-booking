"use server";

import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import { CUSTOMER_IDENTITY_PROVIDER } from "@/lib/customer-identity-provider";
import { normalizePhone } from "@/lib/normalize";
import { getOAuthTempSession } from "@/lib/server/oauth-temp-session";
import { signIn } from "@/lib/auth";
import { createVerifiedCustomerIdentityLink } from "@/server/services/namespaced-customer-identity-link";

const PHONE_RE = /^09\d{8}$/;

type ActivationError =
  | "session_expired"
  | "invalid_input"
  | "activation_not_allowed"
  | "identity_conflict"
  | "activation_replayed"
  | "activation_failed";

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
    return await prisma.$transaction(async (tx) => {
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
        return { status: "rejected", error: "activation_not_allowed" };
      }

      // A phone is a central account identifier. Do not claim it from any
      // existing User, including a user in another store or role.
      const existingUser = await tx.user.findFirst({
        where: { phone },
        select: { id: true },
      });
      if (existingUser) return { status: "rejected", error: "identity_conflict" };

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
      if (existingPhoneIdentity || existingLineLogin) {
        return { status: "rejected", error: "identity_conflict" };
      }

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
      const attached = await tx.customer.updateMany({
        where: { id: customer.id, storeId: temp.storeId, userId: null, mergedIntoCustomerId: null },
        data: { userId: user.id },
      });
      if (attached.count !== 1) throw new Error("activation_customer_claim_conflict");

      for (const identity of [
        { provider: CUSTOMER_IDENTITY_PROVIDER.PHONE, providerAccountId: phone },
        { provider: CUSTOMER_IDENTITY_PROVIDER.LINE_LOGIN, providerAccountId: temp.lineUserId },
      ]) {
        const written = await createVerifiedCustomerIdentityLink({
          userId: user.id,
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
      return { status: "activated", userId: user.id };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "activation_replayed") {
      return { status: "rejected", error: "activation_replayed" };
    }
    if (error instanceof Error && error.message.startsWith("identity:")) {
      return { status: "rejected", error: "identity_conflict" };
    }
    return { status: "rejected", error: "activation_failed" };
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
