"use client";

import { useState, useTransition } from "react";
import { diagnoseMessengerConversationAction, endMessengerConversationAction } from "./conversation-actions";
import { RecentConversationsPanel } from "./recent-conversations-panel";

type Conversation = {
  id: string; status: string; currentStepKey: string | null; expiresAt: string;
  cancelledAt: string | null; completedAt: string | null; createdAt: string; updatedAt: string;
  answerCount: number; leadCount: number; executionLogCount: number;
  completionDiagnostic?: {
    conversationFlowVersion: number; activeFlowVersion: number | null; usesActiveFlowVersion: boolean;
    createLeadStepKey: string | null; requestTypeFromStepKey: string | null;
    selectorCategory: "BOOKING" | "CONTACT_STORE" | "MISSING" | "OTHER";
    predictedCompletionType: "URL_BUTTON" | "TEXT_ONLY";
    completionReason: "BOOKING_SELECTOR_MATCHED" | "CONTACT_STORE_SELECTOR_MATCHED" | "SELECTOR_MISSING" | "SELECTOR_OTHER" | "CREATE_LEAD_STEP_MISSING" | "GENERIC_COMPLETION_SELECTED";
  };
};

export function ConversationResetPanel() {
  const [conversationId, setConversationId] = useState("");
  const [confirmationConversationId, setConfirmationConversationId] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function diagnose(selectedConversationId = conversationId) {
    startTransition(async () => {
      setMessage(null);
      setConversation(null);
      setConversationId(selectedConversationId);
      const result = await diagnoseMessengerConversationAction(selectedConversationId);
      if (result.success) setConversation(result.conversation);
      else setMessage(result.error);
    });
  }

  function endConversation() {
    startTransition(async () => {
      setMessage(null);
      const result = await endMessengerConversationAction({ conversationId, confirmationConversationId });
      if (result.success) {
        setConversation(result.conversation);
        setConfirmationConversationId("");
        setMessage("已安全結束此 Messenger conversation；下次訊息可重新開始流程。");
      } else setMessage(result.error);
    });
  }

  return <><RecentConversationsPanel onDiagnose={diagnose} /><section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
    <h2 className="text-base font-semibold text-rose-950">單筆 Messenger conversation 診斷與安全結束</h2>
    <p className="mt-1 text-sm text-rose-900">限定 OWNER／ADMIN、竹北店及 MESSENGER。診斷不會改變 conversation；結束只會把進行中對話標記為 CANCELLED，且全程保留稽核紀錄。</p>
    <label className="mt-4 block text-sm font-medium text-rose-950" htmlFor="conversation-id">Conversation ID</label>
    <input id="conversation-id" value={conversationId} onChange={(event) => setConversationId(event.target.value)} autoComplete="off" className="mt-1 w-full rounded border border-rose-300 bg-white px-3 py-2 font-mono text-sm" />
    <button type="button" disabled={pending || !conversationId.trim()} onClick={() => diagnose()} className="mt-3 rounded-lg bg-rose-800 px-4 py-2 text-sm font-medium text-white hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "處理中…" : "唯讀診斷"}</button>
    {conversation ? <div className="mt-4 space-y-2 rounded-lg border border-rose-200 bg-white p-4 text-sm text-rose-950">
      <p>狀態：<strong>{conversation.status}</strong></p>
      <p>目前步驟：{conversation.currentStepKey ?? "—"}</p>
      <p>建立：{new Date(conversation.createdAt).toLocaleString("zh-TW")}</p>
      <p>到期：{new Date(conversation.expiresAt).toLocaleString("zh-TW")}</p>
      <p>答案 {conversation.answerCount}、lead {conversation.leadCount}、執行紀錄 {conversation.executionLogCount}</p>
      {conversation.completionDiagnostic ? <div className="rounded border border-rose-100 bg-rose-50 p-3">
        <p className="font-medium">Completion 唯讀診斷</p>
        <p>Conversation flow version：v{conversation.completionDiagnostic.conversationFlowVersion}</p>
        <p>Active flow version：{conversation.completionDiagnostic.activeFlowVersion === null ? "—" : `v${conversation.completionDiagnostic.activeFlowVersion}`}</p>
        <p>使用 active version：{conversation.completionDiagnostic.usesActiveFlowVersion ? "是" : "否"}</p>
        <p>CREATE_LEAD step：{conversation.completionDiagnostic.createLeadStepKey ?? "—"}</p>
        <p>requestType selector：{conversation.completionDiagnostic.requestTypeFromStepKey ?? "—"}</p>
        <p>Selector category：<strong>{conversation.completionDiagnostic.selectorCategory}</strong></p>
        <p>Predicted completion：<strong>{conversation.completionDiagnostic.predictedCompletionType}</strong></p>
        <p>Completion reason：<strong>{conversation.completionDiagnostic.completionReason}</strong></p>
      </div> : null}
      <div className="border-t border-rose-100 pt-4">
        <label className="block font-medium" htmlFor="conversation-confirmation">再次輸入完全相同的 Conversation ID 以安全結束</label>
        <input id="conversation-confirmation" value={confirmationConversationId} onChange={(event) => setConfirmationConversationId(event.target.value)} autoComplete="off" className="mt-1 w-full rounded border border-rose-300 px-3 py-2 font-mono text-sm" />
        <button type="button" disabled={pending || !confirmationConversationId} onClick={endConversation} className="mt-3 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "處理中…" : "安全結束此 conversation"}</button>
      </div>
    </div> : null}
    {message ? <p className="mt-3 text-sm text-rose-800">{message}</p> : null}
  </section></>;
}
