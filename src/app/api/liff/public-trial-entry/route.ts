import { z } from "zod";
import { probeStoreLineRecipient } from "@/lib/line";
import {
  LiffIdTokenError,
  verifyLiffIdToken,
} from "@/lib/liff/verify-id-token";
import { ZHUBEI_PUBLIC_TRIAL_LINE_LOGIN_CHANNEL_ID } from "@/lib/liff/public-trial-config";
import { resolveStoreBySlug } from "@/lib/store-resolver";
import { createTrialBookingChatLink } from "@/server/services/trial-booking-chat-link";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  idToken: z.string().min(1),
  storeSlug: z.literal("zhubei"),
});

type ResponseBody =
  | { status: "ok"; entry: string }
  | {
      status: "error";
      code:
        | "INVALID_BODY"
        | "STORE_NOT_FOUND"
        | "ID_TOKEN_INVALID"
        | "ID_TOKEN_EXPIRED"
        | "VERIFY_NETWORK"
        | "IDENTITY_SCOPE_MISMATCH"
        | "IDENTITY_VERIFICATION_UNAVAILABLE"
        | "LINK_CREATE_FAILED";
    };

function json(body: ResponseBody, status: number): Response {
  return Response.json(body, { status });
}

/**
 * Turns one verified LIFF visit into the same opaque, one-time entry used by
 * the store webhook. No Customer or login Account is written here. The LINE
 * Login subject must first be recognized by this store's Messaging API, so a
 * provider-scoped login id can never be persisted as a notification target.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ status: "error", code: "INVALID_BODY" }, 400);

  let verified;
  try {
    verified = await verifyLiffIdToken(
      parsed.data.idToken,
      ZHUBEI_PUBLIC_TRIAL_LINE_LOGIN_CHANNEL_ID,
    );
  } catch (error) {
    if (error instanceof LiffIdTokenError) {
      if (error.code === "EXPIRED") {
        return json({ status: "error", code: "ID_TOKEN_EXPIRED" }, 401);
      }
      if (error.code === "NETWORK") {
        return json({ status: "error", code: "VERIFY_NETWORK" }, 502);
      }
      return json({ status: "error", code: "ID_TOKEN_INVALID" }, 401);
    }
    return json({ status: "error", code: "ID_TOKEN_INVALID" }, 401);
  }

  const store = await resolveStoreBySlug(parsed.data.storeSlug);
  if (!store) return json({ status: "error", code: "STORE_NOT_FOUND" }, 404);

  const recipientProbe = await probeStoreLineRecipient(store.id, verified.lineUserId);
  if (recipientProbe.status === "INCOMPATIBLE") {
    return json({ status: "error", code: "IDENTITY_SCOPE_MISMATCH" }, 409);
  }
  if (recipientProbe.status === "UNAVAILABLE") {
    return json(
      { status: "error", code: "IDENTITY_VERIFICATION_UNAVAILABLE" },
      503,
    );
  }

  try {
    const link = await createTrialBookingChatLink({
      storeId: store.id,
      channel: "LINE",
      chatIdentity: verified.lineUserId,
    });
    const entry = new URL(link.url).searchParams.get("entry");
    if (!entry) throw new Error("TRIAL_BOOKING_ENTRY_MISSING");
    return json({ status: "ok", entry }, 200);
  } catch (error) {
    console.error("[liff/public-trial-entry] link creation failed", {
      storeId: store.id,
      errorName: error instanceof Error ? error.name : "Unknown",
    });
    return json({ status: "error", code: "LINK_CREATE_FAILED" }, 500);
  }
}
