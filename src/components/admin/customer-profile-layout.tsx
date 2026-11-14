"use client";

import {useState,type ReactNode} from "react";
import {CustomerPhoneLink} from "@/components/customer-detail-fields";
import {ExclusiveMenu} from "./exclusive-menu";
import {getLineNotificationStatus,lineNotificationShortLabel} from "@/lib/line-notification-status";

export type CustomerProfileSection = "overview" | "data" | "health";
/** Only stable customer sections belong in the main navigation. */
export function CustomerProfileNavigation({value,onChange,healthEnabled=false,disabled=false}:{value:CustomerProfileSection;onChange:(section:CustomerProfileSection)=>void;healthEnabled?:boolean;disabled?:boolean}) {
  const sections:Array<[CustomerProfileSection,string]>=[["overview","總覽"],["data","資料"],...(healthEnabled?[["health","健康追蹤"] as [CustomerProfileSection,string]]:[])];
  return <nav aria-label="顧客資料分區" className="flex shrink-0 flex-wrap gap-1 border-b border-earth-200 bg-earth-50 px-4 py-2">{sections.map(([key,label])=><button key={key} type="button" disabled={disabled} aria-current={value===key?"page":undefined} className={`min-h-11 rounded-lg px-3 text-sm disabled:opacity-50 ${value===key?"bg-primary-50 font-semibold text-primary-800":"text-earth-600 hover:bg-primary-50"}`} onClick={()=>onChange(key)}>{label}</button>)}</nav>;
}

export function CustomerProfileSectionHeading({title,onBack,disabled=false}:{title:string;onBack:()=>void;disabled?:boolean}) {
  return <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-earth-100 pb-1"><button type="button" disabled={disabled} onClick={onBack} className="min-h-11 text-sm text-primary-700 disabled:opacity-50">‹ 返回總覽</button><h3 className="text-sm font-semibold text-primary-900">{title}</h3></div>;
}

export function CustomerRecordsFilter({value,onChange,canReadBookings,canReadTransactions,service=false,disabled=false}:{value:"bookings"|"purchases";onChange:(value:"bookings"|"purchases")=>void;canReadBookings:boolean;canReadTransactions:boolean;service?:boolean;disabled?:boolean}) {
  return <label className="flex min-h-11 flex-wrap items-center gap-2 text-sm text-earth-600">紀錄類型<select aria-label="紀錄類型" disabled={disabled} className="min-h-11 rounded-lg border border-earth-200 bg-white px-3 text-sm text-primary-900" value={value} onChange={event=>onChange(event.target.value as typeof value)}>{canReadBookings&&<option value="bookings">{service?"預約／服務":"預約／上課"}</option>}{canReadTransactions&&<option value="purchases">收款／消費</option>}</select></label>;
}

/** Shared profile chrome; permissions, reads and writes stay with each module. */
export function CustomerProfileHeader({name,labelledById,busy,editing,onEdit,onBack,onClose,more,actions}:{
  name:string;labelledById:string;busy:boolean;editing:boolean;onEdit?:()=>void;onBack:()=>void;onClose:()=>void;more?:ReactNode;actions?:ReactNode;
}) {
  return <header className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-earth-100 px-4 py-2">
    <div className="flex min-w-0 flex-1 items-start gap-1">
      <h2 id={labelledById} className="min-w-0 break-words py-3 text-base font-semibold text-primary-900">{name}</h2>
      {onEdit&&!editing&&<button type="button" aria-label="編輯顧客資料" disabled={busy} onClick={onEdit} className="min-h-11 min-w-11 shrink-0 rounded-lg text-primary-700 disabled:opacity-50">✎</button>}
    </div>
    <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1">
      {!editing&&actions}
      {editing?<button type="button" disabled={busy} onClick={onBack} className="min-h-11 px-3 text-sm text-primary-700">返回總覽</button>:more&&<ExclusiveMenu quiet label="顧客更多操作" triggerText="⋯">{more}</ExclusiveMenu>}
      <button type="button" aria-label="關閉顧客資料" disabled={busy} onClick={onClose} className="min-h-11 min-w-11 rounded-lg text-2xl text-earth-500 disabled:opacity-50">×</button>
    </div>
  </header>;
}

export function CustomerProfileIdentity({phone,connection,labels,actions}:{phone:string;connection?:ReactNode;labels:ReactNode;actions:ReactNode}) {
  return <section aria-label="顧客聯絡與常用操作" className="space-y-1 pb-1">
    <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-1"><CustomerPhoneLink phone={phone}/>{connection}</div>
    {labels}
    <div className="flex flex-wrap gap-2">{actions}</div>
  </section>;
}

export function CustomerOverviewBody({next,cards,attribution,note,details,actions}:{
  next?:ReactNode;cards?:ReactNode;attribution?:ReactNode;note?:ReactNode;details?:ReactNode;actions?:ReactNode;
}) {
  return <section aria-label="顧客總覽" className="space-y-2 pt-2">
    {next}{cards}{attribution}{note}
    {details&&<details className="border-t border-earth-100 text-sm"><summary className="min-h-11 cursor-pointer py-3 text-primary-700">基本資料</summary>{details}</details>}
    {actions}
  </section>;
}

/** Read detailed connection status only on intent, without equating Login and delivery. */
export function CustomerProfileConnection({label,children,onManage}:{label:string;children?:ReactNode;onManage?:()=>void}) {
  const [open,setOpen]=useState(false);
  if(onManage)return <button type="button" onClick={onManage} className="min-h-11 min-w-0 break-words py-2 text-left text-sm text-primary-700">LINE 通知：{label} · 管理</button>;
  return <details className="min-w-0 text-sm" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer py-2 text-primary-700">LINE 通知：{label} · 管理</summary>
    {open&&children}
  </details>;
}

/** A stored display name alone does not prove that this store's LINE is linked. */
export function customerProfileLineLabel(status:string|null|undefined,name:string|null|undefined,lineUserId:string|null|undefined) {
  if(!status||!["LINKED","UNLINKED","BLOCKED"].includes(status))return "待核對";
  const notification=getLineNotificationStatus({lineLinkStatus:status,lineUserId});
  if(notification==="enabled"&&name?.trim())return `已連結（${name.trim()}）`;
  return lineNotificationShortLabel(notification);
}
