"use client";
import { useId, useState } from "react";
import { managerNotificationPreviewSamples } from "@/lib/manager-notification-preview";
import { LineCardPreview } from "./line-card-preview";

export function ManagerNotificationPreview({ course = false }: { course?: boolean }) {
  const selectId = useId();
  const samples = managerNotificationPreviewSamples(course);
  const [selected, setSelected] = useState("sameDay");
  const sample = samples.find(item => item.key === selected) ?? samples[0];
  return <details className="rounded-xl border border-earth-200 bg-white">
    <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium text-primary-700">查看訊息預覽</summary>
    <div className="space-y-4 border-t border-earth-100 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={selectId} className="text-sm text-earth-700">通知類型</label>
        <select id={selectId} value={sample.key} onChange={event => setSelected(event.target.value)} className="min-h-11 min-w-0 max-w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm">
          {samples.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </div>
      <p className="text-sm text-earth-500">以下為示範資料，不會發送通知。按鈕僅供預覽。</p>
      <div aria-live="polite">
        <LineCardPreview exactTitle title={sample.title} subtitle="示範門市" actions={sample.actions.map(item => ({ label: item.action.label }))}>
          {sample.details.map((line, index) => <p key={index}>{line}</p>)}
        </LineCardPreview>
      </div>
    </div>
  </details>;
}
