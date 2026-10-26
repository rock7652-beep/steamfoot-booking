"use client";
import { useEffect, useRef, useState } from "react";
import { loadMemberConnectionAction, approveMemberConnectionAction, approveLoginRecoveryAction } from "@/server/actions/store-member-connection";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { usePanelReader } from "@/components/operations/panel-read-cache";

type Result = Extract<Awaited<ReturnType<typeof loadMemberConnectionAction>>, { success: true; canConfirm: boolean }>;
export function StoreMemberConnectionPanel({ customerId, compact=false,initial,purchaseCheck=false,onBusyChange }: { customerId: string;compact?:boolean;purchaseCheck?:boolean;onBusyChange?:(busy:boolean)=>void;initial?:{customerId:string;value:Result} }) {
  const [result, setResult] = useState<Result | null>(()=>initial?.customerId===customerId?initial.value:null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useSettingsPanelGuard(false, busy);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  const sequence = useRef(0);
  const submitting = useRef(false);
  const reader = usePanelReader("store-member-connection", loadMemberConnectionAction, "", 0);
  useEffect(() => {
    const key = ++sequence.current;
    submitting.current = false; setBusy(false);
    if(initial?.customerId===customerId){setResult(initial.value);setError(null);return;}
    setResult(null); setError(null);
    void reader.read(customerId).then(value => {
      if (key !== sequence.current) return;
      if (value.success && "canConfirm" in value) setResult(value); else if (!value.success) setError(value.error);
    }).catch(() => { if (key === sequence.current) setError("目前無法讀取，請重新開啟"); });
    return () => { sequence.current = key + 1; };
  }, [customerId, reader,initial?.customerId,initial?.value]);
  async function reload() {
    if (submitting.current) return;
    const key = ++sequence.current;
    setResult(null); setError(null); setBusy(true);
    reader.invalidate(customerId);
    try {
      const value = await reader.read(customerId);
      if (key !== sequence.current) return;
      if (value.success && "canConfirm" in value) setResult(value);
      else if (!value.success) setError(value.error);
    } catch { if (key === sequence.current) setError("目前無法讀取，請重新檢查；不需再次開卡"); }
    finally { if (key === sequence.current) setBusy(false); }
  }
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
          ...(kind === "login" ? { login: "已核對，登入前持續有效；等待顧客完成登入", purchaseLoginState: "retry" as const } : {
            membership: "已連結",
            notification: "本店已確認，發送前再檢查通道",
          }),
          pending: current.data.pending.filter(request => request.id !== id),
          conflict: false,
        },
      } : current);
    } catch { if (key === sequence.current) setError("目前無法確認，請稍後再試"); }
    finally { if (key === sequence.current) { submitting.current = false; setBusy(false); } }
  }
  const purchaseTitle = !result ? "檢查會員登入"
    : result.data.purchaseLoginState === "ready" ? "會員登入連結已就緒"
    : result.data.purchaseLoginState === "retry" ? "已核准，請顧客登入" : "會員登入待確認";
  return <section className={compact?"flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-earth-100 py-2 text-sm":"min-w-0 space-y-2 rounded-lg border border-earth-200 p-3 text-sm"} aria-label="本店會員與 LINE" aria-busy={busy}>
    <p className="font-semibold">{purchaseCheck ? purchaseTitle : "本店會員與 LINE"}</p>
    {result ? <>
      {!purchaseCheck && <p>會員資料：{result.data.membership}</p>}
      <p role="status">登入：{result.data.login}</p>
      {!purchaseCheck && <p>通知：{result.data.notification}</p>}
      {purchaseCheck && <p className="text-earth-600">{result.data.purchaseLoginState === "start" ? "請顧客從本店 LINE 開啟會員中心，輸入姓名、手機送出申請，再按重新檢查。" : result.data.purchaseLoginState === "ready" || result.data.purchaseLoginState === "retry" ? "請顧客重新開啟會員中心，確認能看到本次方案。" : "請核對本人及顧客手機上的確認碼，再允許登入。"}</p>}
      {result.data.conflict ? <p className="text-amber-800">有多筆待確認身分，請核對後處理。</p> : result.data.pending.filter(request => !purchaseCheck || request.kind === "login").map(request =>
        <div key={request.id} className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 break-words">{request.kind === "login" ? "會員登入" : "LINE 通知"}待確認・核對本人與手機上的確認碼 {request.verificationCode}</p>
          {result.canConfirm && <button type="button" disabled={busy} onClick={() => void confirm(request.id, request.kind, request.verificationCode)} className="min-h-11 rounded-md bg-primary-700 px-3 text-white">
            {busy ? "確認中…" : request.kind === "login" ? "已核對本人與確認碼，允許重新登入" : "已核對本人，確認通知連結"}
          </button>}
        </div>)}
    </> : !error && <p>讀取中…</p>}
    {purchaseCheck && result && !result.canConfirm && result.data.purchaseLoginState !== "ready" && <p>請有顧客修改權限的人員協助核准。</p>}
    {purchaseCheck && <button type="button" disabled={busy} onClick={() => void reload()} className="min-h-11 rounded-md border border-earth-300 px-3">{busy ? "檢查中…" : "重新檢查"}</button>}
    {error && <p role="alert" className="break-words text-red-700">{error}</p>}
  </section>;
}
