"use client";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { refundCoursePurchase } from "@/server/actions/course-refund";
import { editCoursePurchase, voidCoursePurchase } from "@/server/actions/course-purchase-correction";
import { confirmCoursePurchase } from "@/server/actions/course-portal";
import { COURSE_REFUND_METHOD_LABELS, courseRefundReference } from "@/lib/course-refund-display";
import { COURSE_PAYMENT_LABELS } from "@/lib/course-checkout";
export type CourseTransactionDetail = {
  paymentMethod?: string | null; transferLastFour?: string | null; listPrice?: number | null;
  note: string; revenueStaffId: string | null; voidReason: string | null;
  id: string; name: string; customerName: string; status: string; price: number;
  points: number; remaining: number | null; reserved: number; attended: number;
  usedQuota: number;
  unit: string; expiresAt: string | null; transferLastFive: string;
  refunds: { amount: number; reason: string; date: string; method: string }[];
};
export function CourseTransactionActions({ order, allocationSummary, canRefund, canConfirm, canEdit, canVoid, staffOptions }: {
  canEdit: boolean; canVoid: boolean; staffOptions: {id:string;name:string}[];
  order: CourseTransactionDetail; allocationSummary: string; canRefund: boolean; canConfirm: boolean;
}) {
  const title = useId(); const router = useRouter();
  const [open, setOpen] = useState(false); const [mode, setMode] = useState<"detail" | "refund" | "edit" | "void">("detail");
  const [note, setNote] = useState(order.note); const [staffId, setStaffId] = useState(order.revenueStaffId ?? "");
  const [reason, setReason] = useState(""); const [requestKey, setRequestKey] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"" | "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER">("");
  const [giftQuota, setGiftQuota] = useState("0");
  const [message, setMessage] = useState(""); const [pending, start] = useTransition();
  const unit = order.unit === "SESSION" ? "堂" : "點";
  const refunded = order.refunds.reduce((sum,r)=>sum+r.amount,0);
  const maximum = Math.max(0,order.price-refunded);
  const methods = COURSE_REFUND_METHOD_LABELS;
  const blocked = order.reserved > 0 ? "仍有預約占用，請先處理相關預約；這裡不會自動取消。"
    : order.remaining === null ? "尚未發卡，不能登錄方案退款。"
    : maximum <= 0 ? "此購買沒有尚可退款金額。" : null;
  const amountValid = amount.trim() !== "" && Number.isSafeInteger(Number(amount)) && Number(amount)>0 && Number(amount)<=maximum;
  const reference = giftQuota.trim() ? courseRefundReference(order.price,order.points,order.remaining??0,Number(giftQuota)) : null;
  function submit(action: "refund" | "confirm" | "edit" | "void") {
    if (pending) return;
    setMessage(""); start(async () => {
      try {
        const result = action === "refund" ? await refundCoursePurchase({ purchaseId: order.id, reason, requestKey, amount:Number(amount), method, expectedRemaining:order.remaining, expectedRefundedAmount:refunded })
          : action === "void" ? await voidCoursePurchase({ purchaseId: order.id, reason })
          : action === "edit" ? await editCoursePurchase({ purchaseId: order.id, reason, note, revenueStaffId: staffId || null })
          : await confirmCoursePurchase({ purchaseId: order.id });
        if (!result.success) { setMessage(result.error); return; }
        setMessage(action === "refund" ? "已登錄退款並停用卡片；本系統沒有執行轉帳或退刷。" : action === "void" ? "已作廢，保留原交易與沖銷紀錄。" : action === "edit" ? "已儲存交易更正。" : "已核帳並發卡。"); setMode("detail"); router.refresh();
      } catch { setMessage("送出失敗，已保留內容；請稍後重試。"); }
    });
  }
  const btn = "min-h-11 whitespace-nowrap rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
  return <>
    <button className={btn} aria-label={`查看 ${order.customerName} 的 ${order.name} 交易`} onClick={() => { setOpen(true); setMode("detail"); setMessage(""); setReason(""); setNote(order.note); setStaffId(order.revenueStaffId ?? ""); setRequestKey(crypto.randomUUID()); }}>{order.status === "PENDING" && canConfirm ? "查看／核帳" : "查看明細"}</button>
    {open && <RightSheet open onClose={() => { if (!pending) setOpen(false); }} labelledById={title}>
      <header className="flex items-center justify-between border-b p-4"><h2 id={title} className="font-semibold">交易詳情</h2><button disabled={pending} className={btn} onClick={() => setOpen(false)}>關閉</button></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <h3 className="font-semibold">{order.customerName}・{order.name}</h3>
        <dl className="grid grid-cols-2 gap-2 text-sm"><dt>{order.status === "PENDING" ? "待核帳金額" : "原實付金額"}</dt><dd>NT$ {order.price.toLocaleString()}</dd><dt>店家／開發人分配</dt><dd>{allocationSummary}</dd><dt>原購買額度</dt><dd>{order.points} {unit}</dd><dt>剩餘／占用</dt><dd>{order.remaining ?? "尚未發卡"} / {order.reserved} {unit}</dd><dt>到期日</dt><dd>{order.expiresAt ?? "核帳後起算"}</dd><dt>付款方式</dt><dd>{COURSE_PAYMENT_LABELS[order.paymentMethod??"BANK_TRANSFER"]??"其他"}</dd>{order.transferLastFour?<><dt>轉帳後四碼</dt><dd>{order.transferLastFour}</dd></>:order.transferLastFive?<><dt>匯款後五碼</dt><dd>{order.transferLastFive}</dd></>:null}</dl>
        {order.note && <p className="text-sm">交易備註：{order.note}</p>}
        {order.voidReason && <p className="text-sm">作廢原因：{order.voidReason}</p>}
        {order.refunds.map((refund, i) => <section className="rounded border border-earth-200 p-3 text-sm" key={i}><p>{refund.date} 登錄退款 NT$ {refund.amount.toLocaleString()} · {methods[refund.method]??"其他非現金"}</p><p>原因：{refund.reason}</p></section>)}
        {mode === "refund" && <><h3 className="font-semibold">登錄協商退款</h3>
          <p className="text-sm">已退款 NT$ {refunded.toLocaleString()} · 尚可退款 NT$ {maximum.toLocaleString()}</p>
          <p className="text-sm">已使用 {order.usedQuota} {unit} · 剩餘 {order.remaining??0} {unit} · 占用 {order.reserved} {unit}</p>
          <label className="block text-sm">實際退款金額（元，必填）<input type="number" inputMode="numeric" min="1" max={maximum} step="1" value={amount} onChange={e=>setAmount(e.target.value)} className="mt-1 min-h-11 w-full rounded border p-2"/></label>
          {amount.trim()&&!amountValid&&<p role="alert" className="text-sm text-red-700">請輸入大於零且不超過 NT$ {maximum.toLocaleString()} 的整數金額。</p>}
          <label className="block text-sm">退款方式（必選）<select value={method} onChange={e=>setMethod(e.target.value as typeof method)} className="mt-1 min-h-11 w-full rounded border p-2"><option value="">請選擇</option>{Object.entries(methods).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <details className="rounded border p-3 text-sm"><summary className="min-h-11 cursor-pointer py-2">協商參考金額（不限制協商結果）</summary><label>剩餘額度內的贈送部分（僅供試算，請核對紀錄）<input type="number" min="0" max={order.remaining??0} value={giftQuota} onChange={e=>setGiftQuota(e.target.value)} className="my-2 min-h-11 w-full rounded border p-2"/></label><p>贈送額度不折算現金。以原購買 {order.points} {unit} 為付費額度，參考：{reference===null?"請核對額度":`NT$ ${reference.toLocaleString("zh-TW",{maximumFractionDigits:2})}`}。此試算不會自動填入退款金額；若原購買額度含贈送，請依原紀錄另行核對。</p></details>
          <p className="rounded border border-gold-300 bg-gold-50 p-3 text-sm">確認後將登錄 NT$ {amountValid?Number(amount).toLocaleString():"—"}，收回全部剩餘 {order.remaining??0} {unit}並停用卡片，可用額度為 0。歷史購買、預約及出席保留；不延續剩餘上課權益。</p>
          <p className="text-sm">這是退款帳務登錄，本系統不會自動轉帳或退刷。現金方式會列入今日現金抽屜支出，需先開店。</p>
          {blocked&&<p role="alert" className="text-red-700">{blocked}</p>}
          <label className="block text-sm">退款原因（必填）<textarea className="mt-1 min-h-24 w-full rounded border p-2" value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></label></>}
        {mode === "edit" && <><h3 className="font-semibold">更正交易</h3><label className="block text-sm">交易備註<textarea className="mt-1 min-h-24 w-full rounded border p-2" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}/></label><label className="block text-sm">歸屬人員<select className="min-h-11 w-full rounded border p-2" value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">未指定</option>{staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></>}
        {mode === "void" && <><h3 className="font-semibold">作廢誤建交易</h3><p className="text-sm">僅用於誤建或重複紀錄；整卡必須未使用且沒有預約或額度異動。作廢會收回額度、沖銷原收款紀錄，保留歷史；若已實際退還顧客款項，請返回使用退款。</p></>}
        {(mode === "void" || mode === "edit") && <label className="block text-sm">{mode === "void" ? "作廢原因（必填）" : "更正原因（必填）"}<textarea className="mt-1 min-h-24 w-full rounded border p-2" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}/></label>}
        {message && <p role="status" className="text-sm text-primary-700">{message}</p>}
      </div>
      <footer className="flex flex-wrap gap-2 border-t bg-white p-4">
        {mode !== "detail" ? <><button disabled={pending} className={btn} onClick={() => setMode("detail")}>返回</button><button disabled={pending || (mode === "refund" && (!!blocked || !amountValid || !method)) || !reason.trim()} className={btn} onClick={() => submit(mode === "refund" ? "refund" : mode === "void" ? "void" : "edit")}>{pending ? "處理中…" : mode === "refund" ? "確認登錄退款並停用卡片" : mode === "void" ? "確認作廢誤建交易" : "儲存更正"}</button></> : <>
          {order.status === "PENDING" && canConfirm && <button className={btn} disabled={pending} onClick={() => submit("confirm")}>{pending ? "處理中…" : "確認核帳並發卡"}</button>}
          {["PENDING", "CONFIRMED"].includes(order.status) && canEdit && <button className={btn} onClick={() => { setMessage(""); setReason(""); setMode("edit"); }}>更正</button>}
          {["PENDING", "CONFIRMED"].includes(order.status) && canVoid && <button className={btn} onClick={() => { setMessage(""); setReason(""); setMode("void"); }}>作廢</button>}
          {["CONFIRMED","REFUNDED"].includes(order.status) && maximum>0 && canRefund && <button className={btn} onClick={() => { setMessage(""); setAmount(""); setMethod(""); setReason(""); setRequestKey(crypto.randomUUID()); setMode("refund"); }}>登錄退款</button>}
        </>}
      </footer>
    </RightSheet>}
  </>;
}
