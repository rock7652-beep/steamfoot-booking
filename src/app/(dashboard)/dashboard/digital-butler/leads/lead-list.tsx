"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DigitalButlerLeadStatus } from "@prisma/client";
import { digitalButlerAnswerSummary } from "@/lib/digital-butler-answer-summary";
import { digitalButlerLeadFilterHref } from "@/lib/digital-butler-lead-filters";
import { DIGITAL_BUTLER_PROVIDER_FILTERS, providerLabel } from "@/lib/digital-butler-provider";
import { updateDigitalButlerLeadAction } from "@/server/actions/digital-butler-leads";

const LABELS: Record<DigitalButlerLeadStatus, string> = {
  NEW: "待接手",
  CONTACTING: "處理中",
  QUOTED: "已報價",
  WON: "已成交",
  LOST: "已結案（未成交）",
  PAUSED: "暫緩",
};
const STATUS_STYLES: Record<DigitalButlerLeadStatus, string> = {
  NEW: "bg-amber-50 text-amber-700",
  CONTACTING: "bg-blue-50 text-blue-700",
  QUOTED: "bg-violet-50 text-violet-700",
  WON: "bg-emerald-50 text-emerald-700",
  LOST: "bg-earth-100 text-earth-600",
  PAUSED: "bg-orange-50 text-orange-700",
};
const STATUS_OPTIONS = Object.keys(LABELS) as DigitalButlerLeadStatus[];

function sourceEntry(provider: string | null): { href: string; label: string } | null {
  if (provider === "LINE") return { href: "https://manager.line.biz/", label: "前往 LINE 官方帳號" };
  if (provider === "MESSENGER") return { href: "https://business.facebook.com/latest/inbox/", label: "前往 Messenger 收件匣" };
  return null;
}

type Lead = {
  id: string;
  status: DigitalButlerLeadStatus;
  phone: string | null;
  customerDisplayName: string | null;
  customerAvatarUrl: string | null;
  customerReference: string | null;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  isHumanSupportHandoff: boolean;
  submittedAnswers: unknown;
  internalNote: string | null;
  lastContactedAt: Date | null;
  createdAt: Date;
  flow: { name: string };
  conversation: { provider: string | null };
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

export function DigitalButlerLeadList({
  leads,
  staff,
  selectedStatus,
  selectedStaffId,
  selectedProvider,
  waitingForHumanSupport,
  focusedLeadId,
}: {
  leads: Lead[];
  staff: Array<{ id: string; displayName: string }>;
  selectedStatus: string;
  selectedStaffId: string;
  selectedProvider: string;
  waitingForHumanSupport: boolean;
  focusedLeadId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focusedLeadId) return;
    document.getElementById(`lead-${focusedLeadId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [focusedLeadId]);

  function filter(key: "status" | "staff" | "provider", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (waitingForHumanSupport) params.delete("handoff");
    router.push(digitalButlerLeadFilterHref(pathname, params, key, value));
  }

  return (
    <div className="space-y-3">
      {waitingForHumanSupport && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <p className="font-medium">以下顧客正在等待真人客服</p>
          <p className="mt-0.5 text-xs text-amber-700">選擇負責人並儲存，就代表已接手，也不會再列入每日提醒。</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 rounded-xl border border-earth-200 bg-white p-3">
        <select
          value={selectedStatus}
          onChange={(event) => filter("status", event.target.value)}
          className="h-9 rounded-lg border border-earth-200 bg-white px-3 text-sm"
        >
          <option value="">全部狀態</option>
          {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{LABELS[status]}</option>)}
        </select>
        <select
          value={selectedStaffId}
          onChange={(event) => filter("staff", event.target.value)}
          className="h-9 rounded-lg border border-earth-200 bg-white px-3 text-sm"
        >
          <option value="">全部負責人</option>
          {staff.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
        </select>
        <select
          value={selectedProvider}
          onChange={(event) => filter("provider", event.target.value)}
          className="h-9 rounded-lg border border-earth-200 bg-white px-3 text-sm"
          aria-label="來源篩選"
        >
          <option value="">全部來源</option>
          {DIGITAL_BUTLER_PROVIDER_FILTERS.map((provider) => (
            <option key={provider.value} value={provider.value}>{provider.label}</option>
          ))}
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
        (() => {
          const entry = sourceEntry(lead.conversation.provider);
          return (
        <form
          key={lead.id}
          id={`lead-${lead.id}`}
          className={`grid scroll-m-6 gap-3 rounded-xl border bg-white p-3 shadow-sm transition lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:gap-4 ${
            focusedLeadId === lead.id
              ? "border-primary-500 ring-4 ring-primary-100"
              : "border-earth-200"
          }`}
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
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-earth-100 px-2 py-0.5 text-xs font-medium text-earth-700">
                {providerLabel(lead.conversation.provider)}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[lead.status]}`}>
                {LABELS[lead.status]}
              </span>
              <span className="text-xs text-earth-500">{lead.flow.name}</span>
              <span className="ml-auto text-[11px] text-earth-400">
                {new Date(lead.createdAt).toLocaleString("zh-TW")}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {lead.customerAvatarUrl ? <Image src={lead.customerAvatarUrl} alt="" width={32} height={32} className="h-8 w-8 rounded-full" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-earth-100 text-xs text-earth-500">客</span>}
              <p className="text-base font-semibold text-earth-900">{lead.customerDisplayName ?? lead.customerReference ?? lead.phone ?? "未辨識顧客"}</p>
              <p className="text-xs text-earth-500">
                負責人：{lead.assignedStaff?.displayName ?? "尚未指派"}
              </p>
            </div>
            <p className="mt-1.5 rounded-lg bg-earth-50 px-2.5 py-2 text-xs leading-relaxed text-earth-600">
              <span className="font-medium text-earth-700">顧客需求：</span>
              {digitalButlerAnswerSummary(lead.submittedAnswers, {
                isHumanSupportHandoff: lead.isHumanSupportHandoff,
              })}
            </p>
            {lead.lastMessage && <p className="mt-1 text-xs text-earth-600">最後訊息：{lead.lastMessage}</p>}
            {lead.lastMessageAt && <p className="mt-1 text-[11px] text-earth-400">{new Date(lead.lastMessageAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>}
            {entry && <a href={entry.href} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block text-xs font-medium text-primary-700 underline">{entry.label}</a>}
            {lead.activities.length > 0 && (
              <details className="mt-2 text-xs text-earth-500">
                <summary className="cursor-pointer select-none text-[11px] font-medium text-earth-400">
                  查看最近追蹤（{Math.min(lead.activities.length, 3)}）
                </summary>
                <div className="mt-1.5 space-y-1 border-l-2 border-earth-100 pl-2">
                  {lead.activities.slice(0, 3).map((activity) => (
                    <p key={activity.id}>
                      {activity.createdBy.name} · {LABELS[activity.toStatus]}
                      {activity.note ? ` · ${activity.note}` : ""}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </div>

          <fieldset className="grid min-w-0 gap-2 border-0 p-0">
            <legend className="mb-0.5 text-xs font-semibold text-earth-700">處理進度</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-[11px] text-earth-500">
                目前狀態
                <select name="status" defaultValue={lead.status} className="h-9 rounded-lg border border-earth-200 bg-white px-2 text-sm text-earth-800">
                  {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{LABELS[status]}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-[11px] text-earth-500">
                負責人
                <select name="assignedStaffId" defaultValue={lead.assignedStaff?.id ?? ""} className="h-9 rounded-lg border border-earth-200 bg-white px-2 text-sm text-earth-800">
                  <option value="">尚未指派</option>
                  {staff.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
                </select>
              </label>
            </div>
            <textarea
              name="note"
              defaultValue={lead.internalNote ?? ""}
              maxLength={1000}
              rows={2}
              placeholder="簡單記錄處理結果（選填）"
              aria-label="處理備註"
              className="min-h-14 resize-y rounded-lg border border-earth-200 p-2 text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-earth-600">
                <input type="checkbox" name="recordContact" />
                本次有聯絡顧客
              </label>
              <button disabled={pending} className="h-9 rounded-lg bg-primary-600 px-4 text-sm font-medium text-white disabled:opacity-50">
                {pending ? "儲存中" : "儲存處理結果"}
              </button>
            </div>
          </fieldset>
        </form>
          );
        })()
      ))}
    </div>
  );
}
