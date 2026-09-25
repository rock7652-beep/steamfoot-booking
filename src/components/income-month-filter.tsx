"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** Course income only: choosing a month immediately updates the current view. */
export function IncomeMonthFilter({month}:{month:string}) {
 const router=useRouter(),pathname=usePathname(),params=useSearchParams();
 const [pending,start]=useTransition();
 return <div className="flex min-h-11 items-center gap-2">
 <label className="text-sm">月份<input aria-label="月份" className="ml-2 min-h-11 max-w-[12rem] rounded-lg border border-earth-200 bg-white px-3 text-base" type="month" min="2000-01" max="2099-12" value={month} disabled={pending} onChange={e=>{
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value))return;
  const next=new URLSearchParams(params.toString());next.set('month',e.target.value);
  start(()=>router.push(`${pathname}?${next}`,{scroll:false}));
 }}/></label>{pending&&<span role="status" className="text-xs text-earth-500">讀取中…</span>}
 </div>;
}
