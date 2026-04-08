"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Recommendation, RecommendationType } from "@/server/queries/ops-dashboard-v2";
import { markRecommendation } from "@/server/actions/ops-action-log";
import type { RecommendationStatus, OpsActionLogEntry } from "@/server/actions/ops-action-log";
import { OpsAssignPopover, type StaffOption } from "./ops-assign-popover";
import { OpsHistoryPopover } from "./ops-history-popover";

const typeConfig: Record<RecommendationType, { label: string; icon: string; color: string }> = {
  revenue: { label: "營收", icon: "💰", color: "text-amber-700" },
  retention: { label: "留客", icon: "🔄", color: "text-purple-700" },
  acquisition: { label: "獲客", icon: "🎯", color: "text-blue-700" },
  efficiency: { label: "效率", icon: "⚡", color: "text-green-700" },
};

const effortBadge: Record<string, string> = {
  "低": "bg-green-100 text-green-700",
  "中": "bg-yellow-100 text-yellow-700",
  "高": "bg-red-100 text-red-600",
};

const recStatusConfig: Record<string, { label: string; color: string }> = {
  adopted: { label: "已採納", color: "bg-green-100 text-green-700" },
  rejected: { label: "暫不採納", color: "bg-earth-100 text-earth-500" },
};

interface Props {
  recommendations: Recommendation[];
  actionLogs: Record<string, OpsActionLogEntry>;
  staffList: StaffOption[];
}

export function RecommendationsSection({ recommendations, actionLogs, staffList }: Props) {
  const [showAll, setShowAll] = useState(true);
  const [localLogs, setLocalLogs] = useState(actionLogs);
  const [pending, startTransition] = useTransition();

  const adoptedCount = recommendations.filter((r) => localLogs[r.id]?.status === "adopted").length;
  const rejectedCount = recommendations.filter((r) => localLogs[r.id]?.status === "rejected").length;
  const pendingCount = recommendations.filter((r) => !localLogs[r.id]).length;

  const filtered = showAll
    ? recommendations
    : recommendations.filter((r) => !localLogs[r.id]);

  function handleMark(recId: string, status: RecommendationStatus) {
    setLocalLogs((prev) => ({
      ...prev,
      [recId]: {
        ...(prev[recId] ?? {
          id: "", module: "recommendation", refId: recId, note: null,
          actorUserId: "", assigneeStaffId: null, assigneeName: null, dueDate: null,
        }),
        status,
        actorName: "你",
        updatedAt: new Date(),
      },
    }));
    startTransition(async () => {
      const res = await markRecommendation(recId, status);
      if (!res.success) {
        setLocalLogs((prev) => {
          const next = { ...prev };
          delete next[recId];
          return next;
        });
      }
    });
  }

  function handleAssignUpdate(
    recId: string,
    assigneeStaffId: string | null,
    assigneeName: string | null,
    dueDate: string | null,
  ) {
    setLocalLogs((prev) => ({
      ...prev,
      [recId]: {
        ...(prev[recId] ?? {
          id: "", module: "recommendation", refId: recId, status: "",
          note: null, actorUserId: "", actorName: "你", updatedAt: new Date(),
        }),
        assigneeStaffId,
        assigneeName,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    }));
  }

  if (recommendations.length === 0) {
    return <p className="py-4 text-center text-sm text-earth-400">目前沒有建議事項</p>;
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {adoptedCount > 0 && (
          <span className="rounded-md bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
            已採納 {adoptedCount}
          </span>
        )}
        {rejectedCount > 0 && (
          <span className="rounded-md bg-earth-100 px-2 py-0.5 text-[11px] font-medium text-earth-500">
            暫不採納 {rejectedCount}
          </span>
        )}
        {pendingCount > 0 && (
          <span className="rounded-md bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
            待決策 {pendingCount}
          </span>
        )}
        {(adoptedCount > 0 || rejectedCount > 0) && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="ml-auto text-[11px] text-earth-400 hover:text-earth-600"
          >
            {showAll ? "只看待決策" : "顯示全部"}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((rec) => {
          const cfg = typeConfig[rec.type];
          const log = localLogs[rec.id];
          const isHandled = !!log?.status;

          return (
            <div
              key={rec.id}
              className={`flex flex-col rounded-xl border border-earth-100 bg-earth-50/50 p-4 transition-all ${
                isHandled ? "opacity-70" : "hover:bg-earth-50"
              }`}
            >
              {/* Header */}
              <div className="flex items-start gap-2">
                <span className="text-lg">{cfg.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-earth-800">{rec.title}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${cfg.color} bg-earth-100`}>
                      {cfg.label}
                    </span>
                    {log?.status && (
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${recStatusConfig[log.status]?.color ?? ""}`}>
                        {recStatusConfig[log.status]?.label ?? log.status}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-earth-500">{rec.description}</p>
                </div>
              </div>

              {/* Impact / effort */}
              <div className="mt-3 flex items-center gap-2 border-t border-earth-100 pt-2">
                <span className="text-xs font-medium text-primary-700">{rec.impact}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${effortBadge[rec.effort]}`}>
                  難度{rec.effort}
                </span>
                {rec.actionHref && rec.actionLabel && (
                  <Link
                    href={rec.actionHref}
                    className="rounded-lg bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700 hover:bg-primary-100"
                  >
                    {rec.actionLabel} →
                  </Link>
                )}
              </div>

              {/* Toolbar: adopt/reject + assign + history */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-earth-100 pt-2">
                <button
                  disabled={pending}
                  onClick={() => handleMark(rec.id, "adopted")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    log?.status === "adopted"
                      ? "bg-green-200 text-green-800 ring-1 ring-green-300"
                      : "bg-green-100 text-green-700 hover:bg-green-200"
                  }`}
                >
                  ✓ 採納
                </button>
                <button
                  disabled={pending}
                  onClick={() => handleMark(rec.id, "rejected")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    log?.status === "rejected"
                      ? "bg-earth-200 text-earth-600 ring-1 ring-earth-300"
                      : "bg-earth-100 text-earth-500 hover:bg-earth-200"
                  }`}
                >
                  ✗ 暫不
                </button>

                <span className="mx-0.5 h-3 w-px bg-earth-200" />

                {/* Assign */}
                <OpsAssignPopover
                  module="recommendation"
                  refId={rec.id}
                  staffList={staffList}
                  currentAssigneeId={log?.assigneeStaffId ?? null}
                  currentAssigneeName={log?.assigneeName ?? null}
                  currentDueDate={log?.dueDate ? (typeof log.dueDate === "string" ? log.dueDate : log.dueDate.toISOString?.() ?? String(log.dueDate)) : null}
                  onUpdate={(sid, sn, dd) => handleAssignUpdate(rec.id, sid, sn, dd)}
                />

                {/* History */}
                <div className="ml-auto flex items-center gap-1.5">
                  {isHandled && log.actorName && (
                    <span className="text-[10px] text-earth-400">
                      {log.actorName}
                    </span>
                  )}
                  <OpsHistoryPopover module="recommendation" refId={rec.id} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
