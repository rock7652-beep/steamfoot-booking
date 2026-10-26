"use client";
import { useEffect, useState } from "react";
import { StoreMemberConnectionPanel } from "./store-member-connection-panel";

/** Lives in the successful checkout, never authorizes identity from a sale. */
export function PlanPurchaseLoginCheck({ customerId, onDone, onBusyChange }: { customerId: string; onDone: () => void; onBusyChange?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  return <div className="min-w-0 space-y-3 text-left">
    <p role="status" className="text-base font-semibold text-primary-900">開卡完成，方案已儲存</p>
    <StoreMemberConnectionPanel key={customerId} customerId={customerId} purchaseCheck onBusyChange={setBusy} />
    <button type="button" disabled={busy} onClick={onDone} className="min-h-11 rounded-lg bg-primary-700 px-4 text-base text-white disabled:opacity-50">完成</button>
  </div>;
}
