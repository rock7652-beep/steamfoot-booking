"use client";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalPanel } from "@/components/admin/modal-panel";
import { createCustomerFollowUpAction } from "@/server/actions/customer-follow-up";
import { CUSTOMER_FOLLOW_UP_RESULT_OPTIONS } from "@/lib/customer-follow-up";
import { CARE_REASON_LABELS } from "@/lib/customer-care-lifecycle";
import { addTaiwanDuration, formatTWTime, toLocalDateStr } from "@/lib/date-utils";
import type { CustomerFollowUpResult } from "@prisma/client";
import type { CareItem } from "./care-section";
import { useCareWorkspace } from "./care-workspace";
import { CareBookingButton } from "./care-booking-button";

const button = "inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium disabled:opacity-50";
export function CareRowActions({ item }: { item: CareItem }) {
  const router = useRouter();
  const context = useCareWorkspace();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<CustomerFollowUpResult>("CONTACTED");
  const [note, setNote] = useState("");
  const today = context?.today ?? toLocalDateStr();
  const initialNextDate = addTaiwanDuration(today, 7, "DAY");
  const [nextDate, setNextDate] = useState(initialNextDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lock = useRef(false);
  const birthday = item.careReason === "birthday";
  const related = context?.items.filter(row => row.customerId === item.customerId) ?? [item];
  function close() {
    if (pending || lock.current) return;
    if ((note || result !== "CONTACTED" || nextDate !== initialNextDate) && !window.confirm("尚有未儲存的關懷紀錄，要捨棄嗎？")) return;
    setOpen(false); setNote(""); setResult("CONTACTED"); setNextDate(initialNextDate); setError(null);
  }
  function save() {
    if (lock.current) return;
    lock.current = true; setError(null);
    start(async () => {
      try {
        const res = await createCustomerFollowUpAction({ customerId: item.customerId, result, note,
          careReason: item.careReason, careYear: item.careYear, nextFollowUpDate: birthday || !item.careReason ? null : nextDate });
        if (!res.success) { setError(res.error); return; }
        if (item.careReason) context?.onSaved(item.customerId, { id: res.data.followUpId, reason: item.careReason, year: birthday ? item.careYear ?? null : null,
          result, note: note || null, date: formatTWTime(new Date()), createdAt: new Date().toISOString(), by: "我", nextDate: birthday ? null : nextDate });
        setOpen(false); setNote(""); setResult("CONTACTED");
        router.refresh();
      } catch { setError("儲存失敗，請重試；輸入的內容已保留。"); }
      finally { lock.current = false; }
    });
  }
  return <>
    <div className="flex flex-wrap items-center justify-end gap-1">
      {!item.readOnly && item.canFollowUp !== false && <button type="button" onClick={() => setOpen(true)} className={`${button} bg-primary-600 text-white hover:bg-primary-700`}>{birthday ? "祝福紀錄" : "關懷"}</button>}
      {!item.readOnly && item.canBook !== false && <CareBookingButton item={item}/>}
      {(item.readOnly || (item.canFollowUp === false && item.canBook === false)) && <span className="text-sm text-earth-500">僅供查看</span>}
    </div>
    <ModalPanel open={open} onClose={close} labelledById={titleId} pending={pending} width={560}>
      <div className="space-y-4 p-5">
        <header className="flex items-center justify-between gap-3"><h2 id={titleId} className="font-semibold text-primary-900">{item.name} · {item.careReason ? CARE_REASON_LABELS[item.careReason] : "關懷紀錄"}</h2><button type="button" className={button} onClick={close} disabled={pending}>關閉</button></header>
        <div className="space-y-2 text-sm">{related.map(row => <div key={`${row.careReason}:${row.reason}`} className="rounded-lg bg-earth-50 px-3 py-2"><p className="font-medium">{row.reason}</p>{row.lastFollowUpText && !row.activity && <p className="mt-1 text-earth-600">{row.lastFollowUpText}</p>}{row.activity && <p className="mt-1 text-earth-600">{row.activity.date} · {row.activity.by} · {row.activity.note || "已記錄聯絡結果"}{row.activity.nextDate ? ` · ${row.activity.nextDate} 再追蹤` : ""}</p>}</div>)}{item.nextBooking && <p className="text-primary-800">下次預約：{item.nextBooking}</p>}</div>
        {item.script && <details className="rounded-lg border border-earth-200 px-3"><summary className="min-h-11 cursor-pointer py-3 text-sm">參考話術</summary><p className="whitespace-pre-wrap text-sm">{item.script}</p><button type="button" className={`${button} my-2 border border-earth-200`} onClick={async () => { try { await navigator.clipboard.writeText(item.script); setCopied(true); } catch { setError("無法複製，請手動選取話術。"); } }}>{copied ? "已複製" : "複製話術"}</button></details>}
        <label className="block text-sm">{birthday ? "祝福結果" : "聯絡結果"}<select className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-3" value={result} disabled={pending} onChange={e => setResult(e.target.value as CustomerFollowUpResult)}>{CUSTOMER_FOLLOW_UP_RESULT_OPTIONS.filter(o => !birthday || o.value !== "BOOKED").map(o => <option key={o.value} value={o.value}>{birthday && o.value === "CONTACTED" ? "已祝福" : o.label}</option>)}</select></label>
        {!birthday && item.careReason && <label className="block text-sm">下次追蹤日期<input type="date" required min={addTaiwanDuration(today, 1, "DAY")} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-3" value={nextDate} disabled={pending} onChange={e => setNextDate(e.target.value)}/></label>}
        <label className="block text-sm">備註<textarea className="mt-1 w-full rounded-lg border border-earth-200 p-3" rows={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} disabled={pending} placeholder="選填"/></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <footer className="flex justify-end gap-2"><button type="button" className={`${button} border border-earth-200`} disabled={pending} onClick={close}>取消</button><button type="button" className={`${button} bg-primary-600 text-white`} onClick={save} disabled={pending || (birthday && item.careYear !== Number(today.slice(0, 4)))}>{pending ? "儲存中…" : birthday && result === "CONTACTED" ? "記錄已祝福" : "儲存"}</button></footer>
      </div>
    </ModalPanel>
  </>;
}
