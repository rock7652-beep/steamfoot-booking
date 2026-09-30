"use client";
import type { ReactNode } from "react";
import { CustomerLabels } from "@/components/customer-labels";


/** Shared identity layout; business status and balances belong in adjacent columns. */
export function CustomerListIdentity({customerId,name,phone,readOnly=false,displayOnly=false}:{customerId?:string;name:ReactNode;phone?:string|null;readOnly?:boolean;displayOnly?:boolean}) {
  const number = phone?.trim() && !phone.trim().startsWith("_") ? phone.trim() : null;
  const displayPhone = number?.replace(/^(09\d{2})(\d{3})(\d{3})$/, "$1-$2-$3");
  return <div className="min-w-0">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="min-w-0 break-words text-sm font-medium text-earth-900">{name}</span>
      {number ? <a href={`tel:${number}`} aria-label={`撥打 ${number}`} onClick={e=>e.stopPropagation()} className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded px-2 text-xs tabular-nums text-primary-700 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-600">☎ {displayPhone}<span className="ml-1 text-[11px]">撥打</span></a> : <span className="text-xs text-earth-400">未留電話</span>}
    </div>
    {customerId && <CustomerLabels customerId={customerId} readOnly={readOnly} displayOnly={displayOnly}/>}
  </div>;
}
