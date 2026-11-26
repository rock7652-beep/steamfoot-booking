"use client";

import { useRef, useState } from "react";
import { SettingsListRow } from "@/components/settings/settings-workspace";
import { saveAiButlerSetting, testAiButler, setAiButlerTestHandoff } from "./ai-actions";
import type { AiSetting, AiModule } from "@/server/ai/contracts";
import { useAiHandoffWorkspace } from "./ai-handoff-workspace";

type PanelActions = { saveAiButlerSetting: typeof saveAiButlerSetting; testAiButler: typeof testAiButler; setAiButlerTestHandoff: typeof setAiButlerTestHandoff };
type Props = { serviceMode?: "STORE" | "BRAND"; actions?: PanelActions; canToggle?: boolean; canTest?: boolean; canHandoff?: boolean; globalStopped?: boolean; setting: AiSetting; revision: number; liveTestAvailable: boolean; requestCount: string; reservedMicros: string; budgetMicros: number; alerts: number[]; initialHandoff?: boolean; initialHandoffRevision?: number };
export function AiButlerPanel(props: Props) {
  const brand = props.serviceMode === "BRAND";
  const actions = props.actions ?? { saveAiButlerSetting, testAiButler, setAiButlerTestHandoff };
  const [setting, setSetting] = useState(props.setting);
  const [revision, setRevision] = useState(props.revision);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scenario, setScenario] = useState<"hours" | "unknown" | "injection">("hours");
  const [module, setModule] = useState<AiModule>("STEAMFOOT");
  const [provider, setProvider] = useState<"mock" | "openai">("mock");
  const [reply, setReply] = useState("");
  const pendingEvent = useRef<string | null>(null);
  const [usage, setUsage] = useState({ requestCount: props.requestCount, reservedMicros: props.reservedMicros, budgetMicros: props.budgetMicros, alerts: props.alerts });
  const [localHandoff, setLocalHandoff] = useState({ value: props.initialHandoff ?? false, baseRevision: props.initialHandoffRevision ?? 0 });
  const sharedHandoff = useAiHandoffWorkspace()?.snapshot?.synthetic;
  const externalRevision = Math.max(props.initialHandoffRevision ?? 0, sharedHandoff?.revision ?? 0);
  const externalHandoff = sharedHandoff && sharedHandoff.revision >= (props.initialHandoffRevision ?? 0) ? sharedHandoff.handoff : props.initialHandoff ?? false;
  const handoff = externalRevision > localHandoff.baseRevision ? externalHandoff : localHandoff.value;
  const setHandoff = (value: boolean, actualRevision = externalRevision) => setLocalHandoff({ value, baseRevision: actualRevision });
  async function toggle() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await actions.saveAiButlerSetting({ setting: { ...setting, enabled: !setting.enabled }, revision });
      if (!result.success) setError(result.error);
      else { setSetting(result.setting); setRevision(result.revision); setNotice("已儲存 ✓"); }
    } catch { setError("連線中斷，請重新確認設定。"); } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setError("");
    try {
      pendingEvent.current ??= crypto.randomUUID();
      const result = await actions.testAiButler({ eventId: pendingEvent.current, scenario, module, provider });
      if (!result.success) setError(result.error);
      else {
        pendingEvent.current = null;
        setReply(result.result.text || "此事件已處理，不重複回覆。");
        if (result.result.outcome === "HANDOFF") setHandoff(true);
        setUsage({ requestCount: result.usage.requests, reservedMicros: result.usage.reservedMicros, budgetMicros: result.usage.budgetMicros, alerts: result.usage.alerts });
      }
    } catch { setError("連線中斷，重試將沿用同一測試識別，避免重複呼叫。"); } finally { setBusy(false); }
  }
  async function transfer() {
    setBusy(true); setError("");
    try {
      const result = await actions.setAiButlerTestHandoff(!handoff);
      if (!result.success) setError(result.error);
      else { setHandoff(!handoff, result.revision); setNotice(handoff ? "已恢復測試回覆" : "真人已接手，AI 暫停回覆"); }
    } catch { setError("無法確認接手狀態，請重新確認。"); } finally { setBusy(false); }
  }
  const button = "min-h-11 rounded-lg border border-earth-200 px-3 text-sm disabled:opacity-50";
  const field = "min-h-11 min-w-0 max-w-full rounded-lg border border-earth-200 bg-white px-3 text-sm";
  return <div className="min-w-0 rounded-xl border border-earth-200 bg-white px-4">
    <SettingsListRow title={brand ? "AI 智慧客服" : "AI 數位店長"} summary={`${setting.enabled ? "開啟" : "關閉"}・隔離測試`} action={expanded ? "收合" : "測試"} expanded={expanded} keepMounted
      controls={<><button type="button" className={button} disabled={busy || props.canToggle === false || (!setting.enabled && props.globalStopped === true)} onClick={toggle}>{setting.enabled ? "關閉測試" : "開啟測試"}</button><button type="button" className={button} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收合" : "測試"}</button></>}>
      <div className="min-w-0 space-y-3 pb-3 text-sm">
        <p className="text-earth-600">{brand ? "僅使用本品牌已核准知識，不讀門市營運資料。正式客服與訊息外發尚未開放。" : "僅使用合成店家資訊，不會發送顧客訊息。正式客服尚未開放。"}</p>
        <div className="flex min-w-0 flex-wrap gap-2">
          {!brand && <label className="flex min-w-0 flex-col gap-1">產業<select aria-label="產業" className={field} value={module} disabled={busy} onChange={e => setModule(e.target.value as AiModule)}><option value="STEAMFOOT">蒸足</option><option value="BEAUTY">美業</option><option value="FITNESS">運動教室</option><option value="MUSIC">音樂教室</option></select></label>}
          <label className="flex min-w-0 flex-col gap-1">測試情境<select aria-label="測試情境" className={field} value={scenario} disabled={busy} onChange={e => setScenario(e.target.value as typeof scenario)}><option value="hours">{brand ? "詢問產品價格" : "詢問營業時間"}</option><option value="unknown">{brand ? "未知問題轉真人" : "查詢未授權會員權益"}</option><option value="injection">要求忽略安全規則</option></select></label>
          <label className="flex min-w-0 flex-col gap-1">回覆方式<select aria-label="回覆方式" className={field} value={provider} disabled={busy} onChange={e => setProvider(e.target.value as typeof provider)}><option value="mock">模擬回覆（無 API 費用）</option>{props.liveTestAvailable && <option value="openai">OpenAI（計入測試額度）</option>}</select></label>
        </div>
        <div className="flex flex-wrap gap-2"><button className={`${button} bg-primary-700 text-white`} disabled={busy || !setting.enabled || props.canTest === false || props.globalStopped === true} type="button" onClick={test}>{busy ? "處理中…" : "測試回覆"}</button><button className={button} disabled={busy || props.canHandoff === false || (brand && handoff)} type="button" onClick={transfer}>{handoff ? (brand ? "請至待人工清單恢復" : "恢復 AI 測試") : "模擬真人接手"}</button></div>
        {reply && <p role="status" className="break-words rounded-lg bg-earth-50 p-3">{reply}</p>}
        <p className="break-words text-earth-600">本月 {usage.requestCount} 次・已計入及預留 US${(Number(usage.reservedMicros) / 1_000_000).toFixed(4)}／US${(usage.budgetMicros / 1_000_000).toFixed(2)}{usage.alerts.length > 0 ? `・用量已達 ${Math.max(...usage.alerts)}%` : ""}</p>
      </div>
    </SettingsListRow>
    {error && <p role="alert" className="break-words py-2 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="py-2 text-sm text-primary-700">{notice}</p>}
  </div>;
}
