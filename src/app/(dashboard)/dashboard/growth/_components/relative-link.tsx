"use client";

/**
 * RelativeLink — 以當前 URL 為基底組 href。
 *
 * 為何需要：(dashboard)/dashboard/* 是內部 route，但實際使用者看到的 pathname
 * 會是 `/s/{slug}/admin/dashboard/...` 或 `/hq/dashboard/...`（由 proxy rewrite）。
 * Server component 無法安全拿到「外部 pathname」，因此把 href 組裝放在 client。
 *
 * 使用方式：
 * 1) 不傳 `to`：沿用當前 pathname（切 filter / 分頁用）
 *    <RelativeLink params={{ filter: "stagnant" }} />
 *
 * 2) 傳 `to`（以 `/dashboard/...` 開頭）：保留 route prefix 切到內部路徑（breadcrumb 用）
 *    <RelativeLink to="/dashboard/growth">← 成長系統</RelativeLink>
 *    - 在 /hq/... 下 → /hq/dashboard/growth
 *    - 在 /s/{slug}/admin/... 下 → /s/{slug}/admin/dashboard/growth
 *    - legacy 直連 /dashboard/... → /dashboard/growth
 */

import { usePathname } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import type { ComponentProps, ReactNode } from "react";

type Props = {
  /**
   * 目的內部路徑（以 "/dashboard/..." 開頭）。省略時沿用當前 pathname。
   * RelativeLink 會偵測當前 route 的 prefix（/hq 或 /s/{slug}/admin），自動前綴。
   */
  to?: string;
  /** 要帶的 query params；值為 null / undefined / "" 的會被略過 */
  params?: Record<string, string | number | null | undefined>;
  className?: string;
  children: ReactNode;
  "aria-disabled"?: boolean;
  title?: string;
} & Omit<ComponentProps<typeof Link>, "href" | "children" | "className" | "title">;

function extractPrefix(pathname: string): string {
  const storeMatch = pathname.match(/^(\/s\/[^/]+\/admin)\/dashboard/);
  if (storeMatch) return storeMatch[1];
  const hqMatch = pathname.match(/^(\/hq)\/dashboard/);
  if (hqMatch) return hqMatch[1];
  return "";
}

export function RelativeLink({ to, params, className, children, ...rest }: Props) {
  const pathname = usePathname();
  const basePath = to ? `${extractPrefix(pathname)}${to}` : pathname;

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v == null) continue;
    const s = String(v);
    if (s === "") continue;
    sp.set(k, s);
  }
  const query = sp.toString();
  const href = query ? `${basePath}?${query}` : basePath;
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}
