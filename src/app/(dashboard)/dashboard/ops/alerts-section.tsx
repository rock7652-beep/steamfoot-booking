"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { OpsAlert, AlertLevel } from "@/server/queries/ops-dashboard-v2";
import { markAlert } from "@/server/actions/ops-action-log";
import type { AlertStatus, OpsActionLogEntry } from "@/server/actions/ops-action-log";
import { OpsAssignPopover, type StaffOption } from "./ops-assign-popover";
import { OpsHistoryPopover } from "./ops-history-popover";

const levelStyles: Record<AlertLevel, { bg: string; border: string; icon: string; text: string }> = {
  critical: { bg: "bg-red-50", border: "border-red-200", icon: "🔴", text: "text-red-700" },
  warning: { bg: "bg-amber-50", border: "border-amber-200", icon: "🟡", text: "text-amber-700" },
  info: { bg: "bg-blue-50", border: "border-blue-200", icon: "🔵", text: "text-blue-700" },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  resolved: { label: "已處理", color: "bg-green-100 text-green-700" },
  ignored: { label: "已忽略", color: "bg-earth-100 text-earth-500" },
  snoozed: { label: "稍後提醒", color: "bg-purple-100 text-purple-700" },
};

interface Props {
  alerts: OpsAlert[];
  actionLogs: Record<string, OpsActionLogEntry>;
  staffList: StaffOption[];
}

export function AlertsSection({ alerts, actionLogs, staffList }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [localLogs, setLocalLogs] = useState(actionLogs);
  const [pending, startTransition] = useTransition();

  const visibleAlerts = showAll
    ? alerts
    : alerts.filter((a) => !localLogs[a.id]);

  const handledCount = alerts.filter((a) => localLogs[a.id]).length;

  function handleMark(alertId: string, status: AlertStatus) {
    setLocalLogs((prev) => ({
      ...prev,
      [alertId]: {
        ...(prev[alertId] ?? {
          id: "", module: "alert", refId: alertId, note: null,
          actorUserId: "", assigneeStaffId: null, assigneeName: null, dueDate: null,
        }),
        status,
        actorName: "你",
        updatedAt: new Date(),
      },
    }));
    startTransition(async () => {
      try {
        const res = await markAlert(alertId, status);
        if (!res.success) {
          setLocalLogs((prev) => {
            const next = { ...prev };
            delete next[alertId];
            return next;
          });
        }
      } catch {
        setLocalLogs((prev) => {
          const next = { ...prev };
          delete next[alertId];
          return next;
        });
      }
    });
  }

  function handleAssignUpdate(
    alertId: string,
    assigneeStaffId: string | null,
    assigneeName: string | null,
    dueDate: string | null,
  ) {
    setLocalLogs((prev) => ({
      ...prev,
      [alertId]: {
        ...(prev[alertId] ?? {
          id: "", module: "alert", refId: alertId, status: "snoozed", note: null,
          actorUserId: "", actorName: "你", updatedAt: new Date(),
        }),
        assigneeStaffId,
        assigneeName,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    }));
  }

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
        <span>✅</span>
        <span>目前沒有異常警報，一切運作正常！</span>
      </div>
    );
  }

  return (
    <div>
      {handledCount > 0 && (
        <div className="mb-2 flex items-center gap-2">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="rounded-lg bg-earth-100 px-2.5 py-1 text-xs font-medium text-earth-600 hover:bg-earth-200"
          >
            {showAll ? "只看未處理" : `顯示全部（含 ${handledCount} 已處理）`}
          </button>
        </div>
      )}

      {visibleAlerts.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
          <span>✅</span>
          <span>所有警報均已處理！</span>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleAlerts.map((alert) => {
            const style = levelStyles[alert.level];
            const log = localLogs[alert.id];
            const isHandled = !!log?.status && log.status !== "snoozed";

            return (
              <div
                key={alert.id}
                className={`rounded-xl border px-4 py-3 transition-opacity ${
                  isHandled ? "opacity-60" : ""
                } ${style.bg} ${style.border}`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-sm">{style.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-semibold ${style.text}`}>
                        {alert.title}
                      </span>
                      {alert.metric && (
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${style.text} ${style.bg}`}>
                          {alert.metric}
                        </span>
                      )}
                      {log?.status && (
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${statusLabels[log.status]?.color ?? "bg-earth-100 text-earth-500"}`}>
                          {statusLabels[log.status]?.label ?? log.status}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-earth-600">{alert.description}</p>
                    {log?.actorName && log.status && (
                      <p className="mt-1 text-[10px] text-earth-400">
                        {log.actorName} · {new Date(log.updatedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {alert.actionHref && alert.actionLabel && (
                      <Link
                        href={alert.actionHref}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium ${style.text} hover:underline`}
                      >
                        {alert.actionLabel} →
                      </Link>
                    )}
                  </div>
                </div>

                {/* Toolbar: status + assign + history */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-earth-100/50 pt-2">
                  {/* Status buttons */}
                  {(["resolved", "ignored", "snoozed"] as AlertStatus[]).map((s) => {
                    const sl = statusLabels[s];
                    const isActive = log?.status === s;
                    return (
                      <button
                        key={s}
                        disabled={pending}
                        onClick={() => handleMark(alert.id, s)}
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                          isActive ? `${sl.color} ring-1 ring-current` : `${sl.color} opacity-60 hover:opacity-100`
                        }`}
                      >
                        {sl.label}
                      </button>
                    );
                  })}

                  <span className="mx-1 h-3 w-px bg-earth-200" />

                  {/* Assign */}
                  <OpsAssignPopover
                    module="alert"
                    refId={alert.id}
                    staffList={staffList}
                    currentAssigneeId={log?.assigneeStaffId ?? null}
                    currentAssigneeName={log?.assigneeName ?? null}
                    currentDueDate={log?.dueDate ? log.dueDate.toISOString?.() ?? String(log.dueDate) : null}
                    onUpdate={(sid, sn, dd) => handleAssignUpdate(alert.id, sid, sn, dd)}
                  />

                  {/* History */}
                  <div className="ml-auto">
                    <OpsHistoryPopover module="alert" refId={alert.id} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
