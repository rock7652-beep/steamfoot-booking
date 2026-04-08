"use client";

import { useState, useTransition } from "react";
import { getOpsActionHistory } from "@/server/actions/ops-action-log";
import type { OpsModule, OpsHistoryEntry } from "@/server/actions/ops-action-log";

const actionLabels: Record<string, string> = {
  status_change: "狀態變更",
  assign: "指派",
  due_date: "到期日",
  note: "備註",
};

interface Props {
  module: OpsModule;
  refId: string;
}

export function OpsHistoryPopover({ module, refId }: Props) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<OpsHistoryEntry[] | null>(null);
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!history) {
      startTransition(async () => {
        const data = await getOpsActionHistory(module, refId);
        setHistory(data);
      });
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="rounded-lg bg-earth-50 px-1.5 py-0.5 text-[11px] font-medium text-earth-400 hover:bg-earth-100 hover:text-earth-600"
        title="操作歷史"
      >
        📋
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          {/* Popover */}
          <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-earth-200 bg-white p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-earth-700">操作歷史</span>
              <button
                onClick={() => setOpen(false)}
                className="text-xs text-earth-400 hover:text-earth-600"
              >
                ✕
              </button>
            </div>
            {pending ? (
              <p className="py-3 text-center text-xs text-earth-400">載入中...</p>
            ) : !history || history.length === 0 ? (
              <p className="py-3 text-center text-xs text-earth-400">尚無操作紀錄</p>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="border-b border-earth-50 pb-2 last:border-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-earth-100 px-1 py-0.5 text-[10px] font-medium text-earth-600">
                        {actionLabels[h.action] ?? h.action}
                      </span>
                      <span className="text-[10px] text-earth-400">{h.actorName}</span>
                      <span className="ml-auto text-[10px] text-earth-300">
                        {new Date(h.createdAt).toLocaleString("zh-TW", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {h.action === "status_change" && (
                      <p className="mt-0.5 text-[11px] text-earth-500">
                        {h.oldValue ?? "(無)"} → <b className="text-earth-700">{h.newValue}</b>
                      </p>
                    )}
                    {h.action === "assign" && (
                      <p className="mt-0.5 text-[11px] text-earth-500">
                        {h.oldValue ?? "(未指派)"} → <b className="text-earth-700">{h.newValue ?? "(取消指派)"}</b>
                      </p>
                    )}
                    {h.action === "due_date" && (
                      <p className="mt-0.5 text-[11px] text-earth-500">
                        到期日: {h.oldValue ?? "(無)"} → <b className="text-earth-700">{h.newValue ?? "(清除)"}</b>
                      </p>
                    )}
                    {h.action === "note" && (
                      <p className="mt-0.5 text-[11px] text-earth-500">
                        備註: &ldquo;{h.newValue}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
