import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isStaffRole } from "@/lib/permissions";

/**
 * 網域 → Store ID 映射
 * steamfoot-zhubei.com → 竹北店（暖暖蒸足）
 */
const DOMAIN_STORE_MAP: Record<string, string> = {
  "steamfoot-zhubei.com": "default-store",
  "www.steamfoot-zhubei.com": "default-store",
};

// Next.js 16: proxy.ts（前身為 middleware.ts）
export const proxy = auth((req: NextRequest & { auth: { user?: { role?: string } } | null }) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const isLoggedIn = !!session?.user;
  const role = session?.user?.role;

  // ── 自訂網域路由 — 設定 domain-store-id cookie ──
  const host = req.headers.get("host")?.split(":")[0] ?? "";
  const domainStoreId = DOMAIN_STORE_MAP[host];

  // ── Public routes — 任何人皆可訪問 ──
  const publicRoutes = [
    "/", "/login", "/register",
    "/pricing",            // 公開方案頁
    "/api/auth",
    "/api/line/webhook",   // LINE Webhook（外部呼叫）
    "/api/cron",           // Vercel Cron jobs
    "/activate",           // 帳號開通
    "/forgot-password",    // 忘記密碼
    "/reset-password",     // 重設密碼
  ];
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
    return withDomainCookie(NextResponse.next(), domainStoreId);
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
    if (role && isStaffRole(role)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    // 注入 pathname header（sidebar 高亮用）
    const response = NextResponse.next();
    response.headers.set("x-next-pathname", pathname);
    return withDomainCookie(response, domainStoreId);
  }

  // ── Admin routes (/dashboard/**) — 需要登入 + staff 身份 + storeId ──
  if (pathname.startsWith("/dashboard")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (role === "CUSTOMER") {
      return NextResponse.redirect(new URL("/book", req.url));
    }
    // Staff 無 storeId → 強制重新登入
    const storeId = (session?.user as { storeId?: string })?.storeId;
    if (role && isStaffRole(role) && !storeId) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("error", "missing-store");
      return NextResponse.redirect(loginUrl);
    }
    return withDomainCookie(NextResponse.next(), domainStoreId);
  }

  // ── 其他未知路由 ──
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return withDomainCookie(NextResponse.next(), domainStoreId);
});

/** 將 domain-store-id cookie 注入 response（供 SSR server components 讀取） */
function withDomainCookie(response: NextResponse, storeId: string | undefined): NextResponse {
  if (storeId) {
    response.cookies.set("domain-store-id", storeId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!api/line/webhook|api/cron|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
