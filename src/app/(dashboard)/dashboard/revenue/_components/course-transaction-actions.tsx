"use client";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { refundCoursePurchase } from "@/server/actions/course-refund";
import { confirmCoursePurchase } from "@/server/actions/course-portal";
export type CourseTransactionDetail = {
  id: string; name: string; customerName: string; status: string; price: number;
  points: number; remaining: number | null; reserved: number; attended: number;
  unit: string; expiresAt: string | null; transferLastFive: string;
  refunds: { amount: number; reason: string; date: string }[];
};
export function CourseTransactionActions({ order, canRefund, canConfirm }: {
  order: CourseTransactionDetail; canRefund: boolean; canConfirm: boolean;
}) {
  const title = useId(); const router = useRouter();
  const [open, setOpen] = useState(false); const [mode, setMode] = useState<"detail" | "refund">("detail");
  const [reason, setReason] = useState(""); const [requestKey, setRequestKey] = useState("");
  const [message, setMessage] = useState(""); const [pending, start] = useTransition();
  const unit = order.unit === "SESSION" ? "堂" : "點";
  const blocked = order.reserved > 0 ? "仍有未完成預約，請先取消預約後再退款。"
    : order.attended > 0 || order.remaining !== order.points ? "此方案已有使用或調整；部分使用退款算法待確認。"
    : order.price <= 0 ? "此方案沒有實付金額可退。" : null;
  function submit(refund: boolean) {
    if (pending) return;
    setMessage(""); start(async () => {
      try {
        const result = refund ? await refundCoursePurchase({ purchaseId: order.id, reason, requestKey }) : await confirmCoursePurchase({ purchaseId: order.id });
        if (!result.success) { setMessage(result.error); return; }
        setMessage(refund ? "已記錄退款，方案額度已收回。" : "已核帳並發卡。"); setMode("detail"); router.refresh();
      } catch { setMessage("送出失敗，已保留內容；請稍後重試。"); }
    });
  }
  const btn = "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
  return <>
    <button className={btn} aria-label={`查看 ${order.customerName} 的 ${order.name} 交易`} onClick={() => { setOpen(true); setMode("detail"); setMessage(""); setRequestKey(crypto.randomUUID()); }}>⋯</button>
    {open && <RightSheet open onClose={() => { if (!pending) setOpen(false); }} labelledById={title}>
      <header className="flex items-center justify-between border-b p-4"><h2 id={title} className="font-semibold">交易詳情</h2><button disabled={pending} className={btn} onClick={() => setOpen(false)}>關閉</button></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <h3 className="font-semibold">{order.customerName}・{order.name}</h3>
        <dl className="grid grid-cols-2 gap-2 text-sm"><dt>原實付金額</dt><dd>NT$ {order.price.toLocaleString()}</dd><dt>原購買額度</dt><dd>{order.points} {unit}</dd><dt>剩餘／占用</dt><dd>{order.remaining ?? "尚未發卡"} / {order.reserved} {unit}</dd><dt>到期日</dt><dd>{order.expiresAt ?? "核帳後起算"}</dd><dt>匯款後五碼</dt><dd>{order.transferLastFive}</dd></dl>
        {order.refunds.map((refund, i) => <section className="rounded border border-earth-200 p-3 text-sm" key={i}><p>{refund.date} 退款 NT$ {refund.amount.toLocaleString()}</p><p>原因：{refund.reason}</p></section>)}
        {mode === "refund" && <><h3 className="font-semibold">全額退款（未使用方案）</h3><p className="text-sm">預計退款 NT$ {order.price.toLocaleString()}，收回 {order.remaining} {unit}；保留購買、預約及異動紀錄。</p><p className="text-sm">這項操作記錄已辦理的退款，並不會自動向銀行轉帳。</p>{blocked && <p role="alert" className="text-red-700">{blocked}</p>}<label className="block text-sm">退款原因（必填）<textarea className="mt-1 min-h-24 w-full rounded border p-2" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} /></label></>}
        {message && <p role="status" className="text-sm text-primary-700">{message}</p>}
      </div>
      <footer className="flex flex-wrap gap-2 border-t bg-white p-4">
        {mode === "refund" ? <><button disabled={pending} className={btn} onClick={() => setMode("detail")}>返回</button><button disabled={pending || !!blocked || !reason.trim()} className={btn} onClick={() => submit(true)}>{pending ? "處理中…" : "確認已退款並收回額度"}</button></> : <>
          {order.status === "PENDING" && canConfirm && <button className={btn} disabled={pending} onClick={() => submit(false)}>{pending ? "處理中…" : "確認核帳並發卡"}</button>}
          {order.status === "CONFIRMED" && canRefund && <button className={btn} onClick={() => setMode("refund")}>退款</button>}
        </>}
      </footer>
    </RightSheet>}
  </>;
}
