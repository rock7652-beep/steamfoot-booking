"use client";

import { startTransition, useMemo } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { navigationTarget, scopedNavigationHref } from "@/lib/navigation-target";

/** Same-page query changes keep position; new routes retain normal navigation.
 * Refresh remains authoritative and merges into the mounted UI in a transition.
 * No cached data, authentication, store switch or permission check is bypassed.
 */
export function useRouter() {
  const router = useNextRouter();
  return useMemo(() => {
    const navigate = (method: "push" | "replace", href: string, options?: Parameters<typeof router.push>[1]) => {
      if (typeof window === "undefined") return;
      const target = navigationTarget(href, window.location.href);
      if (target.unchanged) return;
      const nextOptions = target.preserveScroll ? { scroll: false, ...options } : options;
      startTransition(() => router[method](target.href, nextOptions));
    };
    return {
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) => navigate("push", href, options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) => navigate("replace", href, options),
      prefetch: (href: string, options?: Parameters<typeof router.prefetch>[1]) => router.prefetch(scopedNavigationHref(href, window.location.pathname), options),
      refresh: () => startTransition(() => router.refresh()),
    };
  }, [router]);
}
