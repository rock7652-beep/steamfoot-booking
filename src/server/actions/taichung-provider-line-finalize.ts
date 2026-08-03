import type { OAuthTempSession } from "@/lib/oauth-temp-session";
import { prisma } from "@/lib/db";
import { createVerifiedCustomerIdentityLink } from "@/server/services/namespaced-customer-identity-link";
import { resolveCentralUserForStoreCustomer } from "@/server/services/resolve-central-user-for-store-customer";

type CustomerSession = {
  user?: {
    id?: string;
    role?: string;
    storeId?: string | null;
    storeSlug?: string | null;
  };
} | null;

export type TaichungFinalizeError =
  | "auth_required"
  | "session_expired"
  | "customer_mismatch";

export type TaichungServerCompletion =
  | {
      status: "completed";
      completion: { attemptId: string; userId: string; customerId: string; storeId: string };
    }
  | { status: "rejected"; error: TaichungFinalizeError | "identity_conflict" | "completion_replayed" | "completion_failed" };

/**
 * Completes a Taichung phone/password ownership proof on the server that
 * already holds both the authenticated customer session and verified OAuth
 * temp context. This intentionally never relays a bridge through a browser
 * cookie. The attempt claim and identity write share one transaction: a
 * failed write rolls back the claim, while a replay cannot write twice.
 */
export async function completeTaichungProviderLineOwnershipProof(input: {
  customerId: string;
  session: CustomerSession;
  tempSession: OAuthTempSession | null;
}): Promise<TaichungServerCompletion> {
  const authenticatedUserId = input.session?.user?.id;
  if (
    !authenticatedUserId ||
    input.session?.user?.role !== "CUSTOMER" ||
    input.session.user.storeSlug !== "taichung"
  ) return { status: "rejected", error: "auth_required" };

  const tempSession = input.tempSession;
  if (!tempSession || !tempSession.attemptId) {
    return { status: "rejected", error: "session_expired" };
  }
  if (
    tempSession.channelKey !== "taichung" ||
    input.session.user.storeId !== tempSession.storeId
  ) return { status: "rejected", error: "customer_mismatch" };

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
  ) return { status: "rejected", error: "customer_mismatch" };

  const completion = {
    attemptId: tempSession.attemptId,
    userId: resolution.user.id,
    customerId: resolution.customer.id,
    storeId: tempSession.storeId,
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.lineOAuthAttempt.updateMany({
        where: {
          id: tempSession.attemptId,
          storeId: tempSession.storeId,
          storeSlug: "taichung",
          channelKey: "taichung",
          status: "CONSUMED",
          sessionConsumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { sessionConsumedAt: new Date() },
      });
      if (claimed.count !== 1) return { status: "replayed" as const };

      const identity = await createVerifiedCustomerIdentityLink({
        ...completion,
        provider: "line_login",
        providerAccountId: tempSession.lineUserId,
        tx,
      });
      if (identity.status !== "upserted") {
        throw new Error(`identity:${identity.error}`);
      }
      return { status: "completed" as const };
    });
    if (result.status === "replayed") return { status: "rejected", error: "completion_replayed" };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("identity:")) {
      return { status: "rejected", error: "identity_conflict" };
    }
    // The transaction rolls back the compare-and-set claim on any database
    // failure. Return a safe code rather than treating a failed write as a
    // completed identity binding.
    return { status: "rejected", error: "completion_failed" };
  }

  return { status: "completed", completion };
}
