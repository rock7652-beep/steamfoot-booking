"use client";
import { useEffect, useRef, useState } from "react";
import { loadMemberConnectionAction, approveMemberConnectionAction, approveLoginRecoveryAction } from "@/server/actions/store-member-connection";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { readMemberConnection } from "@/lib/customer-support-read-client";

type Result = Extract<Awaited<ReturnType<typeof loadMemberConnectionAction>>, { success: true; canConfirm: boolean }>;
export function StoreMemberConnectionPanel({ customerId, compact=false,initial }: { customerId: string;compact?:boolean;initial?:{customerId:string;value:Result} }) {
  const [result, setResult] = useState<Result | null>(()=>initial?.customerId===customerId?initial.value:null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useSettingsPanelGuard(false, busy);
  const sequence = useRef(0);
  const submitting = useRef(false);
  const reader = usePanelReader("store-member-connection", readMemberConnection, "", 0);
  useEffect(() => {
    const key = ++sequence.current;
    if(initial?.customerId===customerId){setResult(initial.value);setError(null);return;}
    setResult(null); setError(null);
    void reader.read(customerId).then(value => {
      if (key !== sequence.current) return;
      if (value.success && "canConfirm" in value) setResult(value); else if (!value.success) setError(value.error);
    }).catch(() => { if (key === sequence.current) setError("目前無法讀取，請重新開啟"); });
    return () => { sequence.current = key + 1; };
  }, [customerId, reader,initial?.customerId,initial?.value]);
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== customerId) return;
      const key = ++sequence.current;
      reader.invalidate(customerId);
      void reader.read(customerId).then(value => {
        if (key !== sequence.current) return;
        if (value.success && "canConfirm" in value) { setResult(value); setError(null); }
        else if (!value.success) setError(value.error);
      }).catch(() => { if (key === sequence.current) setError("目前無法讀取，請重新開啟"); });
    };
    window.addEventListener("customer-line:changed", refresh);
    return () => { window.removeEventListener("customer-line:changed", refresh); sequence.current++; };
  }, [customerId, reader]);
  async function confirm(id: string, kind: "login" | "notification", verificationCode: string) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(null);
    const key = sequence.current;
    try {
      const value = kind === "login" ? await approveLoginRecoveryAction(id, customerId, verificationCode) : await approveMemberConnectionAction(id, customerId);
      if (key !== sequence.current) return;
      if (!value.success) { setError(value.error); return; }
      reader.invalidate(customerId);
      // Approval authorizes a fresh Login attempt; it does not prove that the
      // customer has logged in or that an OA notification was delivered.
      setResult(current => current ? {
        ...current,
        data: {
          ...current.data,
          ...(kind === "login" ? { login: "已核對，登入前持續有效；等待顧客完成登入" } : {
            membership: "已連結",
            notification: "本店已確認，發送前再檢查通道",
          }),
          pending: current.data.pending.filter(request => request.id !== id),
          conflict: false,
        },
      } : current);
    } catch { if (key === sequence.current) setError("目前無法確認，請稍後再試"); }
    finally { submitting.current = false; if (key === sequence.current) setBusy(false); }
  }
  return <section className={compact?"flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-earth-100 py-2 text-sm":"min-w-0 space-y-2 rounded-lg border border-earth-200 p-3 text-sm"} aria-label="本店會員與 LINE" aria-busy={busy}>
    <p className="font-semibold">本店會員與 LINE</p>
    {result ? <>
      <p>會員資料：{result.data.membership}</p>
      <p role="status">登入：{result.data.login}</p>
      <p>通知：{result.data.notification}</p>
      {result.data.conflict ? <p className="text-amber-800">有多筆待確認身分，請核對後處理。</p> : result.data.pending.map(request =>
        <div key={request.id} className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 break-words">{request.kind === "login" ? "會員登入" : "LINE 通知"}待確認・核對本人與手機上的確認碼 {request.verificationCode}</p>
          {result.canConfirm && <button type="button" disabled={busy} onClick={() => void confirm(request.id, request.kind, request.verificationCode)} className="min-h-11 rounded-md bg-primary-700 px-3 text-white">
            {busy ? "確認中…" : request.kind === "login" ? "已核對本人與確認碼，允許重新登入" : "已核對本人，確認通知連結"}
          </button>}
        </div>)}
    </> : !error && <p>讀取中…</p>}
    {error && <p role="alert" className="break-words text-red-700">{error}</p>}
  </section>;
}
