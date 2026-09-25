"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSteamfootRent } from "@/server/actions/steamfoot-rent";
import { nextRentStart, type RentTerm } from "@/lib/steamfoot-rent";
export function RentForm({ staffId, latest, defaultAmount, currentMonth }: {
  staffId: string; latest?: RentTerm; defaultAmount: number; currentMonth: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(true);
  const field = "mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3";
  return <form className="space-y-3" onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    start(async () => {
      try {
        const result = await saveSteamfootRent({ staffId, enabled,
          startMonth: String(form.get("startMonth")), cycleMonths: Number(form.get("cycleMonths") ?? 1),
          monthlyAmount: Number(form.get("monthlyAmount") ?? 0), expectedTermId: latest?.id ?? null });
        if (!result.success) { setMessage(result.error ?? "儲存失敗"); return; }
        setMessage("已儲存，月結會依租期顯示。"); router.refresh();
      } catch { setMessage("儲存失敗，請重試。"); }
    });
  }}>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>收取空間租金</label>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="text-sm">{latest ? "新約定起始月" : "租期起始月"}<input required name="startMonth" type="month" min={latest ? nextRentStart(latest, currentMonth) : "2000-01"} max="2099-12" defaultValue={nextRentStart(latest, currentMonth)} className={field}/></label>
      {enabled && <><label className="text-sm">每期月數<select name="cycleMonths" defaultValue={latest?.cycleMonths ?? 1} className={field}>{[1,3,6,12].map(n => <option key={n} value={n}>{n} 個月</option>)}</select></label>
      <label className="text-sm">每月租金（元）<input required name="monthlyAmount" type="number" min="1" max="10000000" step="1" defaultValue={latest?.monthlyAmount || defaultAmount || ""} className={field}/></label></>}
    </div>
    <p className="text-xs text-earth-500">按此週期延續；變更從下一個完整租期生效。</p>
    {message && <p role="status" className="text-sm">{message}</p>}
    <button disabled={pending} className="min-h-11 rounded-lg bg-primary-600 px-4 text-sm text-white disabled:opacity-50">{pending ? "儲存中…" : "儲存租金約定"}</button>
  </form>;
}
