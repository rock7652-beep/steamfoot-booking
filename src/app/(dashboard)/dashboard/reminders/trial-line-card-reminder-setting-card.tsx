"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveTrialLineCardReminderSetting } from "@/server/actions/reminder";
import {
  DEFAULT_TRIAL_LINE_CARD_REMINDER,
  TRIAL_LINE_CARD_MAP_URL_MAX_LENGTH,
  TRIAL_LINE_CARD_REMINDER_MAX_LENGTH,
} from "@/lib/trial-line-card-reminder-setting";

interface Props {
  initialBody: string;
  initialMapUrl: string;
}

export function TrialLineCardReminderSettingCard({ initialBody, initialMapUrl }: Props) {
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

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-earth-800">首次體驗提醒卡</h2>
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

      <div className="mt-4 grid gap-4 md:grid-cols-2">
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
          <div className="mt-3 rounded-lg border border-earth-100 bg-[#F8F4EE] p-3 text-sm leading-relaxed text-earth-800">
            {trimmedBody || DEFAULT_TRIAL_LINE_CARD_REMINDER}
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={pending || !canSave}
          onClick={() => save(trimmedBody, trimmedMapUrl)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
        >
          {pending ? "儲存中..." : "儲存體驗提醒設定"}
        </button>
      </div>
    </div>
  );
}
