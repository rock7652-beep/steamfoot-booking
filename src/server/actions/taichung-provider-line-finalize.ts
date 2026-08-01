import type { OAuthTempSession } from "@/lib/oauth-temp-session";
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

export type TaichungBridgePreparation =
  | {
      status: "ready";
      bridge: {
        attemptId: string;
        userId: string;
        customerId: string;
        storeId: string;
        lineUserId: string;
      };
    }
  | { status: "rejected"; error: TaichungFinalizeError };

/**
 * Validates the post-password ownership proof before a route handler issues
 * the one-time coordinator bridge. This deliberately does not write any
 * identity: line_login is created only after Auth.js consumes that bridge.
 */
export async function prepareTaichungProviderLineBridge(input: {
  customerId: string;
  session: CustomerSession;
  tempSession: OAuthTempSession | null;
}): Promise<TaichungBridgePreparation> {
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

  return {
    status: "ready",
    bridge: {
      attemptId: tempSession.attemptId,
      userId: resolution.user.id,
      customerId: resolution.customer.id,
      storeId: tempSession.storeId,
      lineUserId: tempSession.lineUserId,
    },
  };
}
