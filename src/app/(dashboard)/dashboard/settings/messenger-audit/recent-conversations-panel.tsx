"use client";

import { useEffect, useState, useTransition } from "react";
import {
  endMessengerConversationAction,
  listRecentMessengerConversationsAction,
  type RecentMessengerConversation,
} from "./conversation-actions";

const activeStatuses = new Set(["IN_PROGRESS", "WAITING_INPUT"]);

function shortId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function statusLabel(status: string): string {
  return ({ IN_PROGRESS: "進行中", WAITING_INPUT: "進行中", COMPLETED: "已完成", CANCELLED: "已取消", EXPIRED: "已過期", IDLE: "閒置" })[status] ?? status;
}

export function RecentConversationsPanel({ onDiagnose }: { onDiagnose: (conversationId: string) => void }) {
  const [conversations, setConversations] = useState<RecentMessengerConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const result = await listRecentMessengerConversationsAction();
      if (result.success) {
        setConversations(result.conversations);
        setError(null);
      } else setError(result.error);
    });
  }

  useEffect(() => { refresh(); }, []);

  function endConversation(conversationId: string) {
    startTransition(async () => {
      const result = await endMessengerConversationAction({ conversationId, confirmationConversationId: conversationId });
      if (result.success) {
        setConfirmingId(null);
        onDiagnose(conversationId);
        refresh();
      } else setError(result.error);
    });
  }

  return <section className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold text-sky-950">最近 Messenger 對話</h2><p className="mt-1 text-sm text-sky-900">只顯示目前竹北店最近更新的 20 筆安全摘要。</p></div>
      <button type="button" onClick={refresh} disabled={pending} className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm text-sky-900 disabled:opacity-60">重新整理</button>
    </div>
    {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
    {conversations === null && !error ? <p className="mt-4 text-sm text-sky-900">載入中…</p> : null}
    {conversations?.length === 0 ? <p className="mt-4 text-sm text-sky-900">目前沒有 Messenger 對話紀錄。</p> : null}
    {conversations?.length ? <ul className="mt-4 space-y-3">
      {conversations.map((conversation) => <li key={conversation.id} className="rounded-lg border border-sky-200 bg-white p-4 text-sm text-sky-950">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-xs">{shortId(conversation.id)}</p><span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs">{statusLabel(conversation.status)}</span></div>
        <p className="mt-2">目前步驟：{conversation.currentStepKey ?? "—"}</p>
        <p>Flow version：v{conversation.flowVersion}{conversation.usesCurrentActiveVersion ? "（目前 active）" : "（非目前 active）"}</p>
        <p>最近互動：{new Date(conversation.updatedAt).toLocaleString("zh-TW")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => onDiagnose(conversation.id)} className="rounded-lg border border-sky-300 px-3 py-1.5 text-sm font-medium text-sky-900 disabled:opacity-60">診斷</button>
          {activeStatuses.has(conversation.status) ? <button type="button" disabled={pending} onClick={() => setConfirmingId(conversation.id)} className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">結束此對話</button> : null}
        </div>
        {confirmingId === conversation.id ? <div className="mt-3 rounded border border-rose-200 bg-rose-50 p-3"><p>確認結束這筆對話？顧客下次傳送訊息時會使用目前最新流程。</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => setConfirmingId(null)} className="rounded border border-rose-300 px-3 py-1.5">取消</button><button type="button" disabled={pending} onClick={() => endConversation(conversation.id)} className="rounded bg-rose-700 px-3 py-1.5 text-white disabled:opacity-60">確認結束</button></div></div> : null}
      </li>)}
    </ul> : null}
  </section>;
}
