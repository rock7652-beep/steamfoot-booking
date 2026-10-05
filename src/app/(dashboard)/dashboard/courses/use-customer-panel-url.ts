"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Keep the current client panel identity after an older action refreshes the route. */
export function useCustomerPanelUrl(enabled: boolean, customerId: string | null) {
  const params = useSearchParams();
  const routedId = params.get("customerId");
  useEffect(() => {
    if (!enabled || routedId === customerId) return;
    const url = new URL(window.location.href);
    if (customerId) url.searchParams.set("customerId", customerId);
    else url.searchParams.delete("customerId");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [enabled, customerId, routedId]);
}
