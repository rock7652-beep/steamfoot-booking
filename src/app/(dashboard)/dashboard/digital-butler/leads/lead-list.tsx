"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DigitalButlerLeadStatus } from "@prisma/client";
import { updateDigitalButlerLeadAction } from "@/server/actions/digital-butler-leads";

const LABELS: Record<DigitalButlerLeadStatus, string> = {
  NEW: "新名單",
  CONTACTING: "聯絡中",
  QUOTED: "已報價",
  WON: "已成交",
  LOST: "未成交",
  PAUSED: "暫緩",
};
const STATUS_OPTIONS = Object.keys(LABELS) as DigitalButlerLeadStatus[];

type Lead = {
  id: string;
  status: DigitalButlerLeadStatus;
  phone: string | null;
  submittedAnswers: unknown;
  internalNote: string | null;
  lastContactedAt: Date | null;
  createdAt: Date;
  flow: { name: string };
  assignedStaff: { id: string; displayName: string } | null;
  activities: Array<{
    id: string;
    toStatus: DigitalButlerLeadStatus;
    note: string | null;
    contactedAt: Date | null;
    createdAt: Date;
    createdBy: { name: string };
  }>;
};

function answerSummary(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "—";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === "string" || typeof item === "number")
    .slice(0, 4);
  return entries.length ? entries.map(([key, item]) => `${key}：${String(item)}`).join(" · ") : "—";
}

export function DigitalButlerLeadList({
  leads,
  staff,
  selectedStatus,
  selectedStaffId,
}: {
  leads: Lead[];
  staff: Array<{ id: string; displayName: string }>;
  selectedStatus: string;
  selectedStaffId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function filter(status: string, staffId: string) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (staffId) params.set("staff", staffId);
    router.push(`/dashboard/digital-butler/leads?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 rounded-xl border border-earth-200 bg-white p-3">
        <select
          value={selectedStatus}
          onChange={(event) => filter(event.target.value, selectedStaffId)}
          className="h-9 rounded-lg border border-earth-200 bg-white px-3 text-sm"
        >
          <option value="">全部狀態</option>
          {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{LABELS[status]}</option>)}
        </select>
        <select
          value={selectedStaffId}
          onChange={(event) => filter(selectedStatus, event.target.value)}
          className="h-9 rounded-lg border border-earth-200 bg-white px-3 text-sm"
        >
          <option value="">全部負責人</option>
          {staff.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
        </select>
        <span className="self-center text-xs text-earth-500">共 {leads.length} 筆</span>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {leads.length === 0 && (
        <div className="rounded-xl border border-earth-200 bg-white p-10 text-center text-sm text-earth-500">
          目前沒有符合條件的名單
        </div>
      )}

      {leads.map((lead) => (
        <form
          key={lead.id}
          className="grid gap-3 rounded-xl border border-earth-200 bg-white p-4 lg:grid-cols-[1.2fr_1fr]"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setError(null);
            startTransition(async () => {
              const result = await updateDigitalButlerLeadAction({
                leadId: lead.id,
                status: form.get("status") as DigitalButlerLeadStatus,
                assignedStaffId: (form.get("assignedStaffId") as string) || null,
                note: (form.get("note") as string) || null,
                recordContact: form.get("recordContact") === "on",
              });
              if (!result.success) {
                setError(result.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                {LABELS[lead.status]}
              </span>
              <span className="text-sm font-semibold text-earth-900">{lead.flow.name}</span>
              <span className="text-xs text-earth-400">
                {new Date(lead.createdAt).toLocaleString("zh-TW")}
              </span>
            </div>
            <p className="mt-3 text-lg font-semibold text-earth-900">{lead.phone ?? "未提供電話"}</p>
            <p className="mt-2 text-xs leading-relaxed text-earth-500">{answerSummary(lead.submittedAnswers)}</p>
            {lead.activities.length > 0 && (
              <div className="mt-3 border-t border-earth-100 pt-2">
                <p className="text-[11px] font-medium text-earth-400">最近追蹤</p>
                {lead.activities.slice(0, 3).map((activity) => (
                  <p key={activity.id} className="mt-1 text-xs text-earth-500">
                    {activity.createdBy.name} · {LABELS[activity.toStatus]}
                    {activity.note ? ` · ${activity.note}` : ""}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <select name="status" defaultValue={lead.status} className="h-10 rounded-lg border border-earth-200 px-2 text-sm">
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{LABELS[status]}</option>)}
              </select>
              <select name="assignedStaffId" defaultValue={lead.assignedStaff?.id ?? ""} className="h-10 rounded-lg border border-earth-200 px-2 text-sm">
                <option value="">未指派</option>
                {staff.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
              </select>
            </div>
            <textarea
              name="note"
              defaultValue={lead.internalNote ?? ""}
              maxLength={1000}
              placeholder="內部備註或本次聯絡結果"
              className="min-h-20 rounded-lg border border-earth-200 p-2 text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-earth-600">
                <input type="checkbox" name="recordContact" />
                記錄為本次已聯絡
              </label>
              <button disabled={pending} className="h-9 rounded-lg bg-primary-600 px-4 text-sm font-medium text-white disabled:opacity-50">
                {pending ? "儲存中" : "儲存追蹤"}
              </button>
            </div>
          </div>
        </form>
      ))}
    </div>
  );
}
