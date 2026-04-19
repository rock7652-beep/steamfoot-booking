"use client";

import { useState, useTransition } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { EmptyState } from "@/components/ui/empty-state";
import type { CustomerAction, ActionType } from "@/server/queries/ops-dashboard-v2";
import {
  markCustomerAction,
  updateCustomerActionNote,
} from "@/server/actions/ops-action-log";
import type {
  CustomerActionStatus,
  OpsActionLogEntry,
} from "@/server/actions/ops-action-log";
import { sendOpsLineMessage } from "@/server/actions/ops-line";
import { OpsAssignPopover, type StaffOption } from "./ops-assign-popover";
import { OpsHistoryPopover } from "./ops-history-popover";

const typeConfig: Record<ActionType, { label: string; color: string; bg: string }> = {
  call_back: { label: "流失挽回", color: "text-red-700", bg: "bg-red-100" },
  renew_plan: { label: "續購提醒", color: "text-amber-700", bg: "bg-amber-100" },
  first_visit: { label: "新客跟進", color: "text-blue-700", bg: "bg-blue-100" },
  upsell: { label: "升級推薦", color: "text-purple-700", bg: "bg-purple-100" },
  birthday: { label: "生日關懷", color: "text-pink-700", bg: "bg-pink-100" },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  contacted: { label: "已聯絡", color: "bg-blue-100 text-blue-700" },
  tracking: { label: "待追蹤", color: "bg-amber-100 text-amber-700" },
  closed: { label: "已成交", color: "bg-green-100 text-green-700" },
  skipped: { label: "不適用", color: "bg-earth-100 text-earth-500" },
};

const ALL_TYPES: ActionType[] = ["call_back", "renew_plan", "first_visit", "upsell", "birthday"];
const ALL_STATUSES: CustomerActionStatus[] = ["contacted", "tracking", "closed", "skipped"];

interface Props {
  actions: CustomerAction[];
  actionLogs: Record<string, OpsActionLogEntry>;
  staffList: StaffOption[];
}

export function CustomerActionsSection({ actions, actionLogs, staffList }: Props) {
  const [typeFilter, setTypeFilter] = useState<ActionType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [localLogs, setLocalLogs] = useState(actionLogs);
  const [noteEditing, setNoteEditing] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [lineMsg, setLineMsg] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const filtered = actions.filter((a) => {
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    const log = localLogs[a.id];
    if (statusFilter === "pending") return !log;
    if (statusFilter === "all") return true;
    return log?.status === statusFilter;
  });

  const countByType = actions.reduce(
    (acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; },
    {} as Record<string, number>,
  );
  const pendingCount = actions.filter((a) => !localLogs[a.id]).length;

  function handleMark(actionId: string, status: CustomerActionStatus) {
    setLocalLogs((prev) => ({
      ...prev,
      [actionId]: {
        ...(prev[actionId] ?? {
          id: "", module: "customer_action", refId: actionId,
          note: null, actorUserId: "", assigneeStaffId: null, assigneeName: null, dueDate: null,
        }),
        status,
        actorName: "你",
        updatedAt: new Date(),
      },
    }));
    startTransition(async () => {
      try {
        const res = await markCustomerAction(actionId, status);
        if (!res.success) {
          setLocalLogs((prev) => {
            const next = { ...prev };
            delete next[actionId];
            return next;
          });
        }
      } catch {
        setLocalLogs((prev) => {
          const next = { ...prev };
          delete next[actionId];
          return next;
        });
      }
    });
  }

  function handleSaveNote(actionId: string) {
    const text = noteText.trim();
    if (!text) return;
    setLocalLogs((prev) => ({
      ...prev,
      [actionId]: {
        ...(prev[actionId] ?? {
          id: "", module: "customer_action", refId: actionId, status: "tracking",
          actorUserId: "", actorName: "你", assigneeStaffId: null, assigneeName: null, dueDate: null,
          updatedAt: new Date(),
        }),
        note: text,
        updatedAt: new Date(),
      },
    }));
    setNoteEditing(null);
    setNoteText("");
    startTransition(async () => {
      try {
        await updateCustomerActionNote(actionId, text);
      } catch {
        // 備註儲存失敗 — optimistic UI 已顯示
      }
    });
  }

  function handleAssignUpdate(
    actionId: string,
    assigneeStaffId: string | null,
    assigneeName: string | null,
    dueDate: string | null,
  ) {
    setLocalLogs((prev) => ({
      ...prev,
      [actionId]: {
        ...(prev[actionId] ?? {
          id: "", module: "customer_action", refId: actionId, status: "tracking",
          note: null, actorUserId: "", actorName: "你", updatedAt: new Date(),
        }),
        assigneeStaffId,
        assigneeName,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    }));
  }

  if (actions.length === 0) {
    return <EmptyState icon="empty" title="目前沒有待處理項目" description="保持與顧客的互動，新的經營項目會在此出現" />;
  }

  return (
    <div>
      {/* Status filter */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <button
          onClick={() => setStatusFilter("pending")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
            statusFilter === "pending" ? "bg-primary-600 text-white" : "bg-earth-100 text-earth-500 hover:text-earth-700"
          }`}
        >
          待處理 ({pendingCount})
        </button>
        <button
          onClick={() => setStatusFilter("all")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
            statusFilter === "all" ? "bg-primary-600 text-white" : "bg-earth-100 text-earth-500 hover:text-earth-700"
          }`}
        >
          全部 ({actions.length})
        </button>
        {ALL_STATUSES.map((s) => {
          const cfg = statusConfig[s];
          const count = actions.filter((a) => localLogs[a.id]?.status === s).length;
          if (count === 0) return null;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === s ? "bg-primary-600 text-white" : `${cfg.color} hover:opacity-80`
              }`}
            >
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Type filter */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => setTypeFilter("all")}
          className={`rounded-lg px-2 py-0.5 text-[11px] font-medium transition-colors ${
            typeFilter === "all" ? "bg-earth-700 text-white" : "bg-earth-50 text-earth-400 hover:text-earth-600"
          }`}
        >
          全類型
        </button>
        {ALL_TYPES.map((t) => {
          const cfg = typeConfig[t];
          const count = countByType[t] || 0;
          if (count === 0) return null;
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-lg px-2 py-0.5 text-[11px] font-medium transition-colors ${
                typeFilter === t ? "bg-earth-700 text-white" : `${cfg.bg} ${cfg.color} hover:opacity-80`
              }`}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-earth-400">此篩選條件下無項目</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((action) => {
            const cfg = typeConfig[action.type];
            const log = localLogs[action.id];
            const isHandled = !!log?.status;

            return (
              <div
                key={action.id}
                className={`rounded-xl border border-earth-100 bg-earth-50/50 px-3 py-2.5 transition-all ${
                  isHandled ? "opacity-70" : "hover:bg-earth-50"
                }`}
              >
                {/* Main row */}
                <div className="flex items-center gap-3">
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/customers/${action.customerId}`}
                        className="text-sm font-medium text-earth-800 hover:text-primary-600"
                      >
                        {action.customerName}
                      </Link>
                      <span className="text-xs text-earth-400">{action.daysInfo}</span>
                      {log?.status && (
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${statusConfig[log.status]?.color ?? "bg-earth-100 text-earth-500"}`}>
                          {statusConfig[log.status]?.label ?? log.status}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-earth-500">
                      {action.reason} · {action.suggestedAction}
                    </p>
                    {log?.note && (
                      <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                        📝 {log.note}
                        <span className="ml-2 text-[10px] text-earth-400">
                          — {log.actorName} · {new Date(log.updatedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                        </span>
                      </p>
                    )}
                  </div>
                  <a
                    href={`tel:${action.phone}`}
                    className="shrink-0 rounded-lg bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                  >
                    📞 {action.phone}
                  </a>
                </div>

                {/* Toolbar */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-earth-100/50 pt-2">
                  {/* Status buttons */}
                  {ALL_STATUSES.map((s) => {
                    const sc = statusConfig[s];
                    const isActive = log?.status === s;
                    return (
                      <button
                        key={s}
                        disabled={pending}
                        onClick={() => handleMark(action.id, s)}
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                          isActive ? `${sc.color} ring-1 ring-current` : `${sc.color} opacity-60 hover:opacity-100`
                        }`}
                      >
                        {sc.label}
                      </button>
                    );
                  })}

                  <span className="mx-0.5 h-3 w-px bg-earth-200" />

                  {/* Assign */}
                  <OpsAssignPopover
                    module="customer_action"
                    refId={action.id}
                    staffList={staffList}
                    currentAssigneeId={log?.assigneeStaffId ?? null}
                    currentAssigneeName={log?.assigneeName ?? null}
                    currentDueDate={log?.dueDate ? (typeof log.dueDate === "string" ? log.dueDate : log.dueDate.toISOString?.() ?? String(log.dueDate)) : null}
                    onUpdate={(sid, sn, dd) => handleAssignUpdate(action.id, sid, sn, dd)}
                  />

                  <span className="mx-0.5 h-3 w-px bg-earth-200" />

                  {/* LINE send */}
                  {action.lineLinked ? (
                    <button
                      disabled={pending}
                      className={`rounded-lg px-1.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        lineMsg[action.id] === "sent"
                          ? "bg-green-200 text-green-800"
                          : lineMsg[action.id] === "fail"
                            ? "bg-red-100 text-red-600"
                            : "bg-green-100 text-green-700 hover:bg-green-200"
                      }`}
                      title="發送 LINE 訊息"
                      onClick={() => {
                        const msg = `${action.customerName} 您好！${action.suggestedAction}`;
                        startTransition(async () => {
                          const res = await sendOpsLineMessage(action.customerId, msg);
                          setLineMsg((prev) => ({ ...prev, [action.id]: res.success ? "sent" : "fail" }));
                          setTimeout(() => setLineMsg((prev) => { const n = { ...prev }; delete n[action.id]; return n; }), 3000);
                        });
                      }}
                    >
                      {lineMsg[action.id] === "sent" ? "✓ 已發送" : lineMsg[action.id] === "fail" ? "✗ 失敗" : "💬 LINE"}
                    </button>
                  ) : (
                    <span
                      className="rounded-lg bg-earth-50 px-1.5 py-0.5 text-[11px] text-earth-300"
                      title="顧客尚未綁定 LINE"
                    >
                      💬 未綁定
                    </span>
                  )}
                  {/* SMS placeholder */}
                  <button
                    className="rounded-lg bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 opacity-40"
                    title="簡訊通知（即將支援）"
                    disabled
                  >
                    📱 簡訊
                  </button>

                  {/* Note + History */}
                  <button
                    onClick={() => {
                      setNoteEditing(noteEditing === action.id ? null : action.id);
                      setNoteText(log?.note ?? "");
                    }}
                    className="rounded-lg bg-earth-50 px-1.5 py-0.5 text-[11px] font-medium text-earth-500 hover:bg-earth-100"
                  >
                    📝 備註
                  </button>
                  <div className="ml-auto">
                    <OpsHistoryPopover module="customer_action" refId={action.id} />
                  </div>
                </div>

                {/* Note input */}
                {noteEditing === action.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveNote(action.id); }}
                      placeholder="輸入追蹤備註..."
                      className="min-w-0 flex-1 rounded-lg border border-earth-200 px-2.5 py-1 text-xs focus:border-primary-400 focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveNote(action.id)}
                      disabled={!noteText.trim() || pending}
                      className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      儲存
                    </button>
                    <button
                      onClick={() => { setNoteEditing(null); setNoteText(""); }}
                      className="rounded-lg bg-earth-100 px-2 py-1 text-xs text-earth-500 hover:bg-earth-200"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
