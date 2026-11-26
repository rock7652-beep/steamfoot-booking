"use client";
import { useEffect, useRef, useState } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { SettingsListRow } from "@/components/settings/settings-workspace";
import type { AiHandoffPage, AiHandoffResumeInput, AiHandoffSnapshot } from "@/server/ai/handoff-contract";
import { readAiButlerHandoffs, resumeAiButlerConversation } from "./ai-actions";
import { useAiHandoffWorkspace } from "./ai-handoff-workspace";

const button = "min-h-11 rounded-lg border border-earth-200 px-3 text-sm disabled:opacity-50";
export function AiHandoffPanel({ page: initialPage, viewKey, cursor: initialCursor, readOnly = false, actions: suppliedActions, serviceMode="STORE" }: { serviceMode?:"STORE"|"BRAND"; actions?:{readAiButlerHandoffs:typeof readAiButlerHandoffs;resumeAiButlerConversation:typeof resumeAiButlerConversation}; page: AiHandoffPage | null; viewKey: string; cursor?: string; readOnly?: boolean }) {
  const actions=suppliedActions??{readAiButlerHandoffs,resumeAiButlerConversation};
  const [data, setData] = useState({ page: initialPage, cursor: initialCursor });
  const { page, cursor } = data, shared = useAiHandoffWorkspace();
  const reader = usePanelReader("ai-handoff-queue", actions.readAiButlerHandoffs, viewKey, 0);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; reader.clear(); }, [reader]);
  const [expanded, setExpanded] = useState(!!initialCursor), [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false), [stale, setStale] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [uncertain, setUncertain] = useState(false);
  const pending = useRef<AiHandoffResumeInput | null>(null);
  const locked = busy || refreshing || uncertain;
  function apply(snapshot: AiHandoffSnapshot, path: string) {
    if (snapshot.viewKey !== viewKey || window.location.pathname !== path) return;
    setData({ page: snapshot.page, cursor: snapshot.cursor }); setStale(false); shared?.accept(snapshot);
    const params = new URLSearchParams(window.location.search);
    if (snapshot.cursor) params.set("aiQueueAfter", snapshot.cursor); else params.delete("aiQueueAfter");
    window.history.replaceState(window.history.state, "", `${path}${params.size ? `?${params}` : ""}`);
  }
  async function refresh(after?: string) {
    if (uncertain || busy) return;
    const ticket = ++generation.current, path = window.location.pathname;
    setConfirm(null); setError(""); setRefreshing(true);
    try {
      const response = await reader.refresh({ viewKey, cursor: after });
      if (ticket !== generation.current || window.location.pathname !== path) return;
      if (response.success) { if (response.snapshot.viewKey !== viewKey) throw new Error("SCOPE_CHANGED"); apply(response.snapshot, path); }
      else { setError(response.error); setStale(true); }
    } catch { if (ticket === generation.current) { setError("清單更新失敗，保留目前資料；請重新整理後再操作。"); setStale(true); } }
    finally { if (ticket === generation.current) setRefreshing(false); }
  }
  async function resume(row?: AiHandoffPage["rows"][number]) {
    if (readOnly) return;
    const command = pending.current ?? (row ? { commandId: crypto.randomUUID(), viewKey, scopeKey: row.scopeKey, revision: row.revision, cursor } : null);
    if (!command) return;
    const ticket = ++generation.current, path = window.location.pathname;
    pending.current = command; setUncertain(true); setBusy(true); setError(""); setNotice("");
    try {
      const response = await actions.resumeAiButlerConversation(command);
      if (ticket !== generation.current || window.location.pathname !== path) return;
      if (response.success) {
        if (response.snapshot.viewKey !== viewKey) throw new Error("SCOPE_CHANGED");
        reader.clear(); apply(response.snapshot, path);
        pending.current = null; setUncertain(false); setConfirm(null);
        setNotice(response.duplicate ? "此操作已處理，請核對最新清單。" : "已記錄恢復；AI 總停止與店家開關仍有效。");
      } else {
        setError(response.error);
        if (!response.uncertain) { pending.current = null; setUncertain(false); setStale(true); }
      }
    } catch { if (ticket === generation.current) setError("連線中斷，操作結果尚未確認；重試會沿用原操作。"); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  return <section aria-label="AI 待人工處理" className="min-w-0 rounded-xl border border-earth-200 bg-white px-4">
    <SettingsListRow title="AI 待人工處理" summary={page ? `${page.total} 筆待處理・隔離測試` : "讀取失敗，請重新整理"} expanded={expanded} keepMounted
      controls={<button type="button" className={button} disabled={locked} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收合待處理" : "查看待處理"}</button>}>
      <div className="min-w-0 space-y-3 pb-4 text-sm">
        <p className="text-earth-600">{serviceMode === "BRAND" ? "集中查看本品牌真人接手狀態，不含門市對話；恢復後仍受總停止與品牌開關限制。" : "集中查看本店隔離測試的真人接手狀態；不含真實顧客或訊息。恢復後仍受 AI 總停止與店家開關限制。"}</p>
        <div className="flex flex-wrap items-center gap-2"><button type="button" className={button} disabled={locked} onClick={() => refresh(cursor)}>重新整理待處理</button>
          {cursor && <button type="button" className={button} disabled={locked} onClick={() => refresh()}>回到第一頁</button>}
          {page?.nextCursor && <button type="button" className={button} disabled={locked} onClick={() => refresh(page.nextCursor!)}>下一頁待處理</button>}
          {refreshing && <span role="status">更新中…</span>}</div>
        {!page ? <p role="alert">待處理清單尚未讀取成功，不能視為沒有待辦。</p> : !page.rows.length ? <p role="status">{cursor ? "這一頁沒有待處理對話，可回到第一頁核對。" : "目前沒有待人工處理的測試對話。"}</p> :
          <ul aria-label="待處理測試對話" className="min-w-0 divide-y divide-earth-100">{page.rows.map(row => <li key={row.scopeKey} data-scope-code={row.scopeKey} className="admin-striped-row min-w-0 space-y-2 p-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 break-words"><p className="font-medium">測試對話 {row.scopeKey.slice(0, 8)}…{row.scopeKey.slice(-4)}</p><p className="text-earth-600">{row.needsReview ? "事件仍處理中或待核對，暫不能恢復" : "真人接手中"}</p>{row.lastEventLabel && <p className="text-earth-600">最近測試：{row.lastEventLabel}</p>}</div>
              <button type="button" className={button} disabled={readOnly || stale || locked || row.needsReview} onClick={() => { setConfirm(row.scopeKey); setError(""); setNotice(""); }}>準備恢復</button>
            </div>
            {confirm === row.scopeKey && <div className="space-y-2 rounded-lg border border-earth-200 p-3"><p>確認此對話已處理完畢，再允許後續自動回覆？這不會開啟 AI 總開關或店家開關。</p>
              <div className="flex flex-wrap gap-2"><button type="button" className={`${button} bg-primary-700 text-white`} disabled={readOnly || stale || locked} onClick={() => resume(row)}>確認恢復此對話</button><button type="button" className={button} disabled={locked} onClick={() => setConfirm(null)}>取消恢復</button></div>{error && <p role="alert" className="break-words text-red-700">{error}</p>}</div>}
          </li>)}</ul>}
        {readOnly && <p className="text-earth-600">目前是唯讀檢視，不能恢復對話。</p>}
        {error && (!confirm || !page?.rows.some(row => row.scopeKey === confirm)) && <p role="alert" className="break-words text-red-700">{error}</p>}
        {uncertain && !busy && <button type="button" className={button} onClick={() => resume()}>重試原恢復操作</button>}
        {notice && <p role="status" className="break-words text-primary-700">{notice}</p>}
      </div>
    </SettingsListRow>
  </section>;
}
