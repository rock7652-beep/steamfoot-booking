"use client";
import { useEffect, useRef, useState } from "react";
import { loadMemberConnectionAction, approveMemberConnectionAction } from "@/server/actions/store-member-connection";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { usePanelReader } from "@/components/operations/panel-read-cache";

type Result = Extract<Awaited<ReturnType<typeof loadMemberConnectionAction>>, { success: true; canConfirm: boolean }>;
export function StoreMemberConnectionPanel({ customerId }: { customerId: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useSettingsPanelGuard(false, busy);
  const sequence = useRef(0);
  const submitting = useRef(false);
  const reader = usePanelReader("store-member-connection", loadMemberConnectionAction, "", 0);
  useEffect(() => {
    const key = ++sequence.current;
    setResult(null); setError(null);
    void reader.read(customerId).then(value => {
      if (key !== sequence.current) return;
      if (value.success && "canConfirm" in value) setResult(value); else if (!value.success) setError(value.error);
    }).catch(() => { if (key === sequence.current) setError("目前無法讀取，請重新開啟"); });
    return () => { sequence.current = key + 1; };
  }, [customerId, reader]);
  async function confirm(id: string) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(null);
    const key = sequence.current;
    try {
      const value = await approveMemberConnectionAction(id, customerId);
      if (key !== sequence.current) return;
      if (!value.success) { setError(value.error); return; }
      reader.invalidate(customerId);
      const latest = await reader.read(customerId);
      if (key === sequence.current && latest.success && "canConfirm" in latest) setResult(latest);
    } catch { if (key === sequence.current) setError("目前無法確認，請稍後再試"); }
    finally { submitting.current = false; if (key === sequence.current) setBusy(false); }
  }
  return <section className="space-y-2 rounded-lg border border-earth-200 p-3 text-sm" aria-label="本店會員與 LINE"><p className="font-semibold">本店會員與 LINE</p>{result ? <><p>會員：{result.data.membership}・{result.data.notification}</p>{result.data.conflict ? <p className="text-amber-800">有多筆待確認身分，請核對後處理。</p> : result.data.pending.map(request => <div key={request.id} className="flex flex-wrap items-center gap-2"><p>LINE 待確認・核對本人與手機上的確認碼 {request.verificationCode}</p>{result.canConfirm && <button type="button" disabled={busy} onClick={() => void confirm(request.id)} className="min-h-11 rounded-md bg-primary-700 px-3 text-white">{busy ? "確認中…" : "已核對本人，確認綁定"}</button>}</div>)}</> : !error && <p>讀取中…</p>}{error && <p role="alert" className="break-words text-red-700">{error}</p>}</section>;
}
