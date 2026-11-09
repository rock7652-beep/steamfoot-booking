"use client";
import {useSearchParams,useRouter,usePathname} from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { OPERATIONS_AREAS, operationsHref, scopedOperationsHref, type OperationsArea, type OperationsQuery } from "@/lib/operations-navigation";
export function RevenueTabs({ active = "ledger", query = {}, beautyLedger = false, available = OPERATIONS_AREAS.map(area => area.id) }: {
  active?: OperationsArea; query?: OperationsQuery; beautyLedger?: boolean; available?: readonly OperationsArea[];
  readOnly?: boolean; showMonthly?: boolean;
}) {
  const params=useSearchParams(),router=useRouter(),pathname=usePathname();
  const currentQuery=params?{dateFrom:query.dateFrom,dateTo:query.dateTo,...Object.fromEntries(params)}:query;
  return <nav aria-label="營運頁籤" className="flex min-w-0 flex-wrap gap-1 border-b border-earth-200 pb-2">
    {OPERATIONS_AREAS.filter(area => available.includes(area.id)).map(area => <Link key={area.id}
      href={operationsHref(area.id, currentQuery, beautyLedger)} onClick={event=>{
        if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
        // Native history updates can precede React's render; use the actual URL at click time.
        const latest={dateFrom:query.dateFrom,dateTo:query.dateTo,...Object.fromEntries(new URL(window.location.href).searchParams)};
        const href=scopedOperationsHref(operationsHref(area.id,latest,beautyLedger),pathname);
        if(new URL(event.currentTarget.href).pathname+new URL(event.currentTarget.href).search!==href){event.preventDefault();router.push(href,{scroll:false});}
      }} aria-current={area.id === active ? "page" : undefined}
      className={`flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-sm ${area.id === active ? "border-b-2 border-primary-600 bg-primary-50 font-medium text-primary-800" : "text-earth-600 hover:bg-earth-50"}`}>
      {area.label}
    </Link>)}
  </nav>;
}
