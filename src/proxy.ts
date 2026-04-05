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
  const publicRoutes = ["/", "/login", "/register", "/api/auth"];
  const isPublic = publicRoutes.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isPublic) {
    // 已登入時訪問首頁或 /login → 導向對應首頁
    if (isLoggedIn && (pathname === "/" || pathname.startsWith("/login"))) {
      const dest = role === "CUSTOMER" ? "/book" : "/dashboard";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    // 已登入時訪問 /register → 導向首頁
    if (isLoggedIn && pathname.startsWith("/register")) {
      const dest = role === "CUSTOMER" ? "/book" : "/dashboard";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  // ── Protected customer routes — 需要登入 ──
  const customerRoutes = ["/book", "/my-bookings", "/my-plans", "/profile"];
  const isCustomerRoute = customerRoutes.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isCustomerRoute) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    if (role === "OWNER" || role === "MANAGER") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    // 注入 pathname header（sidebar 高亮用）
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
    return NextResponse.next();
  }

  // ── 其他未知路由 ──
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
