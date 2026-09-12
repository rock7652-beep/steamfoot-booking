"use client";

import { NavigationNotice } from "./navigation-notice";
import Link, { useLinkStatus } from "next/link";
import { useState, type ComponentProps } from "react";

function PendingFeedback() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <NavigationNotice />;
}

/** Warm read-only form routes on intent; retain explicit prefetch opt-outs. */
export function AppLink({ children, prefetch, onMouseEnter, onFocus, ...props }: ComponentProps<typeof Link>) {
  const [intentHref, setIntentHref] = useState<string | null>(null);
  const href = typeof props.href === "string" ? props.href : "";
  // No capacity / balances / accounting snapshots in the full-route allowlist.
  // Existing Server Action revalidatePath calls invalidate these form pages.
  const warmForm = /\/dashboard\/customers\/[^/?#]+(?:\/edit)?$/.test(href)
    || /^\/s\/[^/]+\/profile$/.test(href);
  return (
    <Link {...props} prefetch={prefetch === undefined || prefetch === null ? (warmForm && intentHref === href ? true : null) : prefetch}
      onMouseEnter={(event) => { setIntentHref(href); onMouseEnter?.(event); }}
      onFocus={(event) => { setIntentHref(href); onFocus?.(event); }}>
      {children}
      <PendingFeedback />
    </Link>
  );
}
