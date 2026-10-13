"use client";
import { useEffect, useRef, useState } from "react";
import { useRetainedState } from "@/components/operations/operation-scope";
import { changeBookingParticipantService, completeBookingParticipantPlan, collectBookingParticipantTrial, resolveBookingParticipant, removeBookingParticipant, restoreBookingParticipant } from "@/server/actions/booking-participants";
import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";
import { paymentMethodValues, type PaymentMethodValue } from "@/lib/payment-splits";
import { BookingPersonDetails } from "./booking-person-details";
import { BookingCompanionEditor, CompanionSlot } from "./booking-companion-editor";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { AssignPlanForm } from "../customers/[id]/assign-plan-form";

type Checkout = NonNullable<BookingDrawerPayload["participantCheckout"]>;
const methodLabels = { CASH: "現金", TRANSFER: "轉帳", LINE_PAY: "LINE Pay", CREDIT_CARD: "信用卡", OTHER: "其他" };
const statusLabels: Record<string, string> = { PENDING: "待到店", COMPLETED: "已完成", NO_SHOW: "未到", CANCELLED: "已取消" };
type Draft = { amount: string; method: PaymentMethodValue; note: string };
function validDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Draft;
  return typeof draft.amount === "string" && draft.amount.length < 20 && paymentMethodValues.includes(draft.method) && typeof draft.note === "string" && draft.note.length <= 500;
}

function ParticipantRow({ bookingId, slot, checkout, readOnly, blocked, onUpdated, onBusy, onProgress, companions, canEditNote, onPersonNoteSaved, primaryCustomer, onOpenCustomer, displayPosition }: {
  onOpenCustomer?: (customerId: string) => void;
  primaryCustomer?: BookingDrawerPayload["booking"]["customer"];
  companions?: BookingDrawerPayload["companions"]; canEditNote?: boolean; onPersonNoteSaved?: (customerId: string, value: string | null) => void;
  bookingId: string; slot: Checkout["slots"][number]; checkout: Checkout; readOnly: boolean; blocked: boolean;
  onUpdated: () => void; onBusy: (busy: boolean) => void; displayPosition: number;
  onProgress: (position: number, revision: number, status: string, amount: number | null) => void;
}) {
  const [draft, setDraft] = useRetainedState<Draft>(`participant-collect:${bookingId}:${slot.position}`,
    { amount: String(checkout.settings.defaultPrice), method: "CASH", note: "" }, validDraft);
  const [expanded, setExpanded] = useState(false);
  const [selling, setSelling] = useState(false);
  const [walletCount, setWalletCount] = useState<number | null>(null);
  const [usingPlan, setUsingPlan] = useState(false);
  const [walletId, setWalletId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<number | null>(null);
  const [usedOwnPlan, setUsedOwnPlan] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ walletId: string; name: string } | null | undefined>(undefined);
  const busy = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setResolved(null); setReceipt(null); setUsedOwnPlan(false); setSelection(undefined); setMessage(""); }, [slot.revision]);
  const status = slot.status === "PENDING" ? resolved ?? slot.status : slot.status;
  const amount = slot.collectedAmount ?? receipt;
  const isPlan = selection !== undefined ? selection !== null : slot.service === "PACKAGE_SESSION";
  const selectedWalletId = selection !== undefined ? selection?.walletId : slot.selectedWalletId;
  const selectedPlanName = selection !== undefined ? selection?.name : slot.selectedPlanName;
  const canRemove = !readOnly && checkout.canResolve && slot.position > 1 && ["PENDING", "CANCELLED"].includes(status) && amount == null;
  const canSell = !readOnly && checkout.canSell && ["PENDING", "COMPLETED"].includes(status) && !!slot.customerId && checkout.plans.length > 0;
  const sellButton = canSell ? <button type="button" disabled={blocked || saving} onClick={() => { setExpanded(false); setUsingPlan(false); setSelling(!selling); }} className="min-h-11 rounded-lg border border-primary-200 px-3 text-base text-primary-700 disabled:opacity-50">{selling ? "收合方案" : "新增方案"}</button> : null;
  const dirty = expanded && (draft.amount !== String(checkout.settings.defaultPrice) || draft.method !== "CASH" || !!draft.note);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function run(work: () => Promise<{ success: boolean; error?: string }>, next: string, collected: number | null = next === "COMPLETED" ? Number(draft.amount) : null, onSuccess?: () => void) {
    if (busy.current || blocked || readOnly) return;
    busy.current = true; setSaving(true); setMessage(""); onBusy(true);
    try {
      const result = await work();
      if (!mounted.current) return;
      if (!result.success) { setMessage(result.error ?? "尚未完成，請重試"); return; }
      onSuccess?.();
      setResolved(next);
      if (next === "COMPLETED") { setReceipt(collected); setUsedOwnPlan(collected === null); }
      onProgress(slot.position, slot.revision, next, collected);
      setExpanded(false); setUsingPlan(false); onUpdated();
    } catch { if (mounted.current) setMessage("連線中斷，輸入已保留；請確認目前狀態後重試。"); }
    finally { busy.current = false; onBusy(false); if (mounted.current) setSaving(false); }
  }
  return <div aria-label={slot.name ?? `同行者 ${displayPosition - 1}`} className="@container border-t border-earth-100 py-2 first:border-0">
    <div className="grid min-w-0 grid-cols-1 items-start gap-2 @min-[620px]:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 break-words text-base">
        <p className="font-semibold text-earth-900">{slot.name ?? `同行者 ${displayPosition - 1}`}{slot.source === "WALK_IN" ? " · 臨時加入" : ""}</p>
        <p className="text-earth-600">{slot.position === 1 ? "預約人 · " : ""}{statusLabels[status] ?? status}{!slot.customerId ? " · 未建檔" : ""}</p>
        <p className="mt-1 break-words text-earth-900">本次：{isPlan || usedOwnPlan ? selectedPlanName ?? "方案" : "體驗"}
          {isPlan && (selection || slot.selectedOwnerId) && <span className="text-earth-600"> · {selection || slot.selectedOwnerId === slot.customerId ? "本人方案" : `使用${slot.selectedOwnerName ?? "其他顧客"}的共卡`}</span>}
          <span className="text-earth-600"> · {isPlan || usedOwnPlan ? status === "COMPLETED" ? "已扣 1 堂" : status === "PENDING" ? "尚未扣堂" : "未扣堂" : amount != null && !slot.receiptCorrected ? `已收體驗費 NT$ ${amount.toLocaleString("zh-TW")}` : slot.receiptCorrected ? "收款已撤銷／退回" : "未收款"}{amount != null && !slot.receiptCorrected && !isPlan && !usedOwnPlan && (slot.collectedMethod || receipt != null) ? `・${methodLabels[(slot.collectedMethod ?? draft.method) as PaymentMethodValue] ?? slot.collectedMethod}` : ""}</span>
        </p>
      </div>
      {!readOnly && status === "PENDING" && <div className="flex flex-wrap items-start gap-2">
        {checkout.canCollect && !isPlan && amount == null && (slot.customerId || checkout.canCollectUnregistered) && <button type="button" disabled={blocked || saving} onClick={() => { setUsingPlan(false); setSelling(false); setExpanded(!expanded); }}
          className="min-h-11 rounded-lg bg-primary-700 px-3 text-base text-white disabled:opacity-50">收款並完成 ${checkout.settings.defaultPrice.toLocaleString("zh-TW")}</button>}
        {checkout.canResolve && (amount == null || slot.receiptCorrected) && slot.customerId && !!slot.wallets?.length && <button type="button" disabled={blocked || saving}
          onClick={() => { setExpanded(false); setSelling(false); setWalletId(slot.wallets?.length === 1 ? slot.wallets[0].id : ""); setUsingPlan(!usingPlan); }}
          className="min-h-11 rounded-lg border border-primary-200 px-3 text-base text-primary-700 disabled:opacity-50">{isPlan ? "更換方案" : "改用方案"}</button>}
        {walletCount === 0 && sellButton}
        {(checkout.canResolve || (canSell && walletCount !== 0)) && <ExclusiveMenu label={`${slot.name ?? `同行者 ${displayPosition - 1}`}更多操作`} triggerText="⋯"><div className="flex flex-col gap-1">
        {walletCount !== 0 && sellButton}
        {checkout.canResolve && <><button type="button" disabled={blocked || saving} onClick={() => {
          if (window.confirm(`將${slot.name ?? "這位同行者"}標記未到？不會收取體驗費。`)) void run(() => resolveBookingParticipant({ bookingId, position: slot.position, revision: slot.revision, status: "NO_SHOW" }), "NO_SHOW");
        }} className="min-h-11 rounded-lg border border-earth-300 px-3 text-base disabled:opacity-50">未到</button>
        <button type="button" disabled={blocked || saving} onClick={() => {
          if (window.confirm(`取消${slot.name ?? "這位同行者"}的名額？其他人不受影響，不會收取體驗費。`)) void run(() => resolveBookingParticipant({ bookingId, position: slot.position, revision: slot.revision, status: "CANCELLED" }), "CANCELLED");
        }} className="min-h-11 rounded-lg border-t border-earth-200 px-3 text-base text-red-700 disabled:opacity-50">取消名額</button>
        {canRemove && <button type="button" disabled={blocked || saving} onClick={() => {
          if (window.confirm("刪除這位同行者？刪除後會從預約名單移除，人數減少 1；不保留取消紀錄。"))
            void run(() => removeBookingParticipant({ bookingId, position: slot.position, revision: slot.revision }), "REMOVED", null);
        }} aria-label="刪除同行者" title="刪除同行者" className="min-h-11 rounded-lg border-t border-red-100 px-3 text-base text-red-700 disabled:opacity-50">× 刪除同行者</button>}</>}</div></ExclusiveMenu>}
        {checkout.canResolve && isPlan && selectedWalletId && <button type="button" disabled={blocked || saving}
          onClick={() => void run(() => completeBookingParticipantPlan({ bookingId, position: slot.position, revision: slot.revision, walletId: selectedWalletId }), "COMPLETED", null)}
          className="min-h-11 rounded-lg bg-primary-700 px-3 text-base text-white disabled:opacity-50">完成並扣 1 堂</button>}
        {checkout.canResolve && !isPlan && amount != null && !slot.receiptCorrected && <button type="button" disabled={blocked || saving}
          onClick={() => void run(() => changeBookingParticipantService({ bookingId, position: slot.position, revision: slot.revision, operation: "completePaid" }), "COMPLETED", amount)}
          className="min-h-11 rounded-lg bg-primary-700 px-3 text-base text-white disabled:opacity-50">完成服務</button>}
      </div>}
      {!readOnly && checkout.canResolve && status === "CANCELLED" && <ExclusiveMenu label={`${slot.name ?? `同行者 ${displayPosition - 1}`}更多操作`} triggerText="⋯"><div className="flex flex-col gap-1">
        <button type="button" disabled={blocked || saving} onClick={() => {
          if (window.confirm(`恢復${slot.name ?? "這位同行者"}的名額？狀態會改回待到店；若要換人，請新增一位同行者。`))
            void run(() => restoreBookingParticipant({ bookingId, position: slot.position, revision: slot.revision }), "PENDING", null);
        }} className="min-h-11 rounded-lg border border-primary-200 px-3 text-base text-primary-700 disabled:opacity-50">恢復名額</button>
        {canRemove && <button type="button" disabled={blocked || saving} onClick={() => {
          if (window.confirm("刪除這位同行者？刪除後會從預約名單移除，人數減少 1；不保留取消紀錄。"))
            void run(() => removeBookingParticipant({ bookingId, position: slot.position, revision: slot.revision }), "REMOVED", null);
        }} aria-label="刪除同行者" title="刪除同行者" className="min-h-11 rounded-lg border-t border-red-100 px-3 text-base text-red-700 disabled:opacity-50">× 刪除同行者</button>}
      </div></ExclusiveMenu>}
      {!readOnly && checkout.canResolve && status === "COMPLETED" && <button type="button" disabled={blocked || saving}
        onClick={() => { if (window.confirm(isPlan ? "撤回這位顧客的完成服務？退回 1 堂並保留預約。" : "撤回這位顧客的完成服務？原收款保留，不會退款。"))
          void run(() => changeBookingParticipantService({ bookingId, position: slot.position, revision: slot.revision, operation: "revert" }), "PENDING", amount); }}
        className="min-h-11 rounded-lg border border-earth-300 px-3 text-base disabled:opacity-50">撤回完成</button>}
    </div>
    {status === "COMPLETED" && canSell && <ExclusiveMenu label={`${slot.name ?? "同行者"}更多操作`} triggerText="⋯">{sellButton}</ExclusiveMenu>}
    {slot.customerId && <div hidden={usingPlan}><BookingPersonDetails onOpenDetails={onOpenCustomer ? () => { if (saving || blocked || (dirty && !window.confirm("尚有未儲存的收款內容，確定查看顧客資料？"))) return; onOpenCustomer(slot.customerId!); } : undefined} key={slot.customerId} customerId={slot.customerId} revision={slot.revision} name={slot.name ?? "顧客"} initial={primaryCustomer?.id === slot.customerId ? primaryCustomer : undefined} canEditNote={!readOnly && !blocked && !!canEditNote} onWalletCount={setWalletCount} onNoteSaved={value => onPersonNoteSaved?.(slot.customerId!, value)} /></div>}
    {status === "PENDING" && !slot.customerId && companions && <CompanionSlot embedded displayPosition={displayPosition} bookingId={bookingId} slot={slot} canEdit={!readOnly && companions.canEdit} canCreate={companions.canCreate} blocked={blocked || saving} onBusy={onBusy} onUpdated={onUpdated} />}
    {!readOnly && checkout.canCollect && (slot.customerId || checkout.canCollectUnregistered) && expanded && status === "PENDING" && <form className="mt-3 space-y-2" onSubmit={event => {
      event.preventDefault();
      if (!draft.amount.trim() || !Number.isInteger(Number(draft.amount))) { setMessage("請輸入整數體驗費"); return; }
      void run(() => collectBookingParticipantTrial({ bookingId, position: slot.position, revision: slot.revision,
        amount: Number(draft.amount), paymentMethod: draft.method, note: draft.note }), "COMPLETED");
    }}>
      <div className="grid max-w-lg grid-cols-1 gap-2 @min-[320px]:grid-cols-2">
        <label className="text-sm text-earth-700">體驗費<input aria-label={`${slot.name ?? `同行者 ${displayPosition - 1}`}體驗費`} inputMode="numeric" value={draft.amount}
          disabled={saving || !checkout.settings.allowEdit} onChange={event => setDraft({ ...draft, amount: event.target.value })}
          className="mt-1 min-h-11 w-full rounded-lg border border-earth-300 px-3 text-base" /></label>
        <label className="text-sm text-earth-700">付款方式<select value={draft.method} disabled={saving}
          onChange={event => setDraft({ ...draft, method: event.target.value as PaymentMethodValue })}
          className="mt-1 min-h-11 w-full rounded-lg border border-earth-300 px-3 text-base">
          {paymentMethodValues.map(method => <option key={method} value={method}>{methodLabels[method]}</option>)}
        </select></label>
      </div>
      <div className="grid grid-cols-1 items-start gap-2 @min-[540px]:grid-cols-[minmax(0,1fr)_auto]">
      <input aria-label="收款備註" placeholder="備註（選填）" maxLength={500} value={draft.note} disabled={saving}
        onChange={event => setDraft({ ...draft, note: event.target.value })} className="min-h-11 w-full rounded-lg border border-earth-300 px-3 text-base" />
      <button type="submit" disabled={saving || blocked} className="min-h-11 w-full rounded-lg bg-primary-700 px-3 text-base font-medium text-white disabled:opacity-50">{saving ? "收款中…" : "收款並完成體驗"}</button>
      </div>
    </form>}
    {!readOnly && checkout.canResolve && usingPlan && status === "PENDING" && <form className="mt-3 flex flex-wrap gap-2" onSubmit={event => {
      event.preventDefault();
      if (!walletId || !slot.wallets?.some(wallet => wallet.id === walletId)) return;
      const wallet = slot.wallets.find(wallet => wallet.id === walletId)!;
      void run(() => changeBookingParticipantService({ bookingId, position: slot.position, revision: slot.revision, operation: "selectPlan", walletId }), "PENDING", null, () => setSelection({ walletId, name: wallet.name }));
    }}>
      {slot.wallets?.length === 1 ? <p className="flex min-h-11 items-center text-base">{slot.wallets[0].name} · 可用 {slot.wallets[0].available} 堂</p> : <select aria-label={`${slot.name}本人方案`} value={walletId} disabled={saving || blocked}
        onChange={event => setWalletId(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-earth-300 px-3 text-base">
        <option value="">選擇本次使用方案</option>
        {slot.wallets?.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name} · 可用 {wallet.available} 堂 · {wallet.expiryDate ? `${wallet.expiryDate.replaceAll("-", "/")} 到期` : "無期限"}</option>)}
      </select>}
      <button type="submit" disabled={saving || blocked || !walletId} className="min-h-11 rounded-lg bg-primary-700 px-3 text-base text-white disabled:opacity-50">{saving ? "處理中…" : "改用此方案"}</button>
    </form>}
    {!readOnly && checkout.canResolve && isPlan && status === "PENDING" && amount == null && <button type="button" disabled={blocked || saving}
      onClick={() => void run(() => changeBookingParticipantService({ bookingId, position: slot.position, revision: slot.revision, operation: "selectPlan", walletId: null }), "PENDING", null, () => setSelection(null))}
      className="mt-2 min-h-11 px-3 text-base text-earth-600 disabled:opacity-50">改回體驗</button>}
    {message && <p role="alert" className="mt-2 text-sm text-amber-800">{message}</p>}
    {canSell && slot.customerId && <div className="mt-2">
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
  onUpdated: () => void; onBusy: (busy: boolean) => void; companions?: BookingDrawerPayload["companions"]; canEditNote?: boolean; onPersonNoteSaved?: (customerId: string, value: string | null) => void; primaryCustomer?: BookingDrawerPayload["booking"]["customer"]; onOpenCustomer?: (customerId: string) => void }) {
  const [progress, setProgress] = useState<Record<string, { status: string; amount: number | null }>>({});
  const keyFor = (position: number, revision: number) => `${props.bookingId}:${position}:${revision}`;
  const allSlots = props.checkout.slots.map(slot => {
    const result = progress[keyFor(slot.position, slot.revision)];
    return result ? { ...slot, status: result.status, collectedAmount: result.amount } : slot;
  });
  const slots = allSlots.filter(slot => slot.status !== "REMOVED");
  const completed = slots.filter(slot => slot.status === "COMPLETED").length;
  const noShow = slots.filter(slot => slot.status === "NO_SHOW").length;
  const cancelled = slots.filter(slot => slot.status === "CANCELLED").length;
  const collected = slots.reduce((total, slot) => total + (slot.collectedAmount ?? 0), 0);
  return <section className="border-b border-earth-100 p-4" aria-label="逐人體驗結帳">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold text-earth-900">到店人員</h3>{props.companions && <BookingCompanionEditor bookingId={props.bookingId} companions={props.companions} readOnly={props.readOnly} blocked={props.blocked} onBusy={props.onBusy} onUpdated={props.onUpdated} addOnly />}</div>
    <p role="status" className="mb-2 break-words text-sm text-earth-600">已服務 {completed}／{slots.length} 人 · 已收 NT$ {collected.toLocaleString("zh-TW")}{noShow ? ` · 未到 ${noShow}` : ""}{cancelled ? ` · 已取消 ${cancelled}` : ""}</p>
    {slots.map((slot, index) => <ParticipantRow key={`${props.bookingId}:${slot.position}`} {...props} displayPosition={index + 1} slot={slot}
      onProgress={(position, revision, status, amount) => setProgress(previous => ({ ...previous, [keyFor(position, revision)]: { status, amount } }))} />)}
  </section>;
}
