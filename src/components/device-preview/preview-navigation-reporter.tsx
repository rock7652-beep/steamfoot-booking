"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isPreviewableDashboardPath } from "@/lib/device-preview";

const PREVIEW_NAVIGATION_MESSAGE = "steamfoot-device-preview:navigation";

export function PreviewNavigationReporter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDevicePreview = searchParams.get("devicePreview") === "1";

  useEffect(() => {
    if (!isDevicePreview || window.parent === window) return;

    const query = searchParams.toString();
    window.parent.postMessage(
      {
        type: PREVIEW_NAVIGATION_MESSAGE,
        path: query ? `${pathname}?${query}` : pathname,
      },
      window.location.origin,
    );
  }, [isDevicePreview, pathname, searchParams]);

  useEffect(() => {
    if (!isDevicePreview) return;

    const preservePreviewMode = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;

      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const destination = new URL(anchor.href, window.location.origin);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === "/dashboard/device-preview") {
        event.preventDefault();
        return;
      }
      if (!isPreviewableDashboardPath(destination.pathname)) return;

      destination.searchParams.set("devicePreview", "1");
      anchor.href = destination.toString();
    };

    document.addEventListener("click", preservePreviewMode, true);
    return () => document.removeEventListener("click", preservePreviewMode, true);
  }, [isDevicePreview]);

  return null;
}

export { PREVIEW_NAVIGATION_MESSAGE };
