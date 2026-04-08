"use client";

import { useState, useTransition } from "react";
import {
  assignOpsAction,
  setOpsActionDueDate,
} from "@/server/actions/ops-action-log";
import type { OpsModule } from "@/server/actions/ops-action-log";

export interface StaffOption {
  id: string;
  displayName: string;
  colorCode: string;
}

interface Props {
  module: OpsModule;
  refId: string;
  staffList: StaffOption[];
  currentAssigneeId: string | null;
  currentAssigneeName: string | null;
  currentDueDate: string | null; // ISO date string or null
  onUpdate: (assigneeStaffId: string | null, assigneeName: string | null, dueDate: string | null) => void;
}

export function OpsAssignPopover({
  module,
  refId,
  staffList,
  currentAssigneeId,
  currentAssigneeName,
  currentDueDate,
  onUpdate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleAssign(staffId: string | null) {
    const staff = staffList.find((s) => s.id === staffId);
    onUpdate(staffId, staff?.displayName ?? null, currentDueDate);
    startTransition(async () => {
      const res = await assignOpsAction(module, refId, staffId);
      if (!res.success) {
        onUpdate(currentAssigneeId, currentAssigneeName, currentDueDate);
      }
    });
    setOpen(false);
  }

  function handleDueDate(dateStr: string) {
    const val = dateStr || null;
    onUpdate(currentAssigneeId, currentAssigneeName, val);
    startTransition(async () => {
      const res = await setOpsActionDueDate(module, refId, val);
      if (!res.success) {
        onUpdate(currentAssigneeId, currentAssigneeName, currentDueDate);
      }
    });
  }

  // Due date status
  const isOverdue =
    currentDueDate && new Date(currentDueDate) < new Date(new Date().toISOString().slice(0, 10));

  return (
    <div className="relative inline-flex items-center gap-1">
      {/* Assignee display / button */}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
          currentAssigneeId
            ? "bg-primary-50 text-primary-700 hover:bg-primary-100"
            : "bg-earth-50 text-earth-400 hover:bg-earth-100 hover:text-earth-600"
        }`}
        title={currentAssigneeName ? `負責人: ${currentAssigneeName}` : "指派負責人"}
      >
        {currentAssigneeId ? (
          <>
            <span className="h-2 w-2 rounded-full" style={{
              backgroundColor: staffList.find((s) => s.id === currentAssigneeId)?.colorCode ?? "#6366f1",
            }} />
            {currentAssigneeName}
          </>
        ) : (
          "👤 指派"
        )}
      </button>

      {/* Due date badge */}
      {currentDueDate && (
        <span className={`rounded-md px-1 py-0.5 text-[10px] font-medium ${
          isOverdue ? "bg-red-100 text-red-600" : "bg-earth-100 text-earth-500"
        }`}>
          {isOverdue ? "⚠ 逾期 " : ""}
          {new Date(currentDueDate).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" })}
        </span>
      )}

      {/* Popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 w-56 rounded-xl border border-earth-200 bg-white p-3 shadow-lg">
            <div className="mb-2 text-xs font-semibold text-earth-700">指派負責人</div>
            <div className="max-h-36 space-y-0.5 overflow-y-auto">
              {/* Unassign option */}
              <button
                onClick={() => handleAssign(null)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-earth-50 ${
                  !currentAssigneeId ? "bg-earth-50 font-medium" : ""
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-earth-200" />
                不指派
              </button>
              {staffList.map((staff) => (
                <button
                  key={staff.id}
                  onClick={() => handleAssign(staff.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-earth-50 ${
                    currentAssigneeId === staff.id ? "bg-primary-50 font-medium text-primary-700" : ""
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: staff.colorCode }}
                  />
                  {staff.displayName}
                </button>
              ))}
            </div>

            {/* Due date */}
            <div className="mt-3 border-t border-earth-100 pt-2">
              <div className="mb-1 text-xs font-semibold text-earth-700">到期日</div>
              <input
                type="date"
                value={currentDueDate ?? ""}
                onChange={(e) => handleDueDate(e.target.value)}
                className="w-full rounded-lg border border-earth-200 px-2 py-1 text-xs focus:border-primary-400 focus:outline-none"
              />
              {currentDueDate && (
                <button
                  onClick={() => handleDueDate("")}
                  className="mt-1 text-[11px] text-earth-400 hover:text-red-500"
                >
                  清除到期日
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
