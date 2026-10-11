"use client";

import { createContext, useEffect, type ComponentProps } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DashboardLink, resolveDashboardHref } from "@/components/dashboard-link";
import { useRetainedState } from "@/components/operations/operation-scope";

const SETTINGS_LOCATION_KEY = "settings:location";
const validLocation = (value: unknown): value is string => typeof value === "string"
  && value.length <= 4096
  && /^(?:\/s\/[^/?#]+\/admin|\/hq)?\/dashboard\/settings(?:[?#]|$)/.test(value);

/** Only the Steam/SPA workspace provides this; other shared-row consumers are unchanged. */
export const SettingsNavigationContext = createContext<string | null>(null);

function scopeParams(search: string) {
  const current = new URLSearchParams(search);
  const params = new URLSearchParams();
  for (const key of ["module", "store", "storeId"]) {
    current.getAll(key).forEach(value => params.append(key, value));
  }
  return params;
}

export function settingsWorkspaceHref(href: string, search: string): string {
  if (!/^\/dashboard\/settings(?:[/?#]|$)/.test(href)) return href;
  const { pathname, searchParams: target, hash } = new URL(href, "https://settings.invalid");
  // A child has its own filters, but must not drop explicit module/store context.
  const params = pathname === "/dashboard/settings" ? new URLSearchParams(search) : scopeParams(search);
  for (const key of new Set(target.keys())) {
    params.delete(key);
    target.getAll(key).forEach(value => params.append(key, value));
  }
  const next = params.toString();
  return `${pathname}${next ? `?${next}` : ""}${hash}`;
}

export function useRememberSettingsLocation() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [, remember] = useRetainedState(SETTINGS_LOCATION_KEY, "", validLocation);
  useEffect(() => {
    // Keep the exact query encoding used by the existing ReturnPosition scroll key.
    remember(window.location.pathname + window.location.search + window.location.hash);
  }, [pathname, search, remember]);
}

/** Return to the last settings URL inside the account/store/module OperationScope. */
export function SettingsReturnLink({ href, ...props }: ComponentProps<typeof DashboardLink>) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [retained] = useRetainedState(SETTINGS_LOCATION_KEY, "", validLocation);
  const settingsPath = resolveDashboardHref("/dashboard/settings", pathname);
  const target = resolveDashboardHref(href, pathname);
  const isSettingsReturn = target.split(/[?#]/)[0] === settingsPath;
  const isSameSettingsRoot = retained.split(/[?#]/)[0] === settingsPath;
  const fallback = settingsWorkspaceHref(href, scopeParams(search).toString());
  return <DashboardLink {...props} href={isSettingsReturn && isSameSettingsRoot ? retained : fallback} />;
}
