"use client";
import { LineCardPreview } from "./line-card-preview";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setPlanExpiryReminderEnabled } from "@/server/actions/reminder";

export function PlanExpiryReminderSettingCard({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    startTransition(async () => {
      const result = await setPlanExpiryReminderEnabled(next);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setEnabled(next);
      toast.success(next ? "已開啟方案到期提醒" : "已關閉方案到期提醒");
    });
  }

  return (
    <details className="group rounded-xl border border-earth-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
        <div>
          <h2 className="text-base font-semibold text-earth-900">方案即將到期提醒</h2>
          <p className="mt-1 text-sm text-earth-500">到期前 14 天、7 天於 18:00 發送；剩餘堂數已全部預約時不發送。</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(event) => { event.preventDefault(); toggle(); }}
            disabled={pending}
            aria-label="切換方案即將到期提醒"
            aria-pressed={enabled}
            className={`relative h-7 w-12 rounded-full ${enabled ? "bg-primary-600" : "bg-earth-300"}`}
          >
            <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : ""}`} />
          </button>
          <span className="text-earth-400 transition group-open:rotate-180">⌄</span>
        </div>
      </summary>
      <div className="border-t border-earth-100 p-4">
        <LineCardPreview title="方案提醒" subtitle="方案將於 14 天後到期" actions={[{ label: "立即預約" }, { label: "諮詢店長", variant: "link" }]}>
          <p className="font-semibold">王小美 您好</p><p>方案名稱　蒸足保養 5 堂</p><p>剩餘堂數　2 堂</p><p>方案到期日　2026/09/30</p><p>課程需於方案有效期限內完成，預約日期不可晚於到期日。</p>
        </LineCardPreview>
        <p className="mt-3 text-xs leading-relaxed text-earth-500">卡片會自動帶入顧客姓名、方案、剩餘堂數與到期日；同一方案在每個提醒階段只發送一次。</p>
      </div>
    </details>
  );
}
