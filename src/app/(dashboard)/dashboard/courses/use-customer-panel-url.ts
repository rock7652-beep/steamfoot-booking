"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Keep the current client panel identity after an older action refreshes the route. */
export function useCustomerPanelUrl(enabled: boolean, customerId: string | null, studentTab?: string) {
  const params = useSearchParams();
  const routedId = params.get("customerId");
  const routedTab = params.get("studentTab");
  useEffect(() => {
    if (!enabled || (routedId === customerId && (studentTab === undefined || routedTab === (customerId ? studentTab : null)))) return;
    const url = new URL(window.location.href);
    if (customerId) url.searchParams.set("customerId", customerId);
    else { url.searchParams.delete("customerId"); for(const key of ["studentSubject","studentMethod","studentPeriods"])url.searchParams.delete(key); }
    if (studentTab !== undefined) {
      if (customerId) url.searchParams.set("studentTab", studentTab);
      else url.searchParams.delete("studentTab");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [enabled, customerId, routedId, studentTab, routedTab]);
}
