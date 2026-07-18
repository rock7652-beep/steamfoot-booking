import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TAICHUNG_LINE_SESSION_COOKIE } from "@/lib/line-oauth/taichung-session";

export async function POST() {
  const session = await auth();
  if (
    session?.user?.role !== "CUSTOMER" ||
    session.user.storeSlug !== "taichung"
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(TAICHUNG_LINE_SESSION_COOKIE);
  return response;
}
