"use client";
import { useState } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { CareRowActions } from "./care-row-actions";
import type { CareActivity, CareReason } from "@/lib/customer-care-lifecycle";
import type { IndustryModuleId } from "@/lib/industry-modules";

export interface CareItem {
  customerId: string; name: string; phoneMasked: string; reason: string; meta: string | null;
  planDetails?: string[];
  staffLabel?: string; staffName: string | null; lastFollowUpText: string | null; script: string;
  readOnly?: boolean; courseMode?: boolean; canFollowUp?: boolean; canBook?: boolean;
  module?: IndustryModuleId; careReason?: CareReason; careYear?: number;
  activity?: CareActivity | null; nextBooking?: string | null;
  state?: "pending" | "handled"; label?: string;
}
const DEFAULT_VISIBLE_COUNT = 5;
export function CareSection({ title, description, emptyText, items, totalCount }: {
  title: string; description: string; emptyText: string; items: CareItem[]; totalCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, DEFAULT_VISIBLE_COUNT);
  return <section className="@container min-w-0 space-y-1" aria-label={title}>
    <header className="flex min-h-11 items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-earth-900">{title} <span className="ml-1 inline-flex min-w-6 justify-center rounded-md bg-earth-100 px-1.5 py-0.5 font-normal tabular-nums text-earth-600">{totalCount} 位</span></h2>
      {items.length > DEFAULT_VISIBLE_COUNT && <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-primary-700 hover:bg-primary-50">{expanded ? "收合" : `查看全部（${items.length}）`}</button>}
    </header>
    {items.length === 0 ? <p className="pb-1 text-sm text-earth-500">{emptyText || "目前沒有符合條件的顧客。"}</p> : <>
      <span className="sr-only">{description}</span>
      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white">
        <div className="hidden grid-cols-[minmax(140px,1fr)_minmax(220px,2fr)_minmax(100px,0.7fr)_180px] items-center gap-3 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-900 @[800px]:grid"><span>顧客</span><span>提醒與狀態</span><span>{items[0]?.staffLabel ?? (items[0]?.courseMode ? "所屬教練" : "所屬店長")}</span><span className="text-right">操作</span></div>
        <div className="divide-y divide-earth-100">{visible.map(item => <div key={item.customerId} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-3 py-2 @[800px]:grid-cols-[minmax(140px,1fr)_minmax(220px,2fr)_minmax(100px,0.7fr)_180px] @[800px]:items-center">
          <div className="min-w-0"><Link href={item.courseMode ? `/dashboard/courses?view=customers&customerId=${encodeURIComponent(item.customerId)}` : `/dashboard/customers?customerId=${encodeURIComponent(item.customerId)}`} className="inline-flex min-h-8 items-center break-words text-sm font-semibold text-primary-900 hover:underline">{item.name}</Link><p className="text-xs text-earth-600">{item.phoneMasked}</p></div>
          <div className="col-span-2 min-w-0 break-words @[800px]:col-span-1"><p className="text-sm text-earth-800">{item.reason}</p>{item.meta && <p className="text-sm leading-5 text-earth-600">{item.meta}</p>}{item.planDetails && item.planDetails.length > 0 && <details className="text-sm text-earth-600"><summary className="inline-flex min-h-11 cursor-pointer items-center text-primary-700">另 {item.planDetails.length} 張方案 · 展開</summary><ul className="space-y-1 pb-2">{item.planDetails.map((detail, index) => <li key={index} className="leading-5">{detail}</li>)}</ul></details>}<div className="flex flex-wrap items-center gap-x-2 gap-y-1">{item.label && item.label !== "待關懷" && item.label !== "待祝福" && <span className={`text-xs font-medium ${item.state === "handled" ? "text-primary-700" : "text-earth-600"}`}>{item.label}</span>}{item.nextBooking && <span className="text-xs text-primary-700">下次預約 {item.nextBooking}</span>}</div>{item.activity ? <p className="text-xs leading-5 text-earth-600">{item.activity.date} · {item.activity.by}{item.activity.note ? ` · ${item.activity.note}` : ""}</p> : item.lastFollowUpText && <p className="text-xs text-earth-600">{item.lastFollowUpText}</p>}</div>
          <p className="col-span-2 min-w-0 text-sm text-earth-600 @[800px]:col-span-1">{item.staffName || "未指派"}</p>
          <div className="col-start-2 row-start-1 @[800px]:col-start-auto @[800px]:row-start-auto"><CareRowActions item={item}/></div>
        </div>)}</div>
      </div>
    </>}
  </section>;
}
