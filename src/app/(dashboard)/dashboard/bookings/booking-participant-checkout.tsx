"use client";
import { useEffect, useRef, useState } from "react";
import { useRetainedState } from "@/components/operations/operation-scope";
import { completeBookingParticipantPlan, collectBookingParticipantTrial, resolveBookingParticipant } from "@/server/actions/booking-participants";
import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";
import { paymentMethodValues, type PaymentMethodValue } from "@/lib/payment-splits";
import { AssignPlanForm } from "../customers/[id]/assign-plan-form";

type Checkout = NonNullable<BookingDrawerPayload["participantCheckout"]>;
const methodLabels = { CASH: "現金", TRANSFER: "轉帳", LINE_PAY: "LINE Pay", CREDIT_CARD: "信用卡", OTHER: "其他" };
const statusLabels: Record<string, string> = { PENDING: "待收款", COMPLETED: "已完成", NO_SHOW: "未到", CANCELLED: "已取消" };
type Draft = { amount: string; method: PaymentMethodValue; note: string };
function validDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Draft;
  return typeof draft.amount === "string" && draft.amount.length < 20 && paymentMethodValues.includes(draft.method) && typeof draft.note === "string" && draft.note.length <= 500;
}

function ParticipantRow({ bookingId, slot, checkout, readOnly, blocked, onUpdated, onBusy, onProgress }: {
  bookingId: string; slot: Checkout["slots"][number]; checkout: Checkout; readOnly: boolean; blocked: boolean;
  onUpdated: () => void; onBusy: (busy: boolean) => void;
  onProgress: (position: number, revision: number, status: string, amount: number | null) => void;
}) {
  const [draft, setDraft] = useRetainedState<Draft>(`participant-collect:${bookingId}:${slot.position}`,
    { amount: String(checkout.settings.defaultPrice), method: "CASH", note: "" }, validDraft);
  const [expanded, setExpanded] = useState(false);
  const [selling, setSelling] = useState(false);
  const [usingPlan, setUsingPlan] = useState(false);
  const [walletId, setWalletId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<number | null>(null);
  const [usedOwnPlan, setUsedOwnPlan] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const busy = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const status = slot.status === "PENDING" ? resolved ?? slot.status : slot.status;
  const amount = slot.collectedAmount ?? receipt;
  const dirty = expanded && (draft.amount !== String(checkout.settings.defaultPrice) || draft.method !== "CASH" || !!draft.note);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function run(work: () => Promise<{ success: boolean; error?: string }>, next: string, collected: number | null = next === "COMPLETED" ? Number(draft.amount) : null) {
    if (busy.current || blocked || readOnly) return;
    busy.current = true; setSaving(true); setMessage(""); onBusy(true);
    try {
      const result = await work();
      if (!mounted.current) return;
      if (!result.success) { setMessage(result.error ?? "尚未完成，請重試"); return; }
      setResolved(next);
      if (next === "COMPLETED") { setReceipt(collected); setUsedOwnPlan(collected === null); }
      onProgress(slot.position, slot.revision, next, collected);
      setExpanded(false); setUsingPlan(false); onUpdated();
    } catch { if (mounted.current) setMessage("連線中斷，輸入已保留；請確認收款結果後重試。"); }
    finally { busy.current = false; onBusy(false); if (mounted.current) setSaving(false); }
  }
  return <div className="border-t border-earth-100 py-3 first:border-0">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 break-words text-base">
        <p className="font-semibold text-earth-900">{slot.name ?? `同行者 ${slot.position - 1}（待補資料）`}{slot.source === "WALK_IN" ? " · 臨時加入" : ""}</p>
        <p className="text-earth-600">{status === "PENDING" && !slot.customerId ? "待建檔" : status === "COMPLETED" && (slot.service === "PACKAGE_SESSION" || usedOwnPlan) ? "已扣 1 堂" : statusLabels[status] ?? status}{amount != null ? ` · 體驗費 NT$ ${amount.toLocaleString("zh-TW")}` : ""}</p>
      </div>
      {!readOnly && status === "PENDING" && <div className="flex flex-wrap gap-2">
        {checkout.canCollect && slot.customerId && <button type="button" disabled={blocked || saving} onClick={() => { setUsingPlan(false); setExpanded(!expanded); }}
          className="min-h-11 rounded-lg bg-primary-700 px-3 text-base text-white disabled:opacity-50">收體驗費</button>}
        {checkout.canResolve && slot.customerId && !!slot.wallets?.length && <button type="button" disabled={blocked || saving}
          onClick={() => { setExpanded(false); setUsingPlan(!usingPlan); setWalletId(previous => previous || slot.wallets![0].id); }}
          className="min-h-11 rounded-lg border border-primary-200 px-3 text-base text-primary-700 disabled:opacity-50">使用本人方案</button>}
        {checkout.canResolve && <button type="button" disabled={blocked || saving} onClick={() => {
          if (window.confirm(`將${slot.name ?? "這位同行者"}標記未到？不會收取體驗費。`)) void run(() => resolveBookingParticipant({ bookingId, position: slot.position, revision: slot.revision, status: "NO_SHOW" }), "NO_SHOW");
        }} className="min-h-11 rounded-lg border border-earth-300 px-3 text-base disabled:opacity-50">未到</button>}
        {checkout.canResolve && <button type="button" disabled={blocked || saving} onClick={() => {
          if (window.confirm(`取消${slot.name ?? "這位同行者"}的名額？其他人不受影響，不會收取體驗費。`)) void run(() => resolveBookingParticipant({ bookingId, position: slot.position, revision: slot.revision, status: "CANCELLED" }), "CANCELLED");
        }} className="min-h-11 rounded-lg px-3 text-base text-earth-600 disabled:opacity-50">取消名額</button>}
      </div>}
    </div>
    {!readOnly && checkout.canCollect && slot.customerId && expanded && status === "PENDING" && <form className="mt-3 space-y-2" onSubmit={event => {
      event.preventDefault();
      if (!draft.amount.trim() || !Number.isInteger(Number(draft.amount))) { setMessage("請輸入整數體驗費"); return; }
      void run(() => collectBookingParticipantTrial({ bookingId, position: slot.position, revision: slot.revision,
        amount: Number(draft.amount), paymentMethod: draft.method, note: draft.note }), "COMPLETED");
    }}>
      <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
        <label className="text-sm text-earth-700">體驗費<input aria-label={`${slot.name}體驗費`} inputMode="numeric" value={draft.amount}
          disabled={saving || !checkout.settings.allowEdit} onChange={event => setDraft({ ...draft, amount: event.target.value })}
          className="mt-1 min-h-11 w-full rounded-lg border border-earth-300 px-3 text-base" /></label>
        <label className="text-sm text-earth-700">付款方式<select value={draft.method} disabled={saving}
          onChange={event => setDraft({ ...draft, method: event.target.value as PaymentMethodValue })}
          className="mt-1 min-h-11 w-full rounded-lg border border-earth-300 px-3 text-base">
          {paymentMethodValues.map(method => <option key={method} value={method}>{methodLabels[method]}</option>)}
        </select></label>
      </div>
      <input aria-label="收款備註" placeholder="備註（例如由朋友代付）" maxLength={500} value={draft.note} disabled={saving}
        onChange={event => setDraft({ ...draft, note: event.target.value })} className="min-h-11 w-full rounded-lg border border-earth-300 px-3 text-base" />
      <button type="submit" disabled={saving || blocked} className="min-h-11 w-full rounded-lg bg-primary-700 px-3 text-base font-medium text-white disabled:opacity-50">{saving ? "收款中…" : "收款並完成體驗"}</button>
    </form>}
    {!readOnly && checkout.canResolve && usingPlan && status === "PENDING" && <form className="mt-3 flex flex-wrap gap-2" onSubmit={event => {
      event.preventDefault();
      void run(() => completeBookingParticipantPlan({ bookingId, position: slot.position, revision: slot.revision, walletId }), "COMPLETED", null);
    }}>
      <select aria-label={`${slot.name}本人方案`} value={walletId} disabled={saving || blocked}
        onChange={event => setWalletId(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-earth-300 px-3 text-base">
        {slot.wallets?.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name} · 可用 {wallet.available} 堂</option>)}
      </select>
      <button type="submit" disabled={saving || blocked || !walletId} className="min-h-11 rounded-lg bg-primary-700 px-3 text-base text-white disabled:opacity-50">{saving ? "處理中…" : "扣 1 堂並完成"}</button>
    </form>}
    {message && <p role="alert" className="mt-2 text-sm text-amber-800">{message}</p>}
    {!readOnly && checkout.canSell && status === "COMPLETED" && slot.customerId && checkout.plans.length > 0 && <div className="mt-2">
      <button type="button" disabled={blocked || saving} onClick={() => setSelling(!selling)} className="min-h-11 rounded-lg border border-primary-200 px-3 text-base text-primary-700">{selling ? "收合方案" : "購買本人方案"}</button>
      {selling && <div className="mt-2 rounded-lg border border-earth-200 p-3">
        <p className="mb-2 text-base font-semibold">方案開在 {slot.name} 名下</p>
        <AssignPlanForm customerId={slot.customerId} plans={checkout.plans} canDiscount={checkout.canDiscount} alwaysOpen
          onPendingChange={onBusy}
          onSuccess={() => { onBusy(false); setSelling(false); onUpdated(); }} />
      </div>}
    </div>}
  </div>;
}

export function BookingParticipantCheckout(props: { bookingId: string; checkout: Checkout; readOnly: boolean; blocked: boolean;
  onUpdated: () => void; onBusy: (busy: boolean) => void }) {
  const [progress, setProgress] = useState<Record<string, { status: string; amount: number | null }>>({});
  const keyFor = (position: number, revision: number) => `${props.bookingId}:${position}:${revision}`;
  const slots = props.checkout.slots.map(slot => {
    const result = progress[keyFor(slot.position, slot.revision)];
    return result ? { ...slot, status: result.status, collectedAmount: result.amount } : slot;
  });
  const completed = slots.filter(slot => slot.status === "COMPLETED").length;
  const noShow = slots.filter(slot => slot.status === "NO_SHOW").length;
  const cancelled = slots.filter(slot => slot.status === "CANCELLED").length;
  const collected = slots.reduce((total, slot) => total + (slot.collectedAmount ?? 0), 0);
  return <section className="border-b border-earth-100 p-4" aria-label="逐人體驗結帳">
    <h3 className="mb-2 text-base font-semibold text-earth-900">每位服務</h3>
    <p role="status" className="mb-2 break-words text-sm text-earth-600">完成 {completed}／{slots.length} · 已收 NT$ {collected.toLocaleString("zh-TW")}{noShow ? ` · 未到 ${noShow}` : ""}{cancelled ? ` · 已取消 ${cancelled}` : ""}</p>
    {props.checkout.slots.map(slot => <ParticipantRow key={`${props.bookingId}:${slot.position}`} {...props} slot={slot}
      onProgress={(position, revision, status, amount) => setProgress(previous => ({ ...previous, [keyFor(position, revision)]: { status, amount } }))} />)}
  </section>;
}
