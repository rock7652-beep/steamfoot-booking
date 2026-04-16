import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isStaffRole } from "@/lib/permissions";

// ============================================================
// B7-4.5: 正式流程不依賴靜態 map
// ============================================================

/**
 * 網域 → Store ID 映射（自訂網域路由）
 * 此為自訂網域專用，與 slug 解析無關。
 */
const DOMAIN_STORE_MAP: Record<string, string> = {
  "steamfoot-zhubei.com": "default-store",
  "www.steamfoot-zhubei.com": "default-store",
};

/** 預設店 slug — 僅用於 legacy redirect 和未登入 fallback */
const DEFAULT_STORE_SLUG = "zhubei";

// ============================================================
// Path helpers
// ============================================================

/** 從 /s/[slug]/... 中抽取 slug */
function extractStoreSlug(pathname: string): string | null {
  const match = pathname.match(/^\/s\/([^/]+)/);
  return match ? match[1] : null;
}

type SessionUser = {
  role?: string;
  storeId?: string | null;
  storeSlug?: string | null;
  staffId?: string | null;
  customerId?: string | null;
};

// ============================================================
// Proxy (middleware)
// ============================================================

// Next.js 16: proxy.ts（前身為 middleware.ts）
export const proxy = auth((req: NextRequest & { auth: { user?: SessionUser } | null }) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const isLoggedIn = !!session?.user;
  const role = session?.user?.role;
  const sessionStoreId = session?.user?.storeId;
  /** B7-4.5: 從 JWT session 讀取 storeSlug，不依賴靜態 map */
  const userSlug = session?.user?.storeSlug ?? DEFAULT_STORE_SLUG;

  // ── 自訂網域路由 — 設定 domain-store-id cookie ──
  const host = req.headers.get("host")?.split(":")[0] ?? "";
  const domainStoreId = DOMAIN_STORE_MAP[host];

  // ==========================================================
  // /s/[storeSlug]/* — 分店路由（rewrite 到現有頁面）
  // ==========================================================
  const storeSlug = extractStoreSlug(pathname);
  if (storeSlug) {
    // B7-4.5: 不做靜態 slug 驗證，交由 page-level DB resolver 處理
    // 若 slug 無效，page 會回 404

    // 去掉 /s/[slug] 前綴後的子路徑
    const subPath = pathname.slice(`/s/${storeSlug}`.length) || "/";

    // ── 分店 admin routes (/s/[slug]/admin/*) ──
    if (subPath.startsWith("/admin")) {
      if (!isLoggedIn) {
        // 保留 storeSlug，讓 /hq/login 登入後導向該店後台
        return NextResponse.redirect(new URL(`/hq/login?store=${storeSlug}`, req.url));
      }
      if (role === "CUSTOMER") {
        return NextResponse.redirect(new URL(`/s/${storeSlug}/book`, req.url));
      }
      // ADMIN 可進任何店
      if (role !== "ADMIN") {
        // OWNER / PARTNER — 必須是自己的店（用 session.storeSlug 比對 URL slug）
        if (userSlug && userSlug !== storeSlug) {
          const adminSubPath = subPath.slice("/admin".length) || "/dashboard";
          return NextResponse.redirect(new URL(`/s/${userSlug}/admin${adminSubPath}`, req.url));
        }
        if (!sessionStoreId) {
          // stale JWT（storeId 遺失）→ 導回顧客登入頁，不進後台
          return NextResponse.redirect(new URL(`/s/${storeSlug}/`, req.url));
        }
      }
      // Rewrite /s/[slug]/admin/dashboard/... → /dashboard/...
      const dashboardPath = subPath.slice("/admin".length) || "/dashboard";
      const internalPath = dashboardPath.startsWith("/dashboard") ? dashboardPath : `/dashboard${dashboardPath}`;
      return storeRewrite(req, internalPath, storeSlug, domainStoreId);
    }

    // ── 分店 customer routes ──
    const customerPrefixes = ["/book", "/my-bookings", "/my-plans", "/profile"];
    const isCustomerRoute = customerPrefixes.some(
      (p) => subPath === p || subPath.startsWith(p + "/")
    );

    if (isCustomerRoute) {
      if (!isLoggedIn) {
        return NextResponse.redirect(new URL(`/s/${storeSlug}/`, req.url));
      }
      if (role && isStaffRole(role)) {
        if (role === "ADMIN") {
          return NextResponse.redirect(new URL("/hq/dashboard", req.url));
        }
        return NextResponse.redirect(new URL(`/s/${storeSlug}/admin/dashboard`, req.url));
      }
      // Session store mismatch → redirect to correct store（用 slug 比對）
      if (userSlug && userSlug !== storeSlug) {
        return NextResponse.redirect(new URL(`/s/${userSlug}${subPath}`, req.url));
      }
      // Rewrite /s/[slug]/book → /book etc.
      return storeRewrite(req, subPath, storeSlug, domainStoreId);
    }

    // ── 分店 public routes (登入/註冊/開通/忘記密碼等) ──
    const storePublicPrefixes = ["/register", "/activate", "/forgot-password", "/reset-password"];
    const isStorePublic = storePublicPrefixes.some(
      (p) => subPath === p || subPath.startsWith(p + "/")
    );

    if (isStorePublic) {
      // 已登入訪問 register → 導向首頁
      if (isLoggedIn && subPath.startsWith("/register")) {
        const dest = role === "CUSTOMER" ? `/s/${storeSlug}/book` : `/s/${storeSlug}/admin/dashboard`;
        return NextResponse.redirect(new URL(dest, req.url));
      }
      // Rewrite /s/[slug]/register → /register etc.
      return storeRewrite(req, subPath, storeSlug, domainStoreId);
    }

    // ── 分店首頁 /s/[slug]/ → 顧客登入頁 ──
    if (subPath === "/") {
      if (isLoggedIn) {
        if (role === "CUSTOMER") {
          const correctSlug = userSlug;
          return NextResponse.redirect(new URL(`/s/${correctSlug}/book`, req.url));
        }
        if (role === "ADMIN") {
          return NextResponse.redirect(new URL("/hq/dashboard", req.url));
        }
        // OWNER / PARTNER — 僅在 session 有 storeId 時才導向後台
        // stale JWT（storeId 遺失）→ 不攔截，直接顯示顧客登入頁
        if (sessionStoreId) {
          const slug = userSlug;
          return NextResponse.redirect(new URL(`/s/${slug}/admin/dashboard`, req.url));
        }
      }
      // 未登入 or stale staff session → 顧客登入頁
      return storeRewrite(req, "/", storeSlug, domainStoreId);
    }

    // ── 分店其他未知子路徑 → 導回店首頁 ──
    return NextResponse.redirect(new URL(`/s/${storeSlug}/`, req.url));
  }

  // ==========================================================
  // /hq/* — 總部路由
  // ==========================================================
  if (pathname.startsWith("/hq")) {
    // /hq/login → public
    if (pathname === "/hq/login" || pathname.startsWith("/hq/login/")) {
      if (isLoggedIn) {
        if (role === "ADMIN") {
          return NextResponse.redirect(new URL("/hq/dashboard", req.url));
        }
        // 已登入的 OWNER/STAFF 不應停留在 /hq/login，導回其店後台
        const storeParam = req.nextUrl.searchParams.get("store");
        const slug = storeParam || userSlug;
        if (sessionStoreId) {
          return NextResponse.redirect(new URL(`/s/${slug}/admin/dashboard`, req.url));
        }
      }
      return withDomainCookie(NextResponse.next(), domainStoreId);
    }

    // /hq/dashboard/* → 需要 ADMIN
    if (pathname.startsWith("/hq/dashboard")) {
      if (!isLoggedIn) {
        return NextResponse.redirect(new URL("/hq/login", req.url));
      }
      if (role !== "ADMIN") {
        if (sessionStoreId) {
          const slug = userSlug;
          return NextResponse.redirect(new URL(`/s/${slug}/admin/dashboard`, req.url));
        }
        return NextResponse.redirect(new URL("/hq/login?error=admin-required", req.url));
      }
      // B7-5: HQ-only 頁面（如 /hq/dashboard/stores）不 rewrite，直接 pass-through
      if (pathname.startsWith("/hq/dashboard/stores")) {
        return withDomainCookie(NextResponse.next(), domainStoreId);
      }
      // Rewrite /hq/dashboard/... → /dashboard/...（共用 dashboard 頁面）
      const dashboardPath = pathname.slice("/hq".length);
      return hqRewrite(req, dashboardPath, domainStoreId);
    }

    // /hq/* 其他 → 需要 ADMIN
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/hq/login", req.url));
    }
    if (role !== "ADMIN") {
      return NextResponse.redirect(new URL("/hq/login?error=admin-required", req.url));
    }
    return withDomainCookie(NextResponse.next(), domainStoreId);
  }

  // ==========================================================
  // API routes — 不擋
  // ==========================================================
  if (pathname.startsWith("/api/")) {
    return withDomainCookie(NextResponse.next(), domainStoreId);
  }

  // ==========================================================
  // Legacy routes — redirect to new paths
  // ==========================================================

  // /login → /hq/login
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return NextResponse.redirect(new URL("/hq/login", req.url));
  }

  // /register → /s/{default}/register
  if (pathname === "/register" || pathname.startsWith("/register/")) {
    return NextResponse.redirect(new URL(`/s/${DEFAULT_STORE_SLUG}/register`, req.url));
  }

  // /activate → /s/{default}/activate (preserve query string)
  if (pathname === "/activate" || pathname.startsWith("/activate/")) {
    const rest = pathname.slice("/activate".length);
    return NextResponse.redirect(new URL(`/s/${DEFAULT_STORE_SLUG}/activate${rest}${req.nextUrl.search}`, req.url));
  }

  // /forgot-password, /reset-password → /s/{default}/...
  if (pathname === "/forgot-password" || pathname.startsWith("/forgot-password/")) {
    return NextResponse.redirect(new URL(`/s/${DEFAULT_STORE_SLUG}/forgot-password${req.nextUrl.search}`, req.url));
  }
  if (pathname === "/reset-password" || pathname.startsWith("/reset-password/")) {
    return NextResponse.redirect(new URL(`/s/${DEFAULT_STORE_SLUG}/reset-password${req.nextUrl.search}`, req.url));
  }

  // /book, /my-bookings, /my-plans, /profile → /s/{sessionSlug}/...
  const customerLegacyPrefixes = ["/book", "/my-bookings", "/my-plans", "/profile"];
  const matchedCustomer = customerLegacyPrefixes.find(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (matchedCustomer) {
    const slug = userSlug;
    const rest = pathname.slice(matchedCustomer.length);
    return NextResponse.redirect(new URL(`/s/${slug}${matchedCustomer}${rest}`, req.url));
  }

  // /dashboard → /hq/dashboard (ADMIN) or /s/{slug}/admin/dashboard (staff)
  if (pathname.startsWith("/dashboard")) {
    if (isLoggedIn && role === "ADMIN") {
      const rest = pathname.slice("/dashboard".length);
      return NextResponse.redirect(new URL(`/hq/dashboard${rest}`, req.url));
    }
    if (isLoggedIn && sessionStoreId) {
      const slug = userSlug;
      const rest = pathname.slice("/dashboard".length);
      return NextResponse.redirect(new URL(`/s/${slug}/admin/dashboard${rest}`, req.url));
    }
    return NextResponse.redirect(new URL("/hq/login", req.url));
  }

  // /pricing → keep as-is (public)
  if (pathname === "/pricing" || pathname.startsWith("/pricing/")) {
    return withDomainCookie(NextResponse.next(), domainStoreId);
  }

  // / → root redirect
  if (pathname === "/") {
    if (isLoggedIn) {
      if (role === "CUSTOMER") {
        return NextResponse.redirect(new URL(`/s/${userSlug}/book`, req.url));
      }
      if (role === "ADMIN") {
        return NextResponse.redirect(new URL("/hq/dashboard", req.url));
      }
      return NextResponse.redirect(new URL(`/s/${userSlug}/admin/dashboard`, req.url));
    }
    return NextResponse.redirect(new URL(`/s/${DEFAULT_STORE_SLUG}/`, req.url));
  }

  // ── 其他未知路由 ──
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL(`/s/${DEFAULT_STORE_SLUG}/`, req.url));
  }
  return withDomainCookie(NextResponse.next(), domainStoreId);
});

// ============================================================
// Helpers
// ============================================================

/** 將 domain-store-id cookie 注入 response */
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

/**
 * Store-scoped rewrite: 把 /s/[slug]/... 改寫成內部路徑，
 * 注入 store context cookies 供 Server Components / Server Actions 讀取。
 */
function storeRewrite(
  req: NextRequest,
  internalPath: string,
  slug: string,
  domainStoreId: string | undefined
): NextResponse {
  const url = new URL(internalPath, req.url);
  url.search = req.nextUrl.search;
  const response = NextResponse.rewrite(url);
  // B7-4.5: 僅注入 store-slug cookie，storeId 由 page-level DB resolver 提供
  response.cookies.set("store-slug", slug, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });
  // 保留原始 pathname 供 sidebar 高亮
  response.headers.set("x-next-pathname", req.nextUrl.pathname);
  if (domainStoreId) {
    response.cookies.set("domain-store-id", domainStoreId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
    });
  }
  return response;
}

/**
 * HQ rewrite: 把 /hq/dashboard/... 改寫成 /dashboard/...
 */
function hqRewrite(
  req: NextRequest,
  internalPath: string,
  domainStoreId: string | undefined
): NextResponse {
  const url = new URL(internalPath, req.url);
  url.search = req.nextUrl.search;
  const response = NextResponse.rewrite(url);
  response.cookies.set("store-slug", "__hq__", {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });
  // HQ 不設 store-id cookie（ADMIN 用 active-store-id 切換）
  response.headers.set("x-next-pathname", req.nextUrl.pathname);
  if (domainStoreId) {
    response.cookies.set("domain-store-id", domainStoreId, {
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
