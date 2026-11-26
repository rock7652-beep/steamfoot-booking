"use client";

import { useEffect, useRef, useState } from "react";
import { SettingsListRow } from "@/components/settings/settings-workspace";
import { aiKnowledgeDraftSchema, type AiKnowledgeDocument } from "@/server/ai/knowledge-document";
import { changeAiButlerKnowledge, readAiButlerKnowledge, testAiButlerPublished, setAiButlerTestHandoff } from "./ai-actions";

const field = "min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white p-3 text-sm";
const button = "min-h-11 rounded-lg border border-earth-200 px-3 text-sm disabled:opacity-50";
export function AiKnowledgePanel({ initial, liveTestAvailable }: { initial: AiKnowledgeDocument; liveTestAvailable: boolean }) {
  const [document, setDocument] = useState(initial);
  const [draft, setDraft] = useState(initial.draft);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("請介紹店家");
  const [provider, setProvider] = useState<"mock" | "openai">("mock");
  const [reply, setReply] = useState("");
  const event = useRef<{ id: string; question: string; provider: typeof provider } | null>(null);
  function edit(value: typeof draft) { setDraft(value); setNotice(""); }
  const dirty = JSON.stringify(draft) !== JSON.stringify(document.draft);
  useEffect(() => {
    if (!dirty && !busy) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const navigate = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest("a[href]");
      if (link && !window.confirm(busy ? "操作尚未確認，確定離開？" : "尚有未儲存草稿，確定離開並捨棄？")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    documentGlobal().addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); documentGlobal().removeEventListener("click", navigate, true); };
  }, [dirty, busy]);
  async function change(command: "save" | "publish" | "withdraw") {
    if (command === "withdraw" && !window.confirm("撤下已發布內容？未來測試將轉真人，草稿仍會保留。")) return;
    if (command === "publish" && !window.confirm("發布已儲存的草稿？僅供隔離測試，不會啟用顧客客服。")) return;
    if (command === "save") {
      const parsed = aiKnowledgeDraftSchema.safeParse(draft);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "請核對草稿內容。"); return; }
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await changeAiButlerKnowledge({ command, revision: document.revision, ...(command === "save" ? { draft } : {}) });
      if (!result.success) setError(result.error);
      else { setDocument(result.document); setDraft(result.document.draft); setNotice(command === "save" ? "草稿已儲存，已發布內容不受影響。" : command === "publish" ? "已發布，僅供隔離測試引用。" : "已撤下，草稿仍保留。"); }
    } catch { setError("連線中斷，結果尚未確認。請重新載入最新版本核對；本機草稿仍保留。"); }
    finally { setBusy(false); }
  }
  async function reload() {
    if (dirty && !window.confirm("重新載入會捨棄本機未儲存草稿，確定繼續？")) return;
    setBusy(true); setError(""); setNotice("");
    try { const result = await readAiButlerKnowledge(); if (result.success) { setDocument(result.document); setDraft(result.document.draft); setNotice("已載入最新版本。"); } else setError(result.error); }
    catch { setError("無法載入最新版本，草稿仍保留。"); } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setError(""); setReply("");
    try {
      if (event.current && (event.current.question !== question || event.current.provider !== provider)) { setError("上次測試結果未確認，請先用原問題及回覆方式重試。"); return; }
      event.current ??= { id: crypto.randomUUID(), question, provider };
      const result = await testAiButlerPublished({ eventId: event.current.id, question, provider });
      if (result.success) { event.current = null; setReply(result.result.text || "此測試已處理，不重複呼叫。"); } else setError(result.error);
    } catch { setError("測試結果未確認，請沿用原問題重試，避免重複呼叫。"); } finally { setBusy(false); }
  }
  async function resume() {
    setBusy(true); setError(""); setNotice("");
    try { const result = await setAiButlerTestHandoff(false); if (result.success) setNotice("已恢復測試對話；全域停止與店家開關仍有效。"); else setError(result.error); }
    catch { setError("無法確認恢復結果。"); } finally { setBusy(false); }
  }
  return <section className="min-w-0 rounded-xl border border-earth-200 bg-white px-4" aria-label="店家知識管理">
    <SettingsListRow title="店家知識" summary={`${document.published ? `已發布 v${document.publishedVersion}` : "未發布"}・草稿版本 ${document.revision}${dirty ? "・尚未儲存" : ""}`} action="管理" expanded={expanded} keepMounted controls={<button type="button" className={button} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收合知識" : "管理知識"}</button>}>
      <div className="min-w-0 space-y-4 pb-4 text-sm">
        <p className="text-earth-600">草稿需儲存再發布。只管理本合成測試店；正式客服與訊息外發尚未開放。</p>
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <label className="block space-y-1"><span>店家介紹</span><textarea aria-label="店家介紹" className={field} rows={3} maxLength={600} value={draft.introduction} onChange={e => edit({ ...draft, introduction: e.target.value })}/></label>
          <div className="space-y-3"><p className="font-medium">常見問題（最多 6 題）</p>{draft.faqs.map((faq, index) => <div key={index} className="min-w-0 space-y-2 rounded-lg border p-3">
            <label className="block">問題 {index + 1}<input className={field} aria-label={`FAQ 問題 ${index + 1}`} maxLength={120} value={faq.question} onChange={e => edit({ ...draft, faqs: draft.faqs.map((f,i) => i === index ? { ...f, question: e.target.value } : f) })}/></label>
            <label className="block">回答 {index + 1}<textarea className={field} aria-label={`FAQ 回答 ${index + 1}`} rows={2} maxLength={600} value={faq.answer} onChange={e => edit({ ...draft, faqs: draft.faqs.map((f,i) => i === index ? { ...f, answer: e.target.value } : f) })}/></label>
            <button type="button" className={button} onClick={() => edit({ ...draft, faqs: draft.faqs.filter((_,i) => i !== index) })}>刪除第 {index + 1} 題</button>
          </div>)}<button type="button" className={button} disabled={draft.faqs.length >= 6} onClick={() => edit({ ...draft, faqs: [...draft.faqs, { question: "", answer: "" }] })}>新增 FAQ</button></div>
          <label className="block space-y-1"><span>禁止回答事項（每行一個關鍵詞，最多 20 個）</span><textarea className={field} aria-label="禁止回答事項" rows={3} value={draft.prohibitedTerms.join("\n")} onChange={e => edit({ ...draft, prohibitedTerms: e.target.value.split("\n") })}/></label>
          <p className="text-earth-600">問題包含關鍵詞即轉真人；採全半形、大小寫及空白正規化比對，不推測同義詞。個資、退款及即時預約仍受既有安全規則限制。</p>
          <div className="space-y-2"><p className="font-medium">引用既有設定</p>{([ ["hours","今天的營業時間（含特殊營業日）"], ["services","公開服務／課程名稱"], ["prices","可公開購買方案的定價"] ] as const).map(([key,label]) => <label key={key} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.references[key]} onChange={e => edit({ ...draft, references: { ...draft.references, [key]: e.target.checked } })}/>{label}</label>)}<p className="text-earth-600">每次測試讀取原設定，不複製價格。來源未設定、超過 6 項或內容上限時無法發布／回覆，請洽原設定管理者。方案定價不包含優惠及個人權益。</p></div>
        </fieldset>
        <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || !dirty} onClick={() => change("save")}>儲存知識草稿</button><button type="button" className={`${button} bg-primary-700 text-white`} disabled={busy || dirty || document.revision === 0} onClick={() => change("publish")}>發布知識</button><button type="button" className={button} disabled={busy || !document.published || dirty} onClick={() => change("withdraw")}>撤下知識</button><button type="button" className={button} disabled={busy} onClick={reload}>重新載入最新版本</button></div>
        {error && <p role="alert" className="break-words text-red-700">{error}</p>}{notice && <p role="status" className="break-words text-primary-700">{notice}</p>}
        <div className="min-w-0 space-y-2 border-t pt-3"><p className="font-medium">測試已發布知識</p><p className="text-earth-600">僅輸入合成問題，勿貼顧客資料。模擬回覆只比對完整問題；OpenAI 會判讀語意並計入額度。全域停止時不呼叫 API。</p>
          <label className="block">測試問題<input aria-label="已發布知識測試問題" className={field} maxLength={400} disabled={busy} value={question} onChange={e => setQuestion(e.target.value)}/></label>
          <label className="block">知識測試方式<select aria-label="知識測試方式" className={field} disabled={busy} value={provider} onChange={e => setProvider(e.target.value as typeof provider)}><option value="mock">模擬回覆（無 API 費用）</option>{liveTestAvailable && <option value="openai">OpenAI（計入測試額度）</option>}</select></label>
          <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || !question.trim()} onClick={test}>測試已發布知識</button><button type="button" className={button} disabled={busy} onClick={resume}>恢復知識測試對話</button></div>
          {reply && <p role="status" className="whitespace-pre-wrap break-words rounded-lg bg-earth-50 p-3">{reply}</p>}
        </div>
      </div>
    </SettingsListRow>
  </section>;
}
// Avoid shadowing the browser document with the server-confirmed knowledge document.
function documentGlobal() { return window.document; }
