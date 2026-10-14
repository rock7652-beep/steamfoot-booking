"use client";

import { usePathname } from "next/navigation";
import { NavigationNotice } from "./navigation-notice";
import Link, { useLinkStatus } from "next/link";
import {useContext} from "react";
import {SettingsPanelContext} from "@/components/admin/settings-panel-context";
import { useState, type ComponentProps } from "react";

function PendingFeedback() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <NavigationNotice />;
}

/** Warm read-only form routes on intent; retain explicit prefetch opt-outs. */
export function AppLink({ children, prefetch, onMouseEnter, onFocus, onClick, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const localSettings=useContext(SettingsPanelContext)?.local;
  const [intentHref, setIntentHref] = useState<string | null>(null);
  const href = typeof props.href === "string" ? props.href : "";
  const target = href ? new URL(href, `https://navigation.invalid${pathname}`) : null;
  const localQuery = target?.origin === "https://navigation.invalid" && target.pathname === pathname && !!target.search && !target.hash;
  // No capacity / balances / accounting snapshots in the full-route allowlist.
  // Existing Server Action revalidatePath calls invalidate these form pages.
  const warmForm = /\/dashboard\/customers\/[^/?#]+(?:\/edit)?$/.test(href)
    || /^\/s\/[^/]+\/profile$/.test(href);
  return (
    <Link {...props} scroll={props.scroll ?? (localQuery ? false : undefined)} prefetch={localSettings ? false : prefetch === undefined || prefetch === null ? (warmForm && intentHref === href ? true : null) : prefetch}
      onClick={event => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === "_blank" || props.download) return;
        if (event.currentTarget.href === window.location.href) event.preventDefault();
      }}
      onMouseEnter={(event) => { setIntentHref(href); onMouseEnter?.(event); }}
      onFocus={(event) => { setIntentHref(href); onFocus?.(event); }}>
      {children}
      <PendingFeedback />
    </Link>
  );
}
