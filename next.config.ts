import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: "1.5.0",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString().slice(0, 16).replace("T", " "),
    NEXT_PUBLIC_BUILD_ENV:
      process.env.VERCEL_ENV === "production"
        ? "prod"
        : process.env.VERCEL_ENV === "preview"
          ? "staging"
          : process.env.NODE_ENV === "production"
            ? "prod"
            : "dev",
  },
};

export default nextConfig;
