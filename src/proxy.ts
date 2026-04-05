import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16: proxy.ts（前身為 middleware.ts）
export const proxy = auth((req: NextRequest & { auth: { user?: { role?: string } } | null }) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const isLoggedIn = !!session?.user;
  const role = session?.user?.role;

  // ── Public routes — 任何人皆可訪問 ──
  const publicRoutes = ["/", "/login", "/api/auth", "/onboarding"];
  const isPublic = publicRoutes.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isPublic) {
    // 已登入時訪問 /login → 導向對應首頁
    if (isLoggedIn && pathname.startsWith("/login")) {
      const dest = role === "CUSTOMER" ? "/book" : "/dashboard";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    // 注入 pathname header（onboarding 頁面需要）
    const response = NextResponse.next();
    response.headers.set("x-next-pathname", pathname);
    return response;
  }

  // ── Protected customer routes — 需要登入 ──
  const customerRoutes = ["/book", "/my-bookings", "/my-plans", "/profile"];
  const isCustomerRoute = customerRoutes.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isCustomerRoute) {
    // 未登入 → 回首頁（首頁有 Google 登入 CTA）
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    // Owner/Manager 不可進入顧客頁面
    if (role === "OWNER" || role === "MANAGER") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    // 注入 pathname header
    const response = NextResponse.next();
    response.headers.set("x-next-pathname", pathname);
    return response;
  }

  // ── Admin routes (/dashboard/**) — 需要登入 + staff 身份 ──
  if (pathname.startsWith("/dashboard")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (role === "CUSTOMER") {
      return NextResponse.redirect(new URL("/book", req.url));
    }
    const response = NextResponse.next();
    response.headers.set("x-next-pathname", pathname);
    return response;
  }

  // ── 其他未知路由 — 未登入導向首頁 ──
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const response = NextResponse.next();
  response.headers.set("x-next-pathname", pathname);
  return response;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
