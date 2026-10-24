"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { ModalPanel } from "@/components/admin/modal-panel";
import { RosterTable } from "@/components/admin/roster-primitives";
import { isMusicPreviewPage } from "@/lib/music-finance-sync";
import { musicCheckoutTransport } from "@/lib/music-checkout-transport";
import { recordMusicTuitionReceipt } from "@/server/actions/music-tuition";
import { toLocalDateStr, formatTWDateTime } from "@/lib/date-utils";
import { COURSE_PAYMENT_LABELS } from "@/lib/course-checkout";
import type { loadCourseCustomerPurchases } from "@/server/actions/course-customer-history";

type Result = Awaited<ReturnType<typeof loadCourseCustomerPurchases>>;
export type TuitionOrder = Extract<Result, { success: true }>["data"][number];

export function MusicTuitionDetails({ order, onUpdated, receiptPeriod, detailsButton=false, closeLabel="關閉" }: { order: TuitionOrder; onUpdated: () => void; receiptPeriod?: number; detailsButton?: boolean; closeLabel?: string }) {
  const router = useRouter();
  const titleId = useId();
  const submitting = useRef(false);
  const [mode, setMode] = useState<"details" | "receipt" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const tuition = order.tuition;
  if (!tuition) return null;
  const outstanding = order.status === "CONFIRMED" ? Math.max(0, tuition.due - order.price) : 0;
  const selectedPeriod = receiptPeriod ? tuition.periods.find(p => p.period === receiptPeriod) : undefined;
  const periodBalance = receiptPeriod ? selectedPeriod?.outstanding ?? 0 : outstanding;
  const receiptLimit = Math.min(outstanding, periodBalance);
  const firstUnpaid = tuition.periods.find(p => p.outstanding > 0)?.period;
  const field = "min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-base";
  const button = "min-h-11 rounded-lg border border-earth-200 px-3 text-sm disabled:opacity-50";
  const close = () => { if (submitting.current) return; setMode(null); };
  const open = (next: "details" | "receipt") => { setError(""); setMethod(""); setMode(next); };
  return <>
    {receiptPeriod ? tuition.canReceive && receiptLimit > 0 && firstUnpaid === receiptPeriod && <button type="button" className={button} onClick={() => open("receipt")}>補登收款</button> : detailsButton ? <button type="button" className="min-h-11 w-full text-left text-sm" onClick={()=>open("details")}>交易明細</button> : <ExclusiveMenu label={`${order.name} 收款操作`} triggerText="⋯">
      <button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={() => open("details")}>查看明細</button>
      {tuition.canReceive && outstanding > 0 && <button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={() => open("receipt")}>補登收款</button>}
    </ExclusiveMenu>}
    <ModalPanel open={mode !== null} onClose={close} labelledById={titleId} pending={busy} width={mode === "receipt" ? 520 : 880}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
        <h3 id={titleId} className="min-w-0 break-words font-semibold">{mode === "receipt" ? (receiptPeriod ? `補登第 ${receiptPeriod} 期收款` : "補登收款") : "學費明細"} · {order.name}</h3>
        <button type="button" className={`${button} shrink-0`} disabled={busy} onClick={close}>{closeLabel}</button>
      </header>
      <div className="@container/tuition min-h-0 min-w-0 overflow-y-auto p-3 text-sm">
        {mode === "receipt" ? <form className="space-y-3" onSubmit={async event => {
          event.preventDefault();
          if (submitting.current) return;
          const data = new FormData(event.currentTarget);
          submitting.current = true; setBusy(true); setError("");
          try {
            const result = await musicCheckoutTransport("receipt", {
              purchaseId: order.id, amount: Number(data.get("amount")), paymentDate: String(data.get("date")),
              method: String(data.get("method")), lastFour: String(data.get("lastFour") ?? ""), requestKey, expectedReceived: order.price,
            }, recordMusicTuitionReceipt);
            if (!result.success) { setError(result.error ?? "收款未完成"); return; }
            setRequestKey(crypto.randomUUID()); setMode(null);
            onUpdated();
            if (!isMusicPreviewPage()) router.refresh();
          } catch { setError("尚未確認收款結果，可用相同資料重試。"); }
          finally { submitting.current = false; setBusy(false); }
        }}>
          <section aria-label={selectedPeriod ? "本期收款摘要" : "整筆購課收款摘要"} className="space-y-2 rounded-lg bg-earth-50 px-3 py-2">
            <dl className="grid grid-cols-1 gap-2 @min-[22rem]/tuition:grid-cols-3">
              <div><dt className="text-earth-600">{selectedPeriod ? "本期應收" : "整筆應收"}</dt><dd>NT$ {(selectedPeriod?.due ?? tuition.due).toLocaleString()}</dd></div>
              <div><dt className="text-earth-600">{selectedPeriod ? "本期已收" : "整筆已收"}</dt><dd>NT$ {(selectedPeriod?.received ?? order.price).toLocaleString()}</dd></div>
              <div><dt className="text-earth-600">{selectedPeriod ? "本期未收" : "整筆未收"}</dt><dd className="font-semibold">NT$ {(selectedPeriod?.outstanding ?? outstanding).toLocaleString()}</dd></div>
            </dl>
            {selectedPeriod && <p className="border-t border-earth-200 pt-2 text-earth-600">整筆購課：應收 NT$ {tuition.due.toLocaleString()} · 已收 NT$ {order.price.toLocaleString()} · 未收 NT$ {outstanding.toLocaleString()}</p>}
          </section>
          <fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-2 @min-[22rem]/tuition:grid-cols-2">
            <label className="space-y-1">本次實收<input className={field} name="amount" type="number" min="1" max={receiptLimit} step="1" required defaultValue={receiptLimit} /></label>
            <label className="space-y-1">付款日期<input className={field} name="date" type="date" max={toLocalDateStr()} required defaultValue={toLocalDateStr()} /></label>
            <label className="space-y-1">付款方式<select className={field} name="method" required value={method} onChange={event => setMethod(event.target.value)}><option value="">請選擇</option>{["CASH", "BANK_TRANSFER", "CARD", "OTHER"].map(value => <option key={value} value={value}>{COURSE_PAYMENT_LABELS[value]}</option>)}</select></label>
            {method === "BANK_TRANSFER" && <label className="space-y-1">轉帳後四碼<input className={field} name="lastFour" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required /></label>}
          </fieldset>
          {error && <p role="alert" className="text-red-700">{error}</p>}
          <div className="flex items-center justify-between gap-3 border-t pt-3"><span className="text-earth-500">{receiptPeriod ? "依期別順序抵付，填寫實際收款日" : "登錄已收到的款項"}</span><button className="min-h-11 rounded-lg bg-primary-700 px-4 text-white disabled:opacity-50" disabled={busy}>{busy ? "儲存中…" : "儲存收款"}</button></div>
        </form> : <div className="grid min-w-0 grid-cols-1 gap-3 @min-[44rem]/tuition:grid-cols-2">
          <p className="col-span-full">期限：{tuition.expiry} · {tuition.discountTeacherFee ? "折後學費拆帳" : "原學費拆帳"}</p>
          <section className="min-w-0 [&_table]:min-w-[22rem]"><RosterTable label="各期學費" columns={["期別", "堂數", "應收", "已收", "欠款"]}>
            {tuition.periods.map(period => <tr key={period.period}><td>{period.period}</td><td>{period.lessons}</td><td className="text-right tabular-nums">{period.due.toLocaleString()}</td><td className="text-right tabular-nums">{period.received.toLocaleString()}</td><td className="text-right tabular-nums">{order.status === "CONFIRMED" ? period.outstanding.toLocaleString() : "—"}</td></tr>)}
          </RosterTable>
          </section><section className="min-w-0 space-y-2 [&_table]:min-w-[22rem]"><h4 className="font-semibold">付款紀錄</h4>
          <RosterTable label="付款明細" columns={["付款日期", "實收", "方式", "後四碼"]}>
            {tuition.receipts.map(receipt => <tr key={receipt.id}><td>{toLocalDateStr(new Date(receipt.paidAt))}</td><td className="text-right tabular-nums">{receipt.amount.toLocaleString()}</td><td>{COURSE_PAYMENT_LABELS[receipt.method]}</td><td>{receipt.lastFour ?? "—"}</td></tr>)}
          </RosterTable>
          {!tuition.receipts.length && <p className="text-earth-500">尚無付款紀錄</p>}
          </section>
          {tuition.canReadBookings && <details className="col-span-full"><summary className="min-h-11 cursor-pointer py-3 text-primary-700">查看出勤紀錄（{tuition.lessons.length}）</summary><RosterTable label="學費對應出勤" columns={["上課時間", "老師", "狀態"]}>{tuition.lessons.map(lesson => <tr key={lesson.id}><td>{formatTWDateTime(new Date(lesson.date))}</td><td>{lesson.teacher}</td><td>{lesson.status}</td></tr>)}</RosterTable></details>}
          {order.refunds.map(refund => <p className="col-span-full" key={refund.id}>退款 {refund.amount.toLocaleString()} · {refund.reason}</p>)}
          {order.note && <p className="col-span-full break-words">備註：{order.note}</p>}
          {order.voidReason && <p className="col-span-full break-words">作廢原因：{order.voidReason}</p>}
        </div>}
      </div>
    </ModalPanel>
  </>;
}
