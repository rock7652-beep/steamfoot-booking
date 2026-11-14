"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Keep the current client panel identity after an older action refreshes the route. */
export function useCustomerPanelUrl(enabled: boolean, customerId: string | null, studentTab?: string, studentRecords?: string) {
  const params = useSearchParams();
  const router = useRouter();
  const routedId = params.get("customerId");
  const routedTab = params.get("studentTab");
  const routedRecords = params.get("studentRecords");
  useEffect(() => {
    if (!enabled || (routedId === customerId && (studentTab === undefined || routedTab === (customerId ? studentTab : null)) && (studentRecords === undefined || routedRecords === (customerId ? studentRecords : null)))) return;
    const url = new URL(window.location.href);
    if (customerId) url.searchParams.set("customerId", customerId);
    else { url.searchParams.delete("customerId"); for(const key of ["studentSubject","studentMethod","studentPeriods"])url.searchParams.delete(key); }
    if (studentTab !== undefined) {
      if (customerId) url.searchParams.set("studentTab", studentTab);
      else url.searchParams.delete("studentTab");
    }
    if (studentRecords !== undefined) {
      if (customerId) url.searchParams.set("studentRecords", studentRecords);
      else url.searchParams.delete("studentRecords");
    }
    // Route through Next so an in-flight read cannot restore an older history tree.
    // Keep the panel identity and record type in one navigation.
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [enabled, customerId, routedId, studentTab, routedTab, studentRecords, routedRecords, router]);
}
