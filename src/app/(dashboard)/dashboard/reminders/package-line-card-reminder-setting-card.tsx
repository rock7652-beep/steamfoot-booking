"use client";
import {ReminderSettingRow,closeReminderRow} from "@/components/admin/reminder-settings-list";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { LineCardPreview } from "./line-card-preview";

import { saveCourseReminderBody, setCourseReminderEnabled } from "@/server/actions/course-reminders";
import { useState } from "react";
import { ReminderSettingToggle, useReminderSettingMutation } from "./reminder-setting-feedback";
import { toast } from "sonner";
import { savePackageLineCardReminderSetting, setBookingReminderTypeEnabled } from "@/server/actions/reminder";
import {
  DEFAULT_PACKAGE_LINE_CARD_REMINDER,
  PACKAGE_LINE_CARD_REMINDER_MAX_LENGTH,
} from "@/lib/package-line-card-reminder-setting";

interface Props {
  course?: boolean;
  initialBody: string;
  hasMapLink: boolean;
  initialEnabled: boolean;
}

export function PackageLineCardReminderSettingCard({ initialBody, initialEnabled, hasMapLink, course = false }: Props) {
  const defaultBody = course ? "請記得準時到課；如需取消，請依店家規則在會員專區逐位處理。" : DEFAULT_PACKAGE_LINE_CARD_REMINDER;
  const title = course ? "課程上課提醒" : "方案／單次預約提醒";
  const [enabled, setEnabled] = useState(initialEnabled);
  const [body, setBody] = useState(initialBody);
  const [savedBody, setSavedBody] = useState(initialBody);
  const mutation = useReminderSettingMutation();
  useSettingsPanelGuard(body !== savedBody, mutation.pending);
  const trimmedBody = body.trim();
  const canSave =
    trimmedBody.length > 0 &&
    trimmedBody.length <= PACKAGE_LINE_CARD_REMINDER_MAX_LENGTH &&
    trimmedBody !== savedBody;

  function save(nextBody: string) {
    void mutation.run("form", () => (course ? saveCourseReminderBody : savePackageLineCardReminderSetting)({ body: nextBody }), () => {
      setBody(nextBody);
      setSavedBody(nextBody);
      toast.success("LINE 卡片提醒內容已儲存");
    });
  }

  function toggle() {
    const next = !enabled;
    void mutation.run("toggle", () => (course ? setCourseReminderEnabled(next) : setBookingReminderTypeEnabled("PACKAGE", next)), () => {
      setEnabled(next);
      toast.success(`${next ? "已開啟" : "已關閉"}${title}`);
    }, () => { setEnabled(next); return () => setEnabled(!next); });
  }

  return (
    <ReminderSettingRow title={title} description={course ? "前一天 18:00・通知實際上課者" : "前一天 18:00・方案與單次預約"} control={<ReminderSettingToggle enabled={enabled} pending={mutation.togglePending} disabled={mutation.pending} label={`${title}開關`} onToggle={toggle} />} pending={mutation.pending} error={mutation.toggleError || mutation.formError} resetToken={savedBody} dirty={body !== savedBody}>
      <div className={`border-t border-earth-100 ${course ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-earth-800">通知內容與底部按鈕</h3>
          <p className="mt-1 text-xs leading-relaxed text-earth-500">
            {course ? "只影響目前課程店家，沿用店家通知功能與發送額度。共卡操作人不會收到其他學員的提醒。" : "套用於方案／單次預約的前一天 18:00 正式提醒與手動測試；只影響目前分店。"}
          </p>
        </div>
        <button
          type="button"
          disabled={mutation.pending || savedBody === defaultBody}
          onClick={() => save(defaultBody)}
          className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50 disabled:opacity-40"
        >
          恢復預設
        </button>
      </div>

      <div className={`${course ? "mt-3" : "mt-4"} grid gap-3 md:grid-cols-2`}>
        <div className="min-w-0">
          <label htmlFor="package-line-card-reminder" className="mb-1 block text-xs font-medium text-earth-700">
            店長自訂提醒
          </label>
          <textarea
            id="package-line-card-reminder"
            value={body}
            disabled={mutation.formPending}
            maxLength={PACKAGE_LINE_CARD_REMINDER_MAX_LENGTH}
            rows={course ? 3 : 4}
            onChange={(event) => setBody(event.target.value)}
            placeholder={defaultBody}
            className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm leading-relaxed text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-earth-400">
            <span>請勿填入姓名、日期、地址或網址，卡片會自動顯示。</span>
            <span>{body.length}/{PACKAGE_LINE_CARD_REMINDER_MAX_LENGTH}</span>
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-earth-200 bg-white p-3">
          <p className="text-sm font-medium text-earth-700">卡片預覽・示意資料</p>
          <div className="mt-3">
          <LineCardPreview title="預約提醒" actions={course ? [...(hasMapLink ? [{label:"開啟 Google Maps 導航"}] : []), {label:"改時段",variant:"outline"}, {label:"取消前往",variant:"cancel"}] : [...(hasMapLink ? [{ label: "開啟 Google Maps 導航" }] : []), { label: "改時段", variant: "outline" }, { label: "取消前往", variant: "cancel" }]}>
            <p className="font-semibold">王小美 您好</p><p>日期時間　2026-09-17 14:00</p><p>{trimmedBody || defaultBody}</p>
          </LineCardPreview>
          <p className="mt-2 text-[11px] text-earth-400">{course ? "體驗課另有「確認會到」。改期與取消依本店截止、名額與方案規則處理，逐位確認。" : "改期與取消屬於必要功能；導航連結由首次體驗提醒中的分店地圖共用。"}</p></div>
        </div>
      </div>

      <div className={`${course ? "mt-3" : "mt-4"} flex flex-wrap items-center justify-end gap-3`}>
        {mutation.formError && <p role="alert" className="mr-auto min-w-0 break-words text-sm text-red-700">{mutation.formError}</p>}
        <button type="button" disabled={mutation.pending} onClick={event => { setBody(savedBody); closeReminderRow(event); }} className="min-h-11 rounded-lg border border-earth-200 px-4 py-2 text-sm">取消</button>
        <button
          type="button"
          disabled={mutation.pending || !canSave}
          onClick={() => save(trimmedBody)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
        >
          {mutation.formPending ? "儲存中…" : "儲存變更"}
        </button>
      </div>
      </div>
    </ReminderSettingRow>
  );
}
