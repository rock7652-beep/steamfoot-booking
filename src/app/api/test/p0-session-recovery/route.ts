import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

const TEST_KEY = "p0-session-recovery-20260714";
const COOKIE_NAME = "__Secure-authjs.session-token";

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse("Not found", { status: 404 });
  }

  if (req.nextUrl.searchParams.get("key") !== TEST_KEY) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return new NextResponse("Missing auth secret", { status: 500 });
  }

  const token = await encode({
    token: {
      sub: "p0_session_recovery_user",
      name: "P0 Session Recovery",
      email: null,
      role: "CUSTOMER",
      staffId: null,
      customerId: null,
      storeId: null,
      storeSlug: null,
    },
    secret,
    salt: COOKIE_NAME,
    maxAge: 300,
  });

  const response = NextResponse.redirect(new URL("/s/zhubei/book", req.url));
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return response;
}
