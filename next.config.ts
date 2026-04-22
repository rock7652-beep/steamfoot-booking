import type { NextConfig } from "next";

const HEALTH_TRACKER_URL = "https://www.healthflow-ai.com/liff";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: "2.6.0",
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
  async redirects() {
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
