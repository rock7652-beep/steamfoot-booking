"use client";
import { useEffect, useRef, useState } from "react";
import { useCoursePhoneReader } from "./use-customer-support-readers";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { loadCoursePhoneConnection, confirmCoursePhoneLogin, confirmCoursePhoneView, removeCoursePhoneView } from "@/server/actions/course-phone-view";

export function CoursePhoneViewPanel({ customerId }: { customerId: string }) {
  const reader = useCoursePhoneReader();
  const [state, setState] = useState<{ id: string; value: Awaited<ReturnType<typeof loadCoursePhoneConnection>> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0), submitting = useRef(false);
  useSettingsPanelGuard(false, busy);
  useEffect(() => {
    const version = ++sequence.current;
    setError(null);
    reader.read(customerId).then(value => { if (version === sequence.current) setState({ id: customerId, value }); })
      .catch(() => { if (version === sequence.current) setError("目前無法讀取電話綁定，請重試"); });
    return () => { sequence.current = version + 1; };
  }, [customerId, reader, retry]);
  const current = state?.id === customerId ? state.value : reader.get(customerId)??reader.peek(customerId);
  const data = current?.success ? current.data : null;
  async function mutate(run: () => Promise<{ success: boolean; error?: string }>) {
    if (submitting.current) return;
    const version = sequence.current;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const result = await run();
      if (version !== sequence.current) return;
      if (!result.success) { setError(result.error ?? "目前無法更新，請重試"); return; }
      reader.invalidate(customerId);
      const value = await reader.read(customerId);
      if (version === sequence.current) setState({ id: customerId, value });
    } catch { if (version === sequence.current) setError("結果尚未確認，請重新讀取綁定狀態"); }
    finally { submitting.current = false; if (version === sequence.current) setBusy(false); }
  }
  const message = error ?? (current && !current.success ? current.error : null);
  return <section className="min-w-0 space-y-2 border-t border-earth-100 py-3 text-sm" aria-label="同電話學員查看" aria-busy={busy}>
    <h3 className="font-semibold">同電話學員查看</h3>
    {data ? <>
      <p role="status">{data.conflict ? "同電話學員身分需核對" : data.grantId ? "已允許集中查看" : "尚未允許集中查看"} · 共 {data.learnerCount} 位學員</p>
      {data.pending.map(request => <div key={request.id} className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="break-words">電話綁定待確認 · 確認碼 {request.verificationCode}</p>
        {data.canConfirm && !data.conflict && <button type="button" disabled={busy} className="min-h-11 rounded-md bg-primary-700 px-3 text-white" onClick={() => void mutate(() => confirmCoursePhoneLogin({ requestId: request.id, customerId: data.anchorCustomerId, verificationCode: request.verificationCode }))}>已核對本人與確認碼，允許查看</button>}
      </div>)}
      {data.canConfirm && !data.pending.length && data.linked && (!data.conflict || !!data.grantId) && <button type="button" disabled={busy} className="min-h-11 rounded-md border border-earth-300 px-3" onClick={() => void mutate(() => data.grantId ? removeCoursePhoneView(data.grantId) : confirmCoursePhoneView(data.anchorCustomerId))}>{data.grantId ? "停止集中查看" : "已核對聯絡人，允許集中查看"}</button>}
      {!data.linked && !data.pending.length && <p className="text-earth-600">尚未收到 LINE 電話綁定申請。</p>}
    </> : !message && <p role="status">讀取電話綁定狀態…</p>}
    {message && <p role="alert" className="break-words text-red-700">{message}</p>}
    {(message || busy === false) && <button type="button" disabled={busy} onClick={() => { reader.invalidate(customerId); setRetry(value => value + 1); }} className="min-h-11 text-primary-700">重新讀取</button>}
  </section>;
}
