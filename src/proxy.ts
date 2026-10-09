import { isGuideUiPreview, isTrialUiPreview, isHqUsageUiPreview, isSinglePricingUiPreview } from "../scripts/guide-ui-preview-scope.mjs";
import { findPublicGuide, guidePath } from "@/lib/public-guides";
import { isCanonicalMarketingRequest, MARKETING_SITEMAP_PATHS } from "@/lib/marketing-seo";
import { blocksFrontendPreviewWrite } from "@/lib/frontend-preview";
import { marketingRoute } from "@/lib/marketing-routes";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isStaffRole } from "@/lib/permissions";
import {
  buildStoreRewriteRequestHeaders,
  legacyRedirectUrl,
} from "@/lib/proxy-helpers";

// ============================================================
// B7-4.5: 正式流程不依賴靜態 map
// ============================================================

/**
 * 網域 → Store ID 映射（自訂網域路由）
 * 此為自訂網域專用，與 slug 解析無關。
 */
const DOMAIN_STORE_MAP: Record<string, string> = {
  "steamfoot-zhubei.com": "e182e256-98ca-4c78-970b-d4b118066c51",
  "www.steamfoot-zhubei.com": "e182e256-98ca-4c78-970b-d4b118066c51",
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
const authenticatedProxy = auth((req: NextRequest & { auth: { user?: SessionUser } | null }) => {
  const { pathname } = req.nextUrl;
  // Internal destination only; public requests must pass the scoped route guards.
  if (pathname === "/cash-drawer-panel" || pathname.startsWith("/cash-drawer-panel/")) {
    return new NextResponse(null, { status: 404 });
  }
  // Preview pages expose GET-only projections; reject every Server Action/form/API write.
  if (blocksFrontendPreviewWrite(req.method, pathname, req.headers.get("referer"))) {
    return NextResponse.json({ error: "預覽中不會儲存" }, { status: 403 });
  }
  // Public, demonstration-only onboarding guides on isolated previews.
  // Keep the exception confined to these static files, never store/admin routes.
  if (pathname === "/line-onboarding-preview" || pathname.startsWith("/line-onboarding-preview/")) {
    if (process.env.VERCEL_ENV !== "preview") return new NextResponse(null, { status: 404 });
    if (pathname === "/line-onboarding-preview" || pathname === "/line-onboarding-preview/") {
      return NextResponse.redirect(new URL("/line-onboarding-preview/index.html", req.url));
    }
    const file = pathname.slice("/line-onboarding-preview/".length);
    return /^(index|store|coordinator)\.html$/.test(file) || /^step-[1-9]\.svg$/.test(file)
      ? routePassThrough(req)
      : new NextResponse(null, { status: 404 });
  }
  // Isolated, fake-data layout review. Never expose this preview in production
  // or broaden the exception to customer/admin/API routes.
  if (pathname === "/course-mobile-review" || pathname.startsWith("/course-mobile-review/")) {
    if (process.env.VERCEL_ENV !== "preview") {
      return new NextResponse(null, { status: 404 });
    }
    if (pathname === "/course-mobile-review" || pathname === "/course-mobile-review/") {
      const url = new URL("/course-mobile-review/index.html", req.url);
      url.search = req.nextUrl.search;
      return NextResponse.redirect(url);
    }
    const reviewFiles = new Set([
      "index.html", "demo.html", "review.css", "review.js", "legacy.js",
      "navigation.html", "navigation.css", "navigation.js",
      "member-390.png", "member-details-390.png", "coach-390.png",
      "coach-roster-390.png", "member-comparison.png", "coach-comparison.png",
      "booking-confirm-390.png", "points-insufficient-390.png",
    ]);
    return reviewFiles.has(pathname.slice("/course-mobile-review/".length))
      ? routePassThrough(req)
      : new NextResponse(null, { status: 404 });
  }
  const session = req.auth;
  const isLoggedIn = !!session?.user;
  const role = session?.user?.role;
  const sessionStoreId = session?.user?.storeId;
  /** B7-4.5: 從 JWT session 讀取 storeSlug，不依賴靜態 map */
  const userSlug = session?.user?.storeSlug ?? DEFAULT_STORE_SLUG;
  /**
   * 顧客從 /s/[store] 入口進入時，storeRewrite 會刷新這個 cookie。
   * 對通用 /、/book 等 legacy 入口，這個最近的明確店別應優先於 stale JWT。
   * cookie 只決定導向；實際 membership 仍由 customer layout / server resolver 驗證。
   */
  const cookieStoreSlug = req.cookies.get("store-slug")?.value;
  const oauthStoreSlug = req.cookies.get("oauth-store-slug")?.value;
  const customerRouteSlug =
    cookieStoreSlug && cookieStoreSlug !== "__hq__" ? cookieStoreSlug : userSlug;

  // ── 自訂網域路由 — 設定 domain-store-id cookie ──
  const host = req.headers.get("host")?.split(":")[0] ?? "";
  const domainStoreId = DOMAIN_STORE_MAP[host];

  // Only public marketing paths are remapped. Store rewrites still render
  // the original customer page internally without re-entering this proxy.
  const marketing = marketingRoute(pathname, Boolean(domainStoreId));
  if (marketing) {
    // Resolve static editorial boundaries before Next starts streaming so an
    // unknown/unpublished article is a real HTTP 404, not a soft-404 document.
    if (marketing.kind === "not-found") {
      return new NextResponse("找不到這篇經營指南", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow", "Content-Type": "text/plain; charset=utf-8" } });
    }
    const url = req.nextUrl.clone();
    if (marketing.kind === "rewrite" && marketing.destination === "/pricing/guides") {
      const legacyIds = req.nextUrl.searchParams.getAll("guide");
      const guide = legacyIds.length === 1 ? findPublicGuide(legacyIds[0]) : undefined;
      if (guide) {
        url.pathname = guidePath(guide);
        url.search = "";
        const response = NextResponse.redirect(url, 308);
        if (!isCanonicalMarketingRequest(req)) response.headers.set("X-Robots-Tag", "noindex, nofollow");
        return response;
      }
    }
    url.pathname = marketing.destination;
    const response = marketing.kind === "redirect"
      ? NextResponse.redirect(url, 308)
      : NextResponse.rewrite(url, { request: { headers: nonStoreRequestHeaders(req) } });
    if (!isCanonicalMarketingRequest(req)) response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  // Mark only existing public marketing documents on non-canonical hosts;
  // this does not grant access or change any store/auth routing.
  if (pathname !== "/" && (MARKETING_SITEMAP_PATHS as readonly string[]).includes(pathname) && !isCanonicalMarketingRequest(req)) {
    const response = withDomainCookie(routePassThrough(req), domainStoreId);
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  // Exact public completion endpoint for Taiwan's server-coordinated LINE
  // login. Do not broaden this to /line-oauth/*: only this page needs to run
  // before an Auth.js session exists.
  if (pathname === "/line-oauth/complete") {
    return withDomainCookie(routePassThrough(req), domainStoreId);
  }

  // The signed bridge, coordinator credentials sign-in, and completion route
  // are their own authenticated handoff. Never let a generic proxy redirect
  // replace their Set-Cookie / redirect response.
  if (pathname.startsWith("/api/line-oauth/taichung/")) {
    return withDomainCookie(routePassThrough(req), domainStoreId);
  }

  // OAuth identity confirmation is part of the public LINE handoff. It must
  // run even when the LINE in-app browser has no Auth.js session or still
  // carries a stale session from another store. The signed temp session and
  // server actions enforce store/customer ownership inside these pages.
  if (pathname === "/oauth-confirm" || pathname.startsWith("/oauth-confirm/")) {
    return withDomainCookie(routePassThrough(req), domainStoreId);
  }

  // Reminder links authenticate the exact booking/store with a signed token.
  // Allow both page loads and Server Action POSTs without a login session.
  if (pathname === "/trial-booking/manage") {
    return withDomainCookie(routePassThrough(req), domainStoreId);
  }

  if (pathname === "/store-select") {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/hq/login", req.url));
    }
    if (role && isStaffRole(role)) {
      const destination = role === "ADMIN"
        ? "/hq/dashboard"
        : sessionStoreId && session?.user?.storeSlug
          ? `/s/${session.user.storeSlug}/admin/dashboard`
          : "/hq/login?error=missing-store";
      return NextResponse.redirect(new URL(destination, req.url));
    }
    return withDomainCookie(routePassThrough(req), domainStoreId);
  }

  if (pathname === "/book/zhubei") {
    return NextResponse.redirect(
      new URL("/pricing/experience/zhubei/book#booking-form", req.url),
    );
  }

  // ==========================================================
  // /s/[storeSlug]/* — 分店路由（rewrite 到現有頁面）
  // ==========================================================
  const storeSlug = extractStoreSlug(pathname);
  if (storeSlug) {
    // B7-4.5: 不做靜態 slug 驗證，交由 page-level DB resolver 處理
    // 若 slug 無效，page 會回 404

    // 去掉 /s/[slug] 前綴後的子路徑
    const subPath = pathname.slice(`/s/${storeSlug}`.length) || "/";

    // ── SPA 服務人員專用入口 ──
    if (subPath === "/staff/login") {
      if (isLoggedIn && ["PARTNER", "STAFF"].includes(role ?? "") && sessionStoreId) {
        return NextResponse.redirect(new URL(`/s/${storeSlug}/staff/my-bookings`, req.url));
      }
      return storeRewrite(req, "/staff-login", storeSlug, domainStoreId);
    }
    if (subPath === "/staff/my-bookings") {
      if (!isLoggedIn) {
        return NextResponse.redirect(new URL(`/s/${storeSlug}/staff/login`, req.url));
      }
      if (!["PARTNER", "STAFF"].includes(role ?? "") || !sessionStoreId) {
        return NextResponse.redirect(new URL(`/s/${storeSlug}/staff/login`, req.url));
      }
      return storeRewrite(req, "/staff-schedule", storeSlug, domainStoreId);
    }

    // Compatibility entry for LIFF apps that were configured with the legacy
    // `/s/[storeSlug]/trial-booking` endpoint. Keep the browser on the exact
    // LINE Developers endpoint while serving the native public-trial bridge;
    // this preserves LIFF state and avoids falling through to the store home.
    if (subPath === "/trial-booking") {
      return storeRewrite(req, "/liff/public-trial", storeSlug, domainStoreId);
    }

    // ── 分店 admin routes (/s/[slug]/admin/*) ──
    if (subPath.startsWith("/admin")) {
      if (!isLoggedIn) {
        // 保留 storeSlug，讓 /hq/login 登入後導向該店後台
        return NextResponse.redirect(new URL(`/hq/login?store=${storeSlug}`, req.url));
      }
      if (role === "CUSTOMER") {
        return NextResponse.redirect(new URL(`/s/${storeSlug}/book`, req.url));
      }
      // Store organization authorization intentionally does not live in proxy.
      // The server resolver looks up this route slug and validates it against the
      // authenticated user's accessible stores before any page query/action runs.
      if (role !== "ADMIN") {
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
    const customerPrefixes = [
      "/book",
      "/my-bookings",
      "/my-plans",
      "/my-points",
      "/my-referrals",
      "/my-growth",
      "/health",
      "/profile",
      "/member-stores",
      "/member-link",
    ];
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
      // 不再做 session.storeSlug vs URL slug 的 mismatch redirect —
      // 舊邏輯 `if (userSlug && userSlug !== storeSlug)` 會把任何與 session 不符的
      // URL（含不存在於 DB 的無效 slug）靜默導向 userSlug。因 userSlug fallback
      // 到 DEFAULT_STORE_SLUG（"zhubei"），會造成：
      //   /s/wrong-store/book → /s/zhubei/book（使用者看似正常，其實被改站）
      // 現在讓 URL slug 原樣放行；無效 slug 由 customer layout 的 store context
      // gate（PR3）擋下並顯示 fallback UI，有 logout escape hatch 可回登入流程。
      // Data 安全仍由 server query 以 session.storeId 為準保護，不受 URL slug 影響。
      return storeRewrite(req, subPath, storeSlug, domainStoreId);
    }

    // ── 分店 public routes (登入/註冊/開通/忘記密碼/LINE 推薦中繼/LIFF 入口) ──
    const storePublicPrefixes = ["/register", "/activate", "/forgot-password", "/reset-password", "/line-entry", "/liff"];
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
          // 使用 URL slug 而非 session's userSlug（含 zhubei fallback）:
          // 無效 URL slug 會被 customer layout gate（PR3）擋下，不會靜默改站。
          return NextResponse.redirect(new URL(`/s/${storeSlug}/book`, req.url));
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
    // 店長信箱重設需在未登入時可用；只開放這兩個明確頁面。
    if (pathname === "/hq/forgot-password" || pathname === "/hq/reset-password") {
      return withDomainCookie(routePassThrough(req), domainStoreId);
    }
    // /hq/login → public
    if (pathname === "/hq/login" || pathname.startsWith("/hq/login/")) {
      const storeParam = req.nextUrl.searchParams.get("store");

      if (isLoggedIn) {
        if (role === "ADMIN") {
          return NextResponse.redirect(new URL("/hq/dashboard", req.url));
        }
        // 已登入的 OWNER/STAFF 不應停留在 /hq/login，導回其店後台
        const slug = storeParam || userSlug;
        if (role && isStaffRole(role) && sessionStoreId && (!storeParam || storeParam === session?.user?.storeSlug)) {
          return NextResponse.redirect(new URL(`/s/${slug}/admin/dashboard`, req.url));
        }
      }
      const response = withDomainCookie(routePassThrough(req), domainStoreId);
      // 無 ?store= 參數 = HQ 專用登入入口 → 清除殘留 store context，避免
      // 舊店後台 session 的 store-slug/active-store-id 污染 HQ 登入流程。
      // 有 ?store=X 參數 = 店長登入入口（例如從 /s/X/ 點「後台登入」），
      // 必須保留 store context 讓 OWNER/PARTNER 登入後能正確導回該店後台。
      if (!storeParam) {
        response.cookies.delete("store-slug");
        response.cookies.delete("active-store-id");
        response.cookies.delete("oauth-store-slug");
      }
      return response;
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
      if (
        pathname.startsWith("/hq/dashboard/stores") ||
        pathname === "/hq/dashboard/trial-applications" ||
        pathname.startsWith("/hq/dashboard/trial-applications/")
      ) {
        return withDomainCookie(routePassThrough(req), domainStoreId);
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
    return withDomainCookie(routePassThrough(req), domainStoreId);
  }

  // ==========================================================
  // API routes — 不擋
  // ==========================================================
  if (pathname.startsWith("/api/")) {
    return withDomainCookie(routePassThrough(req), domainStoreId);
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

  // /book, /my-bookings, /my-plans, /profile → /s/{recentStoreOrSessionSlug}/...
  const customerLegacyPrefixes = ["/book", "/my-bookings", "/my-plans", "/profile"];
  const matchedCustomer = customerLegacyPrefixes.find(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (matchedCustomer) {
    const slug = role === "CUSTOMER" ? customerRouteSlug : userSlug;
    const rest = pathname.slice(matchedCustomer.length);
    return NextResponse.redirect(new URL(`/s/${slug}${matchedCustomer}${rest}`, req.url));
  }

  // /dashboard → /hq/dashboard (ADMIN) or /s/{slug}/admin/dashboard (staff)
  if (pathname.startsWith("/dashboard")) {
    if (isLoggedIn && role === "ADMIN") {
      const rest = pathname.slice("/dashboard".length);
      return NextResponse.redirect(
        legacyRedirectUrl(req.nextUrl, `/hq/dashboard${rest}`),
      );
    }
    if (isLoggedIn && sessionStoreId) {
      const slug = userSlug;
      const rest = pathname.slice("/dashboard".length);
      return NextResponse.redirect(
        legacyRedirectUrl(req.nextUrl, `/s/${slug}/admin/dashboard${rest}`),
      );
    }
    return NextResponse.redirect(new URL("/hq/login", req.url));
  }

  // Public legal documents must remain accessible without a session so
  // platform reviewers and users can read them directly.
  if (pathname === "/privacy" || pathname.startsWith("/privacy/")) {
    return withDomainCookie(routePassThrough(req), domainStoreId);
  }

  // SPA Demo has its own direct Preview entries. Do not let the generic
  // legacy fallback send these routes through the default Steamfoot store.
  if (pathname === "/spa-preview" || pathname.startsWith("/spa-preview/")) {
    return withDomainCookie(routePassThrough(req), domainStoreId);
  }

  // /pricing → keep as-is (public)
  if (pathname === "/pricing" || pathname.startsWith("/pricing/")) {
    return withDomainCookie(routePassThrough(req), domainStoreId);
  }

  // / → root redirect
  if (pathname === "/" || pathname === "/entry") {
    if (isLoggedIn) {
      if (role === "CUSTOMER") {
        return NextResponse.redirect(new URL(`/s/${customerRouteSlug}/book`, req.url));
      }
      if (role === "ADMIN") {
        return NextResponse.redirect(new URL("/hq/dashboard", req.url));
      }
      return NextResponse.redirect(new URL(`/s/${userSlug}/admin/dashboard`, req.url));
    }
    // Auth errors must return to the store that initiated OAuth. The cookie is
    // a routing hint only (authorization still happens in page/actions), and
    // it was DB-validated by the sign-in endpoint before being issued.
    const errorStoreSlug =
      req.nextUrl.searchParams.has("error") &&
      oauthStoreSlug &&
      /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(oauthStoreSlug)
        ? oauthStoreSlug
        : DEFAULT_STORE_SLUG;
    return NextResponse.redirect(legacyRedirectUrl(req.nextUrl, `/s/${errorStoreSlug}/`));
  }

  // ── 其他未知路由 ──
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL(`/s/${DEFAULT_STORE_SLUG}/`, req.url));
  }
  return withDomainCookie(routePassThrough(req), domainStoreId);
});

// ============================================================
// Helpers
// ============================================================

/**
 * Every pass-through must replace client-provided route context, just like the
 * scoped rewrite helpers. API handlers and Server Actions authorize against
 * these request headers, never against a caller-supplied store/path hint.
 */
function nonStoreRequestHeaders(req: NextRequest): Headers {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-next-pathname", req.nextUrl.pathname);
  requestHeaders.delete("x-store-slug");
  return requestHeaders;
}

function routePassThrough(req: NextRequest): NextResponse {
  return NextResponse.next({ request: { headers: nonStoreRequestHeaders(req) } });
}

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
 * 注入 store context 供 Server Components / Server Actions 讀取。
 *
 * PR-E2 Codex P1 fix：x-store-slug 改從 response.headers 移到 request.headers
 * （透過 NextResponse.rewrite 的 `request` option），這樣 Server Component
 * 的 `headers()` 才能讀到。原本只寫 response.headers 等於對 server 不存在，
 * 導致 PR-E2 strict gate 收到 null slug → 全部 LIFF page 顯示「無法確認分店」。
 */
function storeRewrite(
  req: NextRequest,
  internalPath: string,
  slug: string,
  domainStoreId: string | undefined
): NextResponse {
  const panelPath = internalPath === "/dashboard/cash-drawer" && req.nextUrl.searchParams.get("cashDrawerPanel") === "1"
    ? "/cash-drawer-panel" : internalPath;
  const url = new URL(panelPath, req.url);
  url.search = req.nextUrl.search;

  // Forward x-store-slug + x-next-pathname 給 internal request，
  // Server Component 的 headers() 才讀得到。
  const requestHeaders = buildStoreRewriteRequestHeaders(
    req.headers,
    slug,
    req.nextUrl.pathname
  );

  const response = NextResponse.rewrite(url, {
    request: { headers: requestHeaders },
  });

  // B7-4.5: 僅注入 store-slug cookie，storeId 由 page-level DB resolver 提供
  // 註：PR-E2 後 LIFF resolveStoreSlugForLiff 已不讀此 cookie；保留是給其他路徑
  //     （legacy customer / auth）用，並維持既有行為。
  response.cookies.set("store-slug", slug, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });
  // Response headers：保留 dual-write，方便 debug 與相容任何讀 response header 的工具。
  // 真正生效的是上方 request.headers，這裡只是觀察用。
  response.headers.set("x-next-pathname", req.nextUrl.pathname);
  response.headers.set("x-store-slug", slug);
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
  const panelPath = internalPath === "/dashboard/cash-drawer" && req.nextUrl.searchParams.get("cashDrawerPanel") === "1"
    ? "/cash-drawer-panel" : internalPath;
  const url = new URL(panelPath, req.url);
  url.search = req.nextUrl.search;
  const requestHeaders = nonStoreRequestHeaders(req);
  const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
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

// The outer boundary runs before auth callbacks, including routes previously
// excluded from proxy. Normal deployments retain the old exclusions verbatim.
const legacyProxyExclusion = /^\/(?:robots\.txt$|sitemap\.xml$|api\/line\/webhook|api\/cron|_next\/static|_next\/image|favicon\.ico)/;
export function proxy(...args: Parameters<typeof authenticatedProxy>) {
  const [req] = args;
  if (req.nextUrl.pathname === "/single-pricing-preview" && !isSinglePricingUiPreview()) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Hide the synthetic-only URL before generic HQ authentication/redirects.
  if (req.nextUrl.pathname === "/hq-usage-preview" && !isHqUsageUiPreview()) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (isGuideUiPreview()) {
    const headers = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };
    if (req.method !== "GET" && req.method !== "HEAD")
      return new NextResponse("Read-only guide preview", { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
    const path = req.nextUrl.pathname;
    if (isSinglePricingUiPreview()) {
      return path === "/single-pricing-preview" || path.startsWith("/_next/static/")
        ? NextResponse.next({ headers })
        : new NextResponse("Not available in pricing preview", { status: 404, headers });
    }
    if (isHqUsageUiPreview()) {
      return path === "/hq-usage-preview" || path.startsWith("/_next/static/")
        ? NextResponse.next({ headers })
        : new NextResponse("Not available in HQ usage preview", { status: 404, headers });
    }
    if (isTrialUiPreview()) {
      const pages = ["/pricing/trial", "/pricing/trial/review", "/pricing/trial/guide/oa-admin", "/pricing/trial/guide/line-id", "/pricing/trial/guide/friend", "/pricing/trial/guide/create", "/pricing/trial/guide/maps", "/pricing/trial/guide/developers"];
      const assets = ["/favicon.ico", "/pricing/brand/steam-butler-logo.png", "/pricing/trial-guides/oa-permissions.png", "/pricing/trial-guides/oa-invite.png", "/pricing/trial-guides/friend.png", "/pricing/trial-guides/create-entry.jpg"];
      return pages.includes(path) || assets.includes(path) || path.startsWith("/_next/static/")
        ? NextResponse.next({ headers })
        : new NextResponse("Not available in trial preview", { status: 404, headers });
    }
    // No optimizer, API, auth, store, admin, arbitrary files, or external URLs.
    if (path.startsWith("/_next/static/") || ["/favicon.ico", "/pricing/brand/steam-butler-logo.png", "/robots.txt", "/sitemap.xml"].includes(path))
      return NextResponse.next({ headers });
    if (!/^\/(?:pricing\/)?guides(?:\/[a-z0-9-]+)?\/?$/.test(path))
      return new NextResponse("Not available in guide preview", { status: 404, headers });
    const marketing = marketingRoute(path);
    if (!marketing || marketing.kind === "not-found")
      return new NextResponse("找不到這篇經營指南", { status: 404, headers });
    const url = req.nextUrl.clone();
    if (marketing.kind === "rewrite" && marketing.destination === "/pricing/guides") {
      const ids = req.nextUrl.searchParams.getAll("guide");
      const selected = ids.length === 1 ? findPublicGuide(ids[0]) : undefined;
      if (selected) {
        url.pathname = guidePath(selected);
        url.search = "";
        const response = NextResponse.redirect(url, 308);
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        return response;
      }
    }
    url.pathname = marketing.destination;
    const response = marketing.kind === "redirect" ? NextResponse.redirect(url, 308) : NextResponse.rewrite(url);
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
  if (legacyProxyExclusion.test(req.nextUrl.pathname)) return NextResponse.next();
  return authenticatedProxy(...args);
}

export const config = { matcher: ["/:path*"] };
