"use client";
import { useEffect, useState, useTransition } from "react";
import { RightSheet } from "@/components/admin/right-sheet";
import { completeSpaBooking, getSpaCheckoutOptions } from "@/server/actions/spa-checkout";
import type { SpaScheduleBooking } from "@/server/queries/spa-schedule";
import type { SpaCreditOptions } from "@/server/spa-checkout-credit";

type Method = "CASH" | "CARD" | "STORED_VALUE" | "ENTITLEMENT";
export function SpaCheckoutPanel({ booking, customerName, onClose, onCompleted }: { booking: SpaScheduleBooking; customerName: string; onClose: () => void; onCompleted: () => void }) {
 const [method, setMethod] = useState<Method>("CASH");
 const [sourceId, setSourceId] = useState("");
 const [confirmed, setConfirmed] = useState(false);
 const [error, setError] = useState("");
 const [options, setOptions] = useState<SpaCreditOptions | null>(null);
 const [optionsError, setOptionsError] = useState("");
 const [revision, setRevision] = useState(0);
 const [pending, start] = useTransition();
 useEffect(() => {
  let active = true;
  getSpaCheckoutOptions(booking.id).then(r => {
   if (!active) return;
   if (r.success) { setOptions(r); setOptionsError(""); }
   else setOptionsError(r.error);
  }).catch(() => { if (active) setOptionsError("無法讀取方案與儲值，請重試。"); });
  return () => { active = false; };
 }, [booking.id, revision]);
 const credit = method === "STORED_VALUE" || method === "ENTITLEMENT";
 const effectiveSourceId = sourceId || (method === "STORED_VALUE" ? options?.wallets[0]?.id : options?.entitlements.length === 1 ? options.entitlements[0].id : "") || "";
 const wallet = options?.wallets.find(w => w.id === effectiveSourceId);
 const entitlement = options?.entitlements.find(e => e.id === effectiveSourceId);
 const valid = !credit || (method === "STORED_VALUE" ? Boolean(wallet && wallet.balance >= booking.totalPrice) : Boolean(entitlement));
 function choose(value: Method) {
  setMethod(value); setConfirmed(false); setError("");
  setSourceId(value === "STORED_VALUE" ? options?.wallets[0]?.id ?? "" : value === "ENTITLEMENT" && options?.entitlements.length === 1 ? options.entitlements[0].id : "");
 }
 return <RightSheet open onClose={() => { if (!pending) onClose(); }} width={520} labelledById="spa-checkout-title">
  <form className="space-y-5 p-5" onSubmit={e => {
   e.preventDefault(); if (!confirmed || !valid) return; setError("");
   start(async () => {
    try {
     const r = await completeSpaBooking({ bookingId: booking.id, expectedUpdatedAt: booking.updatedAt, expectedAmount: booking.totalPrice, paymentMethod: method, ...(credit ? { sourceId: effectiveSourceId } : {}) });
     if (!r.success) { setError(r.error); setConfirmed(false); setRevision(v=>v+1); return; }
     onCompleted();
    } catch { setError("連線失敗，請重試；同筆預約不會重複入帳。"); }
   });
  }}>
   <header className="flex justify-between"><h2 id="spa-checkout-title" className="text-xl font-bold">完成並結帳</h2><button type="button" disabled={pending} onClick={onClose}>關閉</button></header>
   <section className="rounded-xl bg-earth-50 p-4"><p className="font-semibold">{customerName}</p><p>{booking.serviceName}</p><p>{booking.startTime}–{booking.endTime}</p><p className="mt-3 text-2xl font-bold">服務金額 NT${booking.totalPrice.toLocaleString()}</p></section>
   <fieldset disabled={pending} className="space-y-3">
    <legend className="mb-2 font-semibold">付款方式</legend>
    <div className="grid grid-cols-2 gap-3">{([["CASH", "現金"], ["CARD", "刷卡"], ["ENTITLEMENT", "方案扣次"], ["STORED_VALUE", "儲值扣款"]] as const).map(([value, label]) => <label key={value} className={`rounded-lg border p-3 ${method === value ? "border-earth-700 bg-earth-50" : "border-earth-200"}`}><input type="radio" name="paymentMethod" checked={method === value} onChange={() => choose(value)} /> {label}</label>)}</div>
    {credit && !options && !optionsError && <p role="status">讀取顧客方案與餘額中…</p>}
    {credit && optionsError && <p role="alert">{optionsError} <button type="button" className="underline" onClick={() => setRevision(v => v + 1)}>重新讀取</button></p>}
    {method === "ENTITLEMENT" && options && <>
     {options.entitlements.length ? <label className="block">使用方案<select className="mt-2 w-full rounded-lg border p-3" value={effectiveSourceId} onChange={e => { setSourceId(e.target.value); setConfirmed(false); }}><option value="">請選擇方案</option>{options.entitlements.map(e => <option key={e.id} value={e.id}>{e.name} · 可用 {e.available} 次</option>)}</select></label> : <p>沒有適用本次全部服務且堂數足夠的有效方案，請選其他付款方式。</p>}
     {entitlement && <p className="rounded-lg bg-earth-50 p-3">本次扣 {entitlement.uses} 次，扣除後可用 {entitlement.available - entitlement.uses} 次。無須另收現金。</p>}
    </>}
    {method === "STORED_VALUE" && options && <p className="rounded-lg bg-earth-50 p-3">{wallet ? `儲值餘額 NT$${wallet.balance.toLocaleString()}，本次扣 NT$${booking.totalPrice.toLocaleString()}。${wallet.balance >= booking.totalPrice ? `扣除後 NT$${(wallet.balance - booking.totalPrice).toLocaleString()}。` : "餘額不足，請選其他付款方式。"}` : "此顧客沒有可用的儲值帳戶，請選其他付款方式。"}</p>}
    {!credit && <p className="text-sm text-earth-500">{method === "CARD" ? "請先於店內刷卡機完成收款，此處僅記錄收款結果。" : "請確認已收到現金。"}</p>}
    <label className="flex items-start gap-2"><input required type="checkbox" checked={confirmed} disabled={!valid} onChange={e => setConfirmed(e.target.checked)} />{credit ? "我已完成服務，並確認上述扣款／扣次" : "我已完成服務，並確認收到上述金額"}</label>
   </fieldset>
   {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
   <button disabled={pending || !confirmed || !valid} className="w-full rounded-lg bg-earth-800 p-3 font-semibold text-white disabled:opacity-50">{pending ? "處理中…" : credit ? "確認扣款／扣次並完成" : "確認收款並完成"}</button>
  </form>
 </RightSheet>;
}
