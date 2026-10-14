"use client";

/**
 * DashboardLink — Drop-in `<Link>` wrapper that preserves the current route prefix.
 *
 * 問題：(dashboard)/dashboard/* 是 Next 內部路由，但使用者實際看到的 pathname 會是
 *   /hq/dashboard/...           （HQ 後台，proxy rewrite）
 *   /s/{slug}/admin/dashboard/... （店家後台，proxy rewrite）
 *   /dashboard/...              （legacy 直連）
 * 若程式硬寫 `href="/dashboard/bookings"`，在 store admin 下點擊會掉到 /dashboard/bookings
 * → 被 layout redirect 到 /hq/login → 使用者體驗崩壞。
 *
 * 解法：用這個 wrapper 取代 `next/link`。它會用 `usePathname()` 推出當前 prefix，
 * 再自動把以 `/dashboard/` 開頭的 href 前綴上正確的 prefix。
 *
 * 使用：
 *   import { DashboardLink as Link } from "@/components/dashboard-link"
 *   <Link href="/dashboard/bookings">預約管理</Link>
 *   <Link href={`/dashboard/customers/${id}`}>顧客</Link>
 *
 * 邊界：
 * - href 為外部 URL（"https://..."）或非 /dashboard 開頭（"/hq/login", "#anchor"）→ 原樣 passthrough
 * - `prefetch` / `className` / `onClick` 等其他 props 全部 pass 到底層 `<Link>`
 * - 支援 href 為字串（目前專案唯一用法）；如需要 UrlObject 傳入，請用原生 `<Link>`
 */

import { scopedNavigationHref } from "@/lib/navigation-target";
import { usePathname } from "next/navigation";
import { AppLink as Link } from "./app-link";
import type { ComponentProps, ReactNode } from "react";

/** Dashboard links and programmatic navigation share the same scope rule. */
export function resolveDashboardHref(href: string, currentPathname: string): string {
  return scopedNavigationHref(href, currentPathname);
}

type Props = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  children: ReactNode;
};

export function DashboardLink({ href, children, ...rest }: Props) {
  const pathname = usePathname();
  const resolved = resolveDashboardHref(href, pathname);
  return (
    <Link href={resolved} {...rest}>
      {children}
    </Link>
  );
}
