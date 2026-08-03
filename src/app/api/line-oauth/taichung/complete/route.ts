import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TAICHUNG_LINE_SESSION_COOKIE, verifyTaichungLineSession } from "@/lib/line-oauth/taichung-session";
import { createVerifiedCustomerIdentityLink } from "@/server/services/namespaced-customer-identity-link";
import { logTaichungLineHandoff } from "@/lib/line-oauth/taichung-handoff-log";

async function complete(request: NextRequest, redirectOnSuccess: boolean) {
  const session = await auth();
  if (
    session?.user?.role !== "CUSTOMER" ||
    session.user.storeSlug !== "taichung" ||
    !session.user.id ||
    !session.user.customerId ||
    !session.user.storeId
  ) {
    logTaichungLineHandoff("completion_writer_failed", { errorCode: "auth_required" });
    logTaichungLineHandoff("final_redirect_blocked", { errorCode: "auth_required" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bridge = verifyTaichungLineSession(
    request.cookies.get(TAICHUNG_LINE_SESSION_COOKIE)?.value,
  );
  if (
    !bridge ||
    bridge.userId !== session.user.id ||
    bridge.customerId !== session.user.customerId ||
    bridge.storeId !== session.user.storeId
  ) {
    logTaichungLineHandoff("completion_writer_failed", {
      customerId: session.user.customerId,
      storeId: session.user.storeId,
      errorCode: "bridge_ownership_mismatch",
    });
    logTaichungLineHandoff("final_redirect_blocked", {
      customerId: session.user.customerId,
      storeId: session.user.storeId,
      errorCode: "bridge_ownership_mismatch",
    });
    return NextResponse.json({ error: "Invalid coordinator bridge" }, { status: 401 });
  }

  logTaichungLineHandoff("completion_requested", bridge);

  // Auth.js signIn() has already returned success before this endpoint is
  // called. This is the first permitted write for the verified LINE Login
  // subject; Messaging and legacy identities are never touched here.
  const migration = await createVerifiedCustomerIdentityLink({
    userId: bridge.userId,
    storeId: bridge.storeId,
    customerId: bridge.customerId,
    provider: "line_login",
    providerAccountId: bridge.lineUserId,
  });
  if (migration.status !== "upserted") {
    logTaichungLineHandoff("completion_writer_failed", {
      ...bridge,
      errorCode: migration.error,
    });
    logTaichungLineHandoff("final_redirect_blocked", {
      ...bridge,
      errorCode: migration.error,
    });
    return NextResponse.json({ error: "Identity migration rejected" }, { status: 409 });
  }

  logTaichungLineHandoff("completion_writer_created", bridge);
  // The client receives this successful response before it performs its fixed
  // internal redirect; failures return non-2xx above and cannot redirect.
  logTaichungLineHandoff("final_redirect_success", bridge);

  const response = redirectOnSuccess
    ? NextResponse.redirect(new URL("/s/taichung/book", request.url), 303)
    : NextResponse.json({ ok: true });
  response.cookies.delete(TAICHUNG_LINE_SESSION_COOKIE);
  response.cookies.set("store-slug", "taichung", {
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });
  return response;
}

// The server-driven coordinator route redirects here only after Auth.js has
// minted the session cookie. This is the normal completion path.
export async function GET(request: NextRequest) {
  return complete(request, true);
}

// Retained temporarily for callers already using the JSON contract. It has
// the same ownership and bridge checks and never redirects on failure.
export async function POST(request: NextRequest) {
  return complete(request, false);
}
