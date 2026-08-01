"use server";

import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import {
  issueTaichungLineSession,
  TAICHUNG_LINE_SESSION_COOKIE,
  TAICHUNG_LINE_SESSION_MAX_AGE,
} from "@/lib/line-oauth/taichung-session";
import {
  clearOAuthTempSession,
  getOAuthTempSession,
} from "@/lib/server/oauth-temp-session";
import type { FinalizeLineBindResult } from "@/server/actions/oauth-confirm";
import { resolveCentralUserForStoreCustomer } from "@/server/services/resolve-central-user-for-store-customer";

/**
 * Completes one verified ownership proof. This action runs only after the
 * customer-phone Auth.js session exists and hands it to the signed one-time
 * bridge. The completion endpoint creates line_login only after the bridge
 * mints the store-scoped Auth.js session successfully.
 */
export async function finalizeTaichungProviderLineBind(input: {
  customerId: string;
  callbackUrl: string;
}): Promise<FinalizeLineBindResult> {
  const nextAuthSession = await auth();
  const authenticatedUserId = nextAuthSession?.user?.id;
  if (
    !authenticatedUserId ||
    nextAuthSession.user.role !== "CUSTOMER" ||
    nextAuthSession.user.storeSlug !== "taichung"
  ) return { error: "auth_required" };

  const tempSession = await getOAuthTempSession();
  if (!tempSession || !tempSession.attemptId) return { error: "session_expired" };
  if (
    tempSession.channelKey !== "taichung" ||
    nextAuthSession.user.storeId !== tempSession.storeId
  ) return { error: "customer_mismatch" };

  const resolution = await resolveCentralUserForStoreCustomer({
    customerId: input.customerId,
    storeId: tempSession.storeId,
  });
  if (
    resolution.status !== "resolved" ||
    resolution.customer.id !== input.customerId ||
    resolution.customer.storeId !== tempSession.storeId ||
    resolution.user.id !== authenticatedUserId ||
    resolution.user.role !== "CUSTOMER" ||
    resolution.user.status !== "ACTIVE"
  ) return { error: "customer_mismatch" };

  const cookieStore = await cookies();
  cookieStore.set(
    TAICHUNG_LINE_SESSION_COOKIE,
    issueTaichungLineSession({
      attemptId: tempSession.attemptId,
      userId: resolution.user.id,
      customerId: resolution.customer.id,
      storeId: tempSession.storeId,
      lineUserId: tempSession.lineUserId,
    }),
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: TAICHUNG_LINE_SESSION_MAX_AGE,
    },
  );
  await clearOAuthTempSession();
  return { status: "BOUND", action: "COMPLETE", callbackUrl: input.callbackUrl };
}
