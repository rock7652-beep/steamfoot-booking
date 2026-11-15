"use client";
import { useEffect, useRef, useState } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { fetchTransactionReplacementContext } from "@/server/actions/transaction-replacement";
import { AssignPlanForm } from "../../customers/[id]/assign-plan-form";

export default function TransactionReplacementForm({ sourceId, onSuccess, onPendingChange }: {
  sourceId: string; onSuccess: () => void; onPendingChange: (pending: boolean) => void;
}) {
  const reader = usePanelReader("transaction-replacement", fetchTransactionReplacementContext);
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchTransactionReplacementContext>> | null>(null);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; onPendingChange(false); };
  }, [onPendingChange]);
  useEffect(() => {
    let active = true;
    void reader.read(sourceId).then(value => { if (active) setResult(value); })
      .catch(() => { if (active) setResult({ success: false, error: "讀取失敗，請重試" }); });
    return () => { active = false; };
  }, [sourceId, reader, revision]);
  if (!result) return <p role="status" className="py-3 text-sm">正在讀取補登資料…</p>;
  if (!result.success) return <div role="alert" className="space-y-3 text-sm text-red-700">
    <p>{result.error}</p><button type="button" className="min-h-11 rounded border px-3" onClick={() => {
      reader.invalidate(sourceId); setResult(null); setRevision(value => value + 1);
    }}>重新讀取</button>
  </div>;
  const context = result.data;
  return <div className="min-w-0 space-y-3">
    <p className="text-sm text-earth-700">沿用原交易日期 {context.businessDate}，不重複計入今日收款。無須另外記支出或調整現金。</p>
    <AssignPlanForm key={sourceId} customerId={context.customerId} plans={context.plans}
      canDiscount={context.canDiscount} alwaysOpen replacementOfTransactionId={sourceId}
      defaultPaymentMethod={context.paymentMethod === "UNPAID" ? "CASH" : context.paymentMethod}
      onPendingChange={onPendingChange} onSuccess={() => { reader.invalidate(sourceId); if (mounted.current) onSuccess(); }} />
  </div>;
}
