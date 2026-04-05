import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16: proxy.ts（前身為 middleware.ts）
export const proxy = auth((req: NextRequest & { auth: { user?: { role?: string } } | null }) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const isLoggedIn = !!session?.user;
  const role = session?.user?.role;

  // Public routes — 直接放行
  if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    // 已登入時訪問 login，自動導向對應首頁
    if (isLoggedIn && pathname.startsWith("/login")) {
      const dest = role === "CUSTOMER" ? "/book" : "/dashboard";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  // 未登入 → redirect to login
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Customer 嘗試訪問後台
  if (role === "CUSTOMER" && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/book", req.url));
  }

  // Owner/Manager 嘗試訪問顧客前台頁
  const customerFrontend = ["/book", "/my-bookings", "/my-plans", "/onboarding", "/profile"];
  if (
    (role === "OWNER" || role === "MANAGER") &&
    customerFrontend.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // 注入 pathname header，供 customer layout 判斷目前路徑（用於 onboarding 重導邏輯）
  const response = NextResponse.next();
  response.headers.set("x-next-pathname", pathname);
  return response;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
