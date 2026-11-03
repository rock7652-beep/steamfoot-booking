"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";
/** Server decides whether this isolated Preview control is available. */
export function MusicDataScopeFilter({enabled,label="資料分類"}:{enabled:boolean;label?:string}){
 const pathname=usePathname(),params=useSearchParams();
 if(!enabled)return null;
 const legacy=params.get("dataScope")==="legacy";
 const href=(value:boolean)=>{const query=new URLSearchParams(params.toString());query.delete("page");query.delete("trialPage");query.delete("customerId");query.delete("action");query.delete("session");query.delete("returnQuery");query.delete("returnStudentId");query.delete("returnStudentQuery");query.delete("studentTab");if(value)query.set("dataScope","legacy");else query.delete("dataScope");return `${pathname}?${query}`;};
 return <nav aria-label={label} className="my-2 flex flex-wrap items-center gap-2 rounded-lg border border-earth-200 bg-white p-2">{[false,true].map(value=><DashboardLink key={String(value)} href={href(value)} aria-current={legacy===value?"page":undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm ${legacy===value?"bg-primary-50 font-semibold text-primary-800":""}`}>{value?"舊驗收資料":"營運資料"}</DashboardLink>)}<span className="text-sm text-earth-500">依已核對紀錄分類；來源未確認者仍保留於營運。</span></nav>;
}
