"use client";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { LineCardPreview } from "./line-card-preview";

import { saveCourseReminderBody, setCourseReminderEnabled } from "@/server/actions/course-reminders";
import { useState, useTransition } from "react";
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
  const [pending, startTransition] = useTransition();
  useSettingsPanelGuard(body !== savedBody, pending);
  const trimmedBody = body.trim();
  const canSave =
    trimmedBody.length > 0 &&
    trimmedBody.length <= PACKAGE_LINE_CARD_REMINDER_MAX_LENGTH &&
    trimmedBody !== savedBody;

  function save(nextBody: string) {
    startTransition(async () => {
      const result = await (course ? saveCourseReminderBody : savePackageLineCardReminderSetting)({ body: nextBody });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setBody(nextBody);
      setSavedBody(nextBody);
      toast.success("LINE 卡片提醒內容已儲存");
    });
  }

  function toggle() {
    startTransition(async () => {
      const result = await (course ? setCourseReminderEnabled(!enabled) : setBookingReminderTypeEnabled("PACKAGE", !enabled));
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setEnabled(!enabled);
      toast.success(`${!enabled ? "已開啟" : "已關閉"}${title}`);
    });
  }

  return (
    <details className="group rounded-xl border border-earth-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
        <div className="md:col-span-2">
          <h2 className="text-base font-semibold text-earth-900">{title}</h2>
          <p className="mt-1 text-sm text-earth-500">{course ? "前一日 18:00 發送給實際上課者；取消的預約不發送。" : "前一日 18:00 發送；只影響方案與單次預約。"}</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={(event) => { event.preventDefault(); toggle(); }} disabled={pending} aria-label={`${title}開關`} aria-pressed={enabled} className={`relative h-7 w-12 rounded-full ${enabled ? "bg-primary-600" : "bg-earth-300"}`}>
            <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : ""}`} />
          </button>
          <span className="text-earth-400 transition group-open:rotate-180">⌄</span>
        </div>
      </summary>
      <div className="border-t border-earth-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-earth-800">通知內容與底部按鈕</h3>
          <p className="mt-1 text-xs leading-relaxed text-earth-500">
            {course ? "只影響目前課程店家，沿用店家通知功能與發送額度。共卡操作人不會收到其他學員的提醒。" : "套用於方案／單次預約的前一天 18:00 正式提醒與手動測試；只影響目前分店。"}
          </p>
        </div>
        <button
          type="button"
          disabled={pending || savedBody === defaultBody}
          onClick={() => save(defaultBody)}
          className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50 disabled:opacity-40"
        >
          恢復預設
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor="package-line-card-reminder" className="mb-1 block text-xs font-medium text-earth-700">
            店長自訂提醒
          </label>
          <textarea
            id="package-line-card-reminder"
            value={body}
            maxLength={PACKAGE_LINE_CARD_REMINDER_MAX_LENGTH}
            rows={4}
            onChange={(event) => setBody(event.target.value)}
            placeholder={defaultBody}
            className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm leading-relaxed text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-earth-400">
            <span>請勿填入姓名、日期、地址或網址，卡片會自動顯示。</span>
            <span>{body.length}/{PACKAGE_LINE_CARD_REMINDER_MAX_LENGTH}</span>
          </div>
        </div>

        <details className="md:col-span-2 rounded-xl border border-earth-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-earth-700">查看卡片預覽</summary>
          <div className="mt-3">
          <LineCardPreview title="預約提醒" actions={course ? [{ label: "會員專區／查看課程", variant: "outline" }] : [...(hasMapLink ? [{ label: "開啟 Google Maps 導航" }] : []), { label: "改時段", variant: "outline" }, { label: "取消前往", variant: "cancel" }]}>
            <p className="font-semibold">王小美 您好</p><p>日期時間　2026-09-17 14:00</p><p>{trimmedBody || defaultBody}</p>
          </LineCardPreview>
          <p className="mt-2 text-[11px] text-earth-400">{course ? "示意資料。入口回到會員專區，依既有課程規則查看或逐人取消；不使用蒸足改期流程。" : "改期與取消屬於必要功能；導航連結由首次體驗提醒中的分店地圖共用。"}</p></div>
        </details>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={pending || !canSave}
          onClick={() => save(trimmedBody)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
        >
          {pending ? "儲存中..." : "儲存變更"}
        </button>
      </div>
      </div>
    </details>
  );
}
