"use client";
import { createContext, useContext, useState } from "react";
import { CareSection, type CareItem } from "./care-section";
import { careDisposition, type CareActivity, type CareReason } from "@/lib/customer-care-lifecycle";
import { useRetainedState, retainedString } from "@/components/operations/operation-scope";

export type CareSectionData = { reason: CareReason; title: string; description: string; emptyText: string; items: CareItem[] };
const CareContext = createContext<{ today: string; items: CareItem[]; onSaved: (customerId: string, activity: CareActivity) => void } | null>(null);
export const useCareWorkspace = () => useContext(CareContext);

export function CareWorkspace({ sections, history, today, selected }: { sections: CareSectionData[]; history: CareItem[]; today: string; selected?: CareReason | null }) {
  const [tab, setTab] = useRetainedState("customer-care:tab", "pending", retainedString);
  const [saved, setSaved] = useState<Record<string, CareActivity>>({});
  const apply = (item: CareItem) => {
    const local = saved[`${item.customerId}:${item.careReason}`];
    const serverIsCurrent = item.activity?.id === local?.id || (item.activity?.createdAt && local?.createdAt && item.activity.createdAt >= local.createdAt);
    const activity = local && !serverIsCurrent ? local : item.activity;
    return item.careReason && item.state !== undefined ? { ...item, activity, ...careDisposition(item.careReason, item.careYear ?? Number(today.slice(0, 4)), today, activity, item.nextBooking) } : item;
  };
  const updated = sections.map(s => ({ ...s, items: s.items.map(apply) }));
  const allItems = updated.flatMap(s => s.items);
  const pendingCount = new Set(allItems.filter(i => i.state === "pending").map(i => i.customerId)).size;
  const handledCount = new Set([...allItems.filter(i => i.state === "handled"), ...history].map(i => i.customerId)).size;
  const visible = updated.filter(s => !selected || s.reason === selected);
  return <CareContext.Provider value={{ today, items: allItems, onSaved: (customerId, activity) => setSaved(previous => ({ ...previous, [`${customerId}:${activity.reason}`]: activity })) }}>
    <div className="flex flex-wrap items-center gap-2 border-b border-earth-200 pb-2" role="tablist" aria-label="關懷處理狀態">
      {([['pending', '待關懷', pendingCount], ['handled', '已處理／已安排', handledCount]] as const).map(([value, text, count]) => <button key={value} role="tab" aria-selected={tab === value} type="button" onClick={() => setTab(value)} className={`min-h-11 rounded-lg px-3 text-sm font-medium ${tab === value ? "bg-primary-100 text-primary-900" : "text-earth-600 hover:bg-earth-100"}`}>{text} <span className="ml-1 tabular-nums">{count}</span></button>)}
    </div>
    <div className="space-y-3">
      {visible.map(section => {
        const items = section.items.filter(item => item.state === (tab === "handled" ? "handled" : "pending"));
        if (tab === "handled" && items.length === 0) return null;
        return <CareSection key={section.title} {...section} items={items} totalCount={items.length}/>;
      })}
      {tab === "handled" && !visible.some(section => section.items.some(item => item.state === "handled")) && history.length === 0 && <p className="py-3 text-sm text-earth-500">目前沒有已處理或已安排的關懷。</p>}
      {tab === "handled" && history.length > 0 && <CareSection title="已解除提醒" description="保留之前的關懷紀錄。" emptyText="" items={history} totalCount={history.length}/>}
    </div>
  </CareContext.Provider>;
}
