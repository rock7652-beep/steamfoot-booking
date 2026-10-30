"use client";
import {ReminderSettingRow} from "@/components/admin/reminder-settings-list";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { LineCardPreview } from "./line-card-preview";

import { useState } from "react";
import { ReminderSettingToggle, useReminderSettingMutation } from "./reminder-setting-feedback";
import { toast } from "sonner";
import { setPlanExpiryReminderEnabled } from "@/server/actions/reminder";
import { setCourseExpiryReminderEnabled } from "@/server/actions/course-reminders";

export function PlanExpiryReminderSettingCard({ initialEnabled, course=false, music=false }: { initialEnabled: boolean; course?:boolean; music?:boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const mutation = useReminderSettingMutation();
  useSettingsPanelGuard(false, mutation.pending);

  function toggle() {
    const next = !enabled;
    void mutation.run("toggle", () => (course ? setCourseExpiryReminderEnabled : setPlanExpiryReminderEnabled)(next), () => {
      setEnabled(next);
      toast.success(next ? "已開啟方案到期提醒" : "已關閉方案到期提醒");
    }, () => { setEnabled(next); return () => setEnabled(!next); });
  }

  return (
    <ReminderSettingRow title="方案到期提醒" description={course ? "18:00・全店開關與各方案天數共同決定" : "到期前 14、7 天 18:00；已全部預約時不發送"} control={<ReminderSettingToggle enabled={enabled} pending={mutation.togglePending} disabled={mutation.pending} label="切換方案即將到期提醒" onToggle={toggle} />} pending={mutation.pending} error={mutation.toggleError || mutation.formError}>
      <div className={`border-t border-earth-100 ${course ? "p-3" : "p-4"}`}>
        <LineCardPreview title="方案提醒" subtitle="方案將於 14 天後到期" actions={course ? [{ label: "查看方案與期限" }, { label: "立即預約" }, { label: "購買／續購方案" }, { label: "諮詢店長", variant: "link" }] : [{ label: "立即預約" }, { label: "諮詢店長", variant: "link" }]}>
          <p className="font-semibold">王小美 您好</p><p>方案名稱　{music?"吉他個別課 4 堂":course?"課程點數方案":"蒸足保養 5 堂"}</p><p>{music?"剩餘 5 堂／占用 3 堂／可用 2 堂":course?"剩餘 5 點／占用 3 點／可用 2 點":"剩餘堂數　2 堂"}</p><p>方案到期日　2026/09/30</p><p>課程需於方案有效期限內完成，預約日期不可晚於到期日。</p>
        </LineCardPreview>
        <p className="mt-3 text-xs leading-relaxed text-earth-500">示意資料。{music?"通知依實際首次上課日計算到期日；每位成員於每個到期階段只成功送達一次。":course?"通知以同店仍具共卡授權的成員為對象，點／堂分開，方案到期日變更會重新核對；每位成員於每個到期階段只成功送達一次。":"卡片會自動帶入顧客姓名、方案、剩餘堂數與到期日；同一方案在每個提醒階段只發送一次。"}</p>
      </div>
    </ReminderSettingRow>
  );
}
