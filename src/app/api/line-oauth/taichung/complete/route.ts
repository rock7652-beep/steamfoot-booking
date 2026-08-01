import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TAICHUNG_LINE_SESSION_COOKIE, verifyTaichungLineSession } from "@/lib/line-oauth/taichung-session";
import { createVerifiedCustomerIdentityLink } from "@/server/services/namespaced-customer-identity-link";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (
    session?.user?.role !== "CUSTOMER" ||
    session.user.storeSlug !== "taichung" ||
    !session.user.id ||
    !session.user.customerId ||
    !session.user.storeId
  ) {
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
    return NextResponse.json({ error: "Invalid coordinator bridge" }, { status: 401 });
  }

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
    return NextResponse.json({ error: "Identity migration rejected" }, { status: 409 });
  }

  const response = NextResponse.json({ ok: true });
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
