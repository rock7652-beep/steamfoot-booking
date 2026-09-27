"use client";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { LineCardPreview } from "./line-card-preview";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setPlanExpiryReminderEnabled } from "@/server/actions/reminder";
import { setCourseExpiryReminderEnabled } from "@/server/actions/course-reminders";

export function PlanExpiryReminderSettingCard({ initialEnabled, course=false, music=false }: { initialEnabled: boolean; course?:boolean; music?:boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  useSettingsPanelGuard(false, pending);

  function toggle() {
    const next = !enabled;
    startTransition(async () => {
      const result = await (course?setCourseExpiryReminderEnabled:setPlanExpiryReminderEnabled)(next);
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
          <p className="mt-1 text-sm text-earth-500">{course?"依下方各方案天數，於 18:00 發送；":"到期前 14 天、7 天於 18:00 發送；"}{course?"剩餘額度已全部占用、已結清或已退款時不發送。":"剩餘堂數已全部預約時不發送。"}</p>
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
        <LineCardPreview title="方案提醒" subtitle="方案將於 14 天後到期" actions={[{ label: course?"查看方案與期限":"立即預約" }, { label: "諮詢店長", variant: "link" }]}>
          <p className="font-semibold">王小美 您好</p><p>方案名稱　{music?"吉他個別課 4 堂":course?"課程點數方案":"蒸足保養 5 堂"}</p><p>{music?"剩餘 5 堂／占用 3 堂／可用 2 堂":course?"剩餘 5 點／占用 3 點／可用 2 點":"剩餘堂數　2 堂"}</p><p>方案到期日　2026/09/30</p><p>課程需於方案有效期限內完成，預約日期不可晚於到期日。</p>
        </LineCardPreview>
        <p className="mt-3 text-xs leading-relaxed text-earth-500">示意資料。{music?"通知依實際首次上課日計算到期日；每位成員於每個到期階段只成功送達一次。":course?"通知以同店仍具共卡授權的成員為對象，點／堂分開，方案到期日變更會重新核對；每位成員於每個到期階段只成功送達一次。":"卡片會自動帶入顧客姓名、方案、剩餘堂數與到期日；同一方案在每個提醒階段只發送一次。"}</p>
      </div>
    </details>
  );
}
