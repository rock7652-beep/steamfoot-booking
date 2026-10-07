// This review branch must not deploy or access a database before separate approval.
if ([process.env.VERCEL_GIT_COMMIT_REF, process.env.WORKERS_CI_BRANCH, process.env.CF_PAGES_BRANCH].includes("fix/public-seo-crawlers-20261007")) {
  throw new Error("SEO review branch deployment is disabled; use local verification.");
}

import { isGuideUiPreview } from "./scripts/guide-ui-preview-scope.mjs";
isGuideUiPreview(); // Validate the isolated mode before Next build work.

import type { NextConfig } from "next";
import { assertSportsSharedCardPreviewEnvironment, isSportsSharedCardMockedUnitTest } from "./scripts/sports-shared-card-preview-scope.mjs";

// A provider build-command override must not bypass the Preview-only preflight.
// This temporary release guard must be reviewed before any production release.
if (!isGuideUiPreview() && !isSportsSharedCardMockedUnitTest(process.env)) {
  assertSportsSharedCardPreviewEnvironment(process.env);
}

// Vercel can override package.json's build command, so enforce isolation here too.
if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "feat/hq-store-organization-order") {
  const isolated = (value: string | undefined) => {
    try {
      const url = new URL(value ?? "");
      return ["postgres:", "postgresql:"].includes(url.protocol) && (url.hostname === "db.ttworfzgwejdeolegkxl.supabase.co" || (/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && url.username === "postgres.ttworfzgwejdeolegkxl"));
    } catch { return false; }
  };
  if (![process.env.DATABASE_URL, process.env.DIRECT_URL].every(isolated)) throw new Error("HQ organization Preview requires the isolated database for both connections.");
}

const HEALTH_TRACKER_URL = "https://www.healthflow-ai.com/liff";

const nextConfig: NextConfig = {
  images: isGuideUiPreview() ? {
    unoptimized: true,
    remotePatterns: [],
    localPatterns: [{ pathname: "/pricing/brand/steam-butler-logo.png", search: "" }],
  } : {
    remotePatterns: [{ protocol: "https", hostname: "profile.line-scdn.net" }],
  },
  env: {
    NEXT_PUBLIC_BUILD_VERSION: "2.8.0",
    NEXT_PUBLIC_BUILD_TIME: new Date().toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    // TODO(PR2): relies on env — verify against docs/deployment.md matrix.
    // 此處為 build-time inline 計算，無法直接 import runtime-env helper
    // （next.config.ts 在 Next.js 編譯前執行）。若規則變動需同步 src/lib/runtime-env.ts。
    NEXT_PUBLIC_BUILD_ENV:
      process.env.VERCEL_ENV === "production"
        ? "prod"
        : process.env.VERCEL_ENV === "preview"
          ? "staging"
          : process.env.NODE_ENV === "production"
            ? "prod"
            : "dev",
  },
  async headers() {
    // Vercel marks Preview explicitly; production behavior is unchanged.
    return process.env.VERCEL_ENV === "preview"
      ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]
      : [];
  },
  async redirects() {
    if (isGuideUiPreview()) return []; // No external redirects before the proxy guard.
    return [
      // 保底轉址：LINE 圖文選單 / 舊連結 / 外部分享連結
      // query string 自動保留（Next.js 預設行為）
      {
        source: "/health",
        destination: HEALTH_TRACKER_URL + "/",
        permanent: false, // 302 — 方便日後改網域
      },
      {
        source: "/body-index",
        destination: HEALTH_TRACKER_URL + "/",
        permanent: false,
      },
      {
        source: "/health-tracker",
        destination: HEALTH_TRACKER_URL + "/",
        permanent: false,
      },
      // 子路徑也攔截（例如 /health/login, /health/dashboard 等）
      {
        source: "/health/:path*",
        destination: HEALTH_TRACKER_URL + "/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
