"use client";

import { useState, useEffect, useRef } from "react";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { useRouter } from "next/navigation";
import { unlinkLineAccount } from "@/server/actions/reminder";
import { createLineRebindCaptureRequest, cancelLineRebindCaptureRequest, dryRunLineRebind, executeLineRebindAction, startPhoneLineRebindAction } from "@/server/actions/line-rebind";


interface LineBindingSectionProps {
  compact?: boolean;
  onUpdated?: () => void;
  customerId: string;
  lineLinkStatus: string;
  lineUserId: string | null;
  lineLinkedAt: string | null; // ISO string
  lineBindingCode: string | null;
  lineBindingCodeCreatedAt: string | null; // ISO string
  canManageLineRebind: boolean;
  canRunLineRebindDryRun: boolean;
  activeLineRebindRequest: {
    id: string; status: string; capturedAt: string | null; expiresAt: string; untilUsed?: boolean; phoneRebindFailed?: boolean; userIdHashPrefix: string | null;
  } | null;
}

export function LineBindingSection({
  compact = false,
  customerId,
  lineLinkStatus,
  lineUserId,
  lineLinkedAt,
  canManageLineRebind,
  canRunLineRebindDryRun,
  activeLineRebindRequest,
  onUpdated,
}: LineBindingSectionProps) {
  const router = useRouter();
  const busy = useRef(false);
  const [reason, setReason] = useState("");
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const [helpOpen,setHelpOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [status, setStatus] = useState(lineLinkStatus);
  const [dryRun, setDryRun] = useState<{ requestId: string; overall: string; candidateHashPrefix: string | null; candidateMaskedUserId: string | null; checks: Record<string, { status: string; code: string }> } | null>(null);
  const [executeConfirmOpen, setExecuteConfirmOpen] = useState(false);
  const [executeConfirmation, setExecuteConfirmation] = useState("");

  useSettingsPanelGuard((creatingRequest && !!reason) || unlinkConfirmOpen || (executeConfirmOpen && !!executeConfirmation), pending);

  const hasActiveRebindRequest = Boolean(activeLineRebindRequest);

  // ── 自動刷新：等待綁定完成 / re-follow 恢復 ──
  useEffect(() => {
    // LINKED → 不需要刷新
    if (status === "LINKED" && !hasActiveRebindRequest) return;
    // UNLINKED 且沒有綁定碼 → 沒在等待綁定，不刷新
    if (status === "UNLINKED" && !hasActiveRebindRequest) return;
    // BLOCKED → 需要偵測 re-follow 恢復（不依賴 bindingCode）
    // UNLINKED + 有綁定碼 → 需要偵測綁定成功

    const interval = setInterval(() => {
      window.dispatchEvent(new CustomEvent("customer-line:changed", { detail: customerId }));
      if (onUpdated) onUpdated(); else router.refresh();
    }, 10_000);

    return () => clearInterval(interval);
  }, [status, router, onUpdated, hasActiveRebindRequest, customerId]);

  // ── Sync props when server re-renders ──
  useEffect(() => {
    setStatus(lineLinkStatus);
  }, [lineLinkStatus]);

  useEffect(() => {
    setDryRun(null);
  }, [activeLineRebindRequest?.id]);


  // ── 解除綁定 ──
  async function handleUnlink() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage(null);
    try {
      const result = await unlinkLineAccount(customerId);
      if (result.success) {
        setStatus("UNLINKED");
        setUnlinkConfirmOpen(false);
        setMessage({ text: "已解除綁定，預約、方案及消費紀錄均保留", type: "success" });
        window.dispatchEvent(new CustomEvent("customer-line:changed", { detail: customerId }));
        if (onUpdated) onUpdated(); else router.refresh();
      } else {
        setMessage({ text: result.error, type: "error" });
      }
    } catch {
      setMessage({ text: "操作失敗，請稍後再試", type: "error" });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function runOperation(work: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage(null);
    try { await work(); }
    catch { setMessage({ text: "操作未完成，請重新讀取狀態後重試", type: "error" }); }
    finally { busy.current = false; setPending(false); }
  }

  async function handleStartPhoneRebind() {
    await runOperation(async () => {
      const result = await startPhoneLineRebindAction(customerId);
      setMessage(result.success ? null : { text: result.error, type: "error" });
      if (result.success) { window.dispatchEvent(new CustomEvent("customer-line:changed", { detail: customerId })); if (onUpdated) onUpdated(); else router.refresh(); }
    });
  }

  async function handleCreateRebindRequest() {
    if (!creatingRequest) { setCreatingRequest(true); return; }
    if (reason.trim().length < 20 || reason.trim().length > 500) {
      setMessage({ text: "請填寫 20–500 字的核對原因，不含電話或 LINE ID", type: "error" });
      return;
    }
    await runOperation(async () => {
      setDryRun(null);
      const result = await createLineRebindCaptureRequest({ customerId, reason });
      setMessage(result.success
        ? { text: result.data.status === "created" ? "已開始重新綁定，請顧客於 15 分鐘內在本店 LINE 輸入手機號碼。" : "已有有效的重新綁定申請。", type: "success" }
        : { text: result.error, type: "error" });
      if (result.success) {
        setCreatingRequest(false); setReason("");
        if (onUpdated) onUpdated(); else router.refresh();
      }
    });
  }

  async function handleCancelRebindRequest() {
    if (!activeLineRebindRequest || !confirm(activeLineRebindRequest.untilUsed ? "確定撤銷這次會員登入授權？" : "取消後候選 LINE 身份密文會立即刪除，確定取消？")) return;
    await runOperation(async () => {
      setDryRun(null);
      const result = await cancelLineRebindCaptureRequest(activeLineRebindRequest.id);
      setMessage(result.success ? { text: "申請已撤銷。", type: "success" } : { text: result.error, type: "error" });
      if (result.success) { if (onUpdated) onUpdated(); else router.refresh(); }
    });
  }

  async function handleDryRun() {
    if (!activeLineRebindRequest) return;
    await runOperation(async () => {
      setDryRun(null);
      const result = await dryRunLineRebind(activeLineRebindRequest.id);
      if (result.success) setDryRun(result.data);
      else setMessage({ text: result.error, type: "error" });
    });
  }

  async function handleExecuteRebind() {
    if (!activeLineRebindRequest || activeDryRun?.overall !== "READY_FOR_REBIND" || executeConfirmation !== "確認重新綁定") return;
    await runOperation(async () => {
      const result = await executeLineRebindAction(activeLineRebindRequest.id);
      if (result.success) {
        setDryRun(null); setExecuteConfirmOpen(false); setExecuteConfirmation("");
        setMessage({ text: "LINE 重新綁定完成。", type: "success" });
        if (onUpdated) onUpdated(); else router.refresh();
      } else {
        setDryRun(null);
        setMessage({ text: result.error, type: "error" });
      }
    });
  }

  const activeDryRun = dryRun?.requestId === activeLineRebindRequest?.id ? dryRun : null;

  function maskLineUserId(uid: string) {
    return uid.length <= 8 ? `${uid.slice(0, 4)}****` : `${uid.slice(0, 4)}****${uid.slice(-4)}`;
  }

  const reasonEditor = creatingRequest && <div className="space-y-2 rounded border border-earth-200 p-3">
    <label className="block">核對原因（20–500 字，不含電話或 LINE ID）<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={20} maxLength={500} disabled={pending} className="mt-1 min-h-24 w-full rounded border p-3 text-base" /></label>
    <div className="flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={handleCreateRebindRequest} className="min-h-11 rounded bg-primary-700 px-3 text-white">確認開始重新綁定</button><button type="button" disabled={pending} onClick={() => {setCreatingRequest(false);setReason("");}} className="min-h-11 px-3">返回</button></div>
  </div>;

  if(compact) return <div className="space-y-2 text-sm">
    <div className="flex min-h-11 flex-wrap items-center gap-3"><span>LINE：{status === "LINKED" ? "已綁定" : status === "BLOCKED" ? "顧客已封鎖" : "未綁定"}</span>{helpOpen && status === "UNLINKED" && canManageLineRebind && !activeLineRebindRequest && <button type="button" disabled={pending} onClick={handleStartPhoneRebind} className="min-h-11 rounded-lg bg-primary-700 px-4 font-medium text-white hover:bg-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700 disabled:opacity-50">重新綁定</button>}<button type="button" disabled={pending} aria-expanded={helpOpen} onClick={()=>setHelpOpen(!helpOpen)} className="min-h-11 px-3 text-primary-700">{helpOpen ? "收合" : "⋯ 管理"}</button></div>
    {helpOpen && !(status === "UNLINKED" && canManageLineRebind && !activeLineRebindRequest) && <div className="space-y-2 border-t border-earth-100 py-2">
      {canManageLineRebind && (status === "LINKED" || status === "BLOCKED") && <>
        <button type="button" disabled={pending} onClick={() => setUnlinkConfirmOpen(true)} className="min-h-11 rounded border border-red-200 px-3 text-red-700">取消 LINE 綁定</button>
        {unlinkConfirmOpen && <div className="space-y-2 rounded border border-red-200 p-3" role="group" aria-label="確認取消 LINE 綁定">
          <p>確認已核對本人？解除後會停止本店 LINE 通知，預約、方案及消費紀錄均保留。</p>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={() => setUnlinkConfirmOpen(false)} className="min-h-11 rounded border px-3">返回</button><button type="button" disabled={pending} onClick={handleUnlink} className="min-h-11 rounded bg-red-700 px-3 text-white">{pending ? "處理中…" : "確認取消綁定"}</button></div>
        </div>}
      </>}

      {activeLineRebindRequest?.untilUsed ? <><p>已核對，登入前持續有效；等待顧客完成登入。</p>{canManageLineRebind && <button type="button" disabled={pending} onClick={handleCancelRebindRequest} className="min-h-11 px-3 text-earth-600">撤銷登入授權</button>}</> : status === "BLOCKED" ? <p>請顧客解除封鎖並重新加入本店官方LINE。</p> : status === "UNLINKED" && !canManageLineRebind ? <p>需負責人或管理員協助管理 LINE 綁定。</p> : status === "UNLINKED" ? <>{activeLineRebindRequest && <><p role={activeLineRebindRequest.phoneRebindFailed ? "alert" : undefined}>{activeLineRebindRequest.phoneRebindFailed ? "無法完成綁定，請先檢查手機號碼或 LINE 是否已屬於其他顧客。" : "請顧客在 15 分鐘內於本店官方 LINE 輸入手機號碼，系統會自動完成綁定。"}</p><button type="button" disabled={pending} onClick={handleCancelRebindRequest} className="min-h-11 px-3 text-earth-600">取消重新綁定</button></>}</> : !canManageLineRebind || !canRunLineRebindDryRun ? <p>目前無法重新綁定，請聯絡總部協助。</p> : <><p>請先核對顧客姓名與手機，再請顧客在本店官方LINE輸入自己的手機號碼。</p>{!activeLineRebindRequest ? <button type="button" disabled={pending} onClick={handleCreateRebindRequest} className="min-h-11 px-3 text-primary-700">開始重新綁定</button> : <><p>{activeLineRebindRequest.status === "CANDIDATE_CAPTURED" ? "已收到顧客資料，請確認綁定。" : "等待顧客輸入手機號碼。"}</p>{activeLineRebindRequest.status === "CANDIDATE_CAPTURED" && <button type="button" disabled={pending} onClick={handleDryRun} className="min-h-11 px-3 text-primary-700">檢查綁定資料</button>}{activeDryRun?.overall === "READY_FOR_REBIND" && <button type="button" disabled={pending} onClick={()=>setExecuteConfirmOpen(true)} className="min-h-11 px-3 text-primary-700">確認重新綁定</button>}<button type="button" disabled={pending} onClick={handleCancelRebindRequest} className="min-h-11 px-3 text-earth-600">取消重新綁定</button>{activeDryRun && activeDryRun.overall !== "READY_FOR_REBIND" && <p>目前無法重新綁定，請聯絡總部協助。</p>}</>}
      {reasonEditor}
      {executeConfirmOpen && <div className="space-y-2"><p>確認後，通知會改送至這次核對的LINE帳號。</p><label>輸入「確認重新綁定」<input value={executeConfirmation} onChange={event=>setExecuteConfirmation(event.target.value)} disabled={pending} className="min-h-11 w-full rounded border px-3"/></label><button type="button" disabled={pending || executeConfirmation !== "確認重新綁定"} onClick={handleExecuteRebind} className="min-h-11 px-3 text-primary-700">確認重新綁定</button><button type="button" disabled={pending} onClick={()=>{setExecuteConfirmOpen(false);setExecuteConfirmation("");}} className="min-h-11 px-3">取消</button></div>}</>}
    </div>}{message && <p role={message.type === "error" ? "alert" : "status"}>{message.text}</p>}
  </div>;

  return (
    <div className="mt-4 border-t pt-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-earth-800">
        <svg className="h-4 w-4 text-[#06C755]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .348-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .349-.281.63-.63.63h-2.386a.63.63 0 0 1-.63-.63V8.108a.63.63 0 0 1 .63-.63h2.386c.349 0 .63.282.63.63 0 .349-.281.631-.63.631H17.61v1.125h1.755zm-3.855 3.016a.63.63 0 0 1-.63.63.629.629 0 0 1-.51-.262l-2.442-3.339v2.97a.63.63 0 0 1-1.26 0V8.108a.63.63 0 0 1 .63-.63c.2 0 .383.096.51.262l2.442 3.339V8.108a.63.63 0 0 1 1.26 0v4.771zm-5.741 0a.63.63 0 0 1-1.26 0V8.108a.63.63 0 0 1 1.26 0v4.771zm-2.466.63H4.917a.63.63 0 0 1-.63-.63V8.108a.63.63 0 0 1 1.26 0v4.141h1.756c.348 0 .629.283.629.63 0 .349-.281.63-.629.63M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.122.301.079.771.039 1.075l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967C23.023 14.469 24 12.512 24 10.314" />
        </svg>
        LINE 綁定
      </h3>

      {canManageLineRebind && status !== "UNLINKED" && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-medium">受控 LINE 重新綁定（僅捕捉候選身份）</p>
          {!canRunLineRebindDryRun && <p className="mt-1">此店 LINE Bot 尚未完成安全識別設定，暫時無法執行重新綁定檢查。</p>}
          {activeLineRebindRequest ? <>
            <p className="mt-1">狀態：{activeLineRebindRequest.status}；{activeLineRebindRequest.untilUsed ? "登入前持續有效" : `到期：${new Date(activeLineRebindRequest.expiresAt).toLocaleString("zh-TW")}`}</p>
            {activeLineRebindRequest.capturedAt && <p className="mt-1">已捕捉；userId hash：{activeLineRebindRequest.userIdHashPrefix ?? "—"}</p>}
            {canRunLineRebindDryRun && activeLineRebindRequest.status === "CANDIDATE_CAPTURED" && <button onClick={handleDryRun} disabled={pending} className="mt-2 mr-3 text-amber-800 underline disabled:opacity-50">執行安全檢查</button>}
            {activeDryRun?.overall === "READY_FOR_REBIND" && <button onClick={() => setExecuteConfirmOpen(true)} disabled={pending} className="mt-2 mr-3 text-red-800 underline disabled:opacity-50">確認正式重新綁定</button>}
            <button onClick={handleCancelRebindRequest} disabled={pending} className="mt-2 text-amber-800 underline disabled:opacity-50">取消申請並刪除候選密文</button>
            {activeDryRun && <div className="mt-2 space-y-1"><p>整體：{activeDryRun.overall}</p><p>候選：{activeDryRun.candidateMaskedUserId ?? "—"}（hash：{activeDryRun.candidateHashPrefix ?? "—"}）</p>{Object.entries(activeDryRun.checks).map(([name, check]) => <p key={name}>{name}：{check.status}（{check.code}）</p>)}</div>}
            {executeConfirmOpen && <div role="dialog" aria-modal="true" className="mt-3 rounded border border-red-200 bg-white p-3 text-earth-800"><p className="font-medium">確定要正式重新綁定 LINE 嗎？</p><p className="mt-1">此操作會將目前顧客的 LINE 身份改為候選身份；舊身份將停止接收此顧客的通知。操作會留下稽核紀錄，完成後不能由畫面直接復原。</p><label className="mt-2 block">請輸入「確認重新綁定」<input value={executeConfirmation} onChange={(event) => setExecuteConfirmation(event.target.value)} disabled={pending} className="mt-1 w-full rounded border p-1" /></label><div className="mt-2 flex gap-2"><button onClick={() => { setExecuteConfirmOpen(false); setExecuteConfirmation(""); }} disabled={pending} className="underline">取消</button><button onClick={handleExecuteRebind} disabled={pending || executeConfirmation !== "確認重新綁定"} className="text-red-800 underline disabled:opacity-50">確認正式重新綁定</button></div></div>}
          </> : <>
            <p className="mt-1">建立後，顧客下一次輸入正確電話才會捕捉候選身份；不會直接變更綁定。</p>
            {canRunLineRebindDryRun && <button onClick={handleCreateRebindRequest} disabled={pending} className="mt-2 text-amber-800 underline disabled:opacity-50">建立 15 分鐘捕捉申請</button>}
          </>}
        </div>
      )}

      {reasonEditor}
      {/* ═══════════════ 已綁定 ═══════════════ */}
      {status === "LINKED" && (
        <div className="space-y-3">
          {/* 狀態標籤 */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#06C755]/10 px-2.5 py-1 text-xs font-medium text-[#06C755]">
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              已綁定
            </span>
            {lineLinkedAt && (
              <span className="text-xs text-earth-400">
                {new Date(lineLinkedAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })} 綁定
              </span>
            )}
          </div>

          {/* LINE User ID（遮蔽） */}
          {lineUserId && (
            <div className="flex items-center gap-2 rounded-lg bg-earth-50 px-3 py-2">
              <span className="text-xs text-earth-500">LINE User ID</span>
              <code className="text-xs font-mono text-earth-600">
                {maskLineUserId(lineUserId)}
              </code>
            </div>
          )}

          {/* 解除綁定 */}
          <button
            onClick={() => setUnlinkConfirmOpen(true)}
            disabled={pending || !canManageLineRebind}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {pending ? "處理中..." : "解除綁定"}
          </button>
        </div>
      )}

      {/* ═══════════════ 已封鎖 ═══════════════ */}
      {status === "BLOCKED" && (
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-600">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            已封鎖
          </span>
          <p className="text-xs text-earth-400">
            此顧客已封鎖 LINE 官方帳號，需顧客重新加入好友後才能自動恢復綁定。
          </p>
        </div>
      )}

      {status === "UNLINKED" && (
        <div className="space-y-2">
          {!canManageLineRebind ? <p>需負責人或管理員協助管理 LINE 綁定。</p> : activeLineRebindRequest ? <>
            <p role={activeLineRebindRequest.phoneRebindFailed ? "alert" : undefined}>{activeLineRebindRequest.phoneRebindFailed ? "無法完成綁定，請先檢查手機號碼或 LINE 是否已屬於其他顧客。" : "請顧客在 15 分鐘內於本店官方 LINE 輸入手機號碼，系統會自動完成綁定。"}</p>
            <button type="button" disabled={pending} onClick={handleCancelRebindRequest} className="min-h-11 px-3">取消重新綁定</button>
          </> : <button type="button" disabled={pending} onClick={handleStartPhoneRebind} className="min-h-11 rounded-lg bg-primary-600 px-4 text-white">重新綁定</button>}
        </div>
      )}

      {unlinkConfirmOpen && <div className="space-y-2 rounded border border-red-200 p-3"><p>確認已核對本人？預約、方案及消費紀錄均保留。</p><button type="button" disabled={pending} onClick={() => setUnlinkConfirmOpen(false)} className="min-h-11 px-3">返回</button><button type="button" disabled={pending} onClick={handleUnlink} className="min-h-11 px-3 text-red-700">確認取消綁定</button></div>}
      {/* ═══════════════ 訊息提示 ═══════════════ */}
      {message && (
        <p className={`mt-3 text-xs font-medium ${
          message.type === "error" ? "text-red-600" : "text-green-600"
        }`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
