"use client";

import { useState, useTransition } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import type { CustomerTag } from "@/server/queries/customer-tags";
import type { OpsActionLogEntry } from "@/server/actions/ops-action-log";
import { sendOpsLineMessage } from "@/server/actions/ops-line";

interface Props {
  customerId: string;
  customerName: string;
  phone: string;
  lineLinked: boolean;
  tags: CustomerTag[];
  scripts: string[];
  followUp: OpsActionLogEntry | null; // latest action log for this customer
}

export function OpsPanel({
  customerId,
  customerName,
  phone,
  lineLinked,
  tags,
  scripts,
  followUp,
}: Props) {
  const [lineStatus, setLineStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleLineSend(script: string) {
    setLineStatus("發送中...");
    startTransition(async () => {
      const res = await sendOpsLineMessage(customerId, script);
      setLineStatus(res.success ? "已發送" : `失敗: ${res.error}`);
      setTimeout(() => setLineStatus(null), 3000);
    });
  }

  return (
    <div className="rounded-xl border border-primary-100 bg-primary-50/30 p-5">
      <h2 className="mb-3 text-sm font-semibold text-earth-800">
        營運面板
      </h2>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-1.5 text-xs font-medium text-earth-500">系統標籤</h3>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${tag.color} ${tag.textColor}`}
                title={tag.description}
              >
                {tag.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Follow-up status */}
      {followUp && (
        <div className="mb-4 rounded-lg border border-earth-100 bg-white px-3 py-2">
          <h3 className="mb-1 text-xs font-medium text-earth-500">跟進狀態</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
              {followUp.status}
            </span>
            {followUp.assigneeName && (
              <span className="text-xs text-earth-500">負責: {followUp.assigneeName}</span>
            )}
            {followUp.note && (
              <span className="text-xs text-earth-400">📝 {followUp.note}</span>
            )}
          </div>
        </div>
      )}

      {/* Suggested scripts */}
      {scripts.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-1.5 text-xs font-medium text-earth-500">建議話術</h3>
          <div className="space-y-1.5">
            {scripts.map((script, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-earth-700"
              >
                <span className="shrink-0 text-earth-400">{i + 1}.</span>
                <span className="flex-1">{script}</span>
                {lineLinked && (
                  <button
                    onClick={() => handleLineSend(script)}
                    disabled={pending}
                    className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 hover:bg-green-200 disabled:opacity-50"
                    title="透過 LINE 發送"
                  >
                    💬 發送
                  </button>
                )}
              </div>
            ))}
          </div>
          {lineStatus && (
            <p className={`mt-1 text-xs ${lineStatus.startsWith("失敗") ? "text-red-500" : "text-green-600"}`}>
              {lineStatus}
            </p>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h3 className="mb-1.5 text-xs font-medium text-earth-500">快速操作</h3>
        <div className="flex flex-wrap gap-2">
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1 rounded-lg bg-primary-100 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-200"
          >
            📞 撥打電話
          </a>
          {lineLinked && (
            <button
              onClick={() => {
                if (scripts.length > 0) handleLineSend(scripts[0]);
              }}
              disabled={pending || scripts.length === 0}
              className="inline-flex items-center gap-1 rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50"
            >
              💬 LINE 訊息
            </button>
          )}
          <Link
            href={`/dashboard/bookings/new?customerId=${customerId}`}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-200"
          >
            📅 建立預約
          </Link>
          <Link
            href={`/dashboard/customers/${customerId}#create-booking`}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
          >
            🛒 建立訂單
          </Link>
        </div>
      </div>
    </div>
  );
}
