"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveTrialLineCardReminderSetting, setBookingReminderTypeEnabled } from "@/server/actions/reminder";
import {
  DEFAULT_TRIAL_LINE_CARD_REMINDER,
  TRIAL_LINE_CARD_MAP_URL_MAX_LENGTH,
  TRIAL_LINE_CARD_REMINDER_MAX_LENGTH,
} from "@/lib/trial-line-card-reminder-setting";

interface Props {
  initialBody: string;
  initialMapUrl: string;
  initialEnabled: boolean;
}

export function TrialLineCardReminderSettingCard({ initialBody, initialMapUrl, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [body, setBody] = useState(initialBody);
  const [mapUrl, setMapUrl] = useState(initialMapUrl);
  const [saved, setSaved] = useState({ body: initialBody, mapUrl: initialMapUrl });
  const [pending, startTransition] = useTransition();
  const trimmedBody = body.trim();
  const trimmedMapUrl = mapUrl.trim();
  const changed = trimmedBody !== saved.body || trimmedMapUrl !== saved.mapUrl;
  const canSave = trimmedBody.length > 0 &&
    trimmedBody.length <= TRIAL_LINE_CARD_REMINDER_MAX_LENGTH &&
    trimmedMapUrl.length <= TRIAL_LINE_CARD_MAP_URL_MAX_LENGTH &&
    changed;

  function save(nextBody: string, nextMapUrl: string) {
    startTransition(async () => {
      const result = await saveTrialLineCardReminderSetting({
        body: nextBody,
        mapUrl: nextMapUrl,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setBody(nextBody);
      setMapUrl(nextMapUrl);
      setSaved({ body: nextBody, mapUrl: nextMapUrl });
      toast.success("首次體驗提醒卡設定已儲存");
    });
  }

  function toggle() {
    startTransition(async () => {
      const result = await setBookingReminderTypeEnabled("TRIAL", !enabled);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setEnabled(!enabled);
      toast.success(!enabled ? "已開啟首次體驗提醒" : "已關閉首次體驗提醒");
    });
  }

  return (
    <details className="group rounded-xl border border-earth-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
        <div>
          <h2 className="text-base font-semibold text-earth-900">首次體驗提醒</h2>
          <p className="mt-1 text-sm text-earth-500">前一日 18:00 發送；只影響首次體驗預約。</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={(event) => { event.preventDefault(); toggle(); }} disabled={pending} aria-pressed={enabled} className={`relative h-7 w-12 rounded-full ${enabled ? "bg-primary-600" : "bg-earth-300"}`}>
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
            設定目前分店的提醒文字與 Google Maps 導航；套用於前一天 18:00 正式提醒及手動測試。
          </p>
        </div>
        <button
          type="button"
          disabled={pending || saved.body === DEFAULT_TRIAL_LINE_CARD_REMINDER}
          onClick={() => save(DEFAULT_TRIAL_LINE_CARD_REMINDER, trimmedMapUrl)}
          className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50 disabled:opacity-40"
        >
          恢復預設文字
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="trial-line-card-reminder" className="mb-1 block text-xs font-medium text-earth-700">
            店長自訂提醒
          </label>
          <textarea
            id="trial-line-card-reminder"
            value={body}
            maxLength={TRIAL_LINE_CARD_REMINDER_MAX_LENGTH}
            rows={4}
            onChange={(event) => setBody(event.target.value)}
            placeholder={DEFAULT_TRIAL_LINE_CARD_REMINDER}
            className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm leading-relaxed text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-earth-400">
            <span>請勿填入姓名、日期或網址，卡片會自動顯示。</span>
            <span>{body.length}/{TRIAL_LINE_CARD_REMINDER_MAX_LENGTH}</span>
          </div>
        </div>

        <div>
          <label htmlFor="trial-line-card-map-url" className="mb-1 block text-xs font-medium text-earth-700">
            Google Maps 導航網址
          </label>
          <input
            id="trial-line-card-map-url"
            type="url"
            value={mapUrl}
            maxLength={TRIAL_LINE_CARD_MAP_URL_MAX_LENGTH}
            onChange={(event) => setMapUrl(event.target.value)}
            placeholder="https://maps.app.goo.gl/..."
            className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200"
          />
          <p className="mt-1 text-[11px] leading-relaxed text-earth-400">
            此網址由分店共用，也會套用於方案／單次預約提醒；留空時不顯示導航按鈕。
          </p>
          <details className="mt-3 rounded-xl border border-earth-200 p-3"><summary className="cursor-pointer text-sm font-medium text-earth-700">查看卡片預覽</summary><div className="mt-3 overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
            <div className="bg-[#F3EDE5] p-3 text-sm font-semibold text-earth-800">蒸管家｜首次體驗提醒</div>
            <div className="space-y-2 p-3 text-sm text-earth-700">
              <p className="font-semibold">王小美 您好</p>
              <p>日期時間　2026-08-26 14:00</p>
              <p>{trimmedBody || DEFAULT_TRIAL_LINE_CARD_REMINDER}</p>
            </div>
            <div className="space-y-2 border-t border-earth-100 p-3 text-center text-xs font-semibold text-white">
              {trimmedMapUrl && <div className="rounded-lg bg-primary-600 px-3 py-2">Google Maps 導航</div>}
              <div className="rounded-lg bg-primary-600 px-3 py-2">確認會到</div>
              <div className="rounded-lg bg-[#8B6B52] px-3 py-2">需要改期</div>
              <div className="rounded-lg bg-[#AD5F58] px-3 py-2">取消預約</div>
            </div>
          </div></details>
          <p className="mt-2 text-[11px] text-earth-400">確認、改期與取消為必要功能；填入地圖網址後才顯示導航按鈕。</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={pending || !canSave}
          onClick={() => save(trimmedBody, trimmedMapUrl)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
        >
          {pending ? "儲存中..." : "儲存變更"}
        </button>
      </div>
      </div>
    </details>
  );
}
