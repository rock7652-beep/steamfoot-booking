"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePackageLineCardReminderSetting } from "@/server/actions/reminder";
import {
  DEFAULT_PACKAGE_LINE_CARD_REMINDER,
  PACKAGE_LINE_CARD_REMINDER_MAX_LENGTH,
} from "@/lib/package-line-card-reminder-setting";

interface Props {
  initialBody: string;
}

export function PackageLineCardReminderSettingCard({ initialBody }: Props) {
  const [body, setBody] = useState(initialBody);
  const [savedBody, setSavedBody] = useState(initialBody);
  const [pending, startTransition] = useTransition();
  const trimmedBody = body.trim();
  const canSave =
    trimmedBody.length > 0 &&
    trimmedBody.length <= PACKAGE_LINE_CARD_REMINDER_MAX_LENGTH &&
    trimmedBody !== savedBody;

  function save(nextBody: string) {
    startTransition(async () => {
      const result = await savePackageLineCardReminderSetting({ body: nextBody });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setBody(nextBody);
      setSavedBody(nextBody);
      toast.success("LINE 卡片提醒內容已儲存");
    });
  }

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-earth-800">LINE 卡片提醒內容</h2>
          <p className="mt-1 text-xs leading-relaxed text-earth-500">
            只套用於方案／單次預約的手動測試 Flex 卡，不影響前一天 18:00 正式提醒。
          </p>
        </div>
        <button
          type="button"
          disabled={pending || savedBody === DEFAULT_PACKAGE_LINE_CARD_REMINDER}
          onClick={() => save(DEFAULT_PACKAGE_LINE_CARD_REMINDER)}
          className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50 disabled:opacity-40"
        >
          恢復預設
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="package-line-card-reminder" className="mb-1 block text-xs font-medium text-earth-700">
            店長自訂提醒
          </label>
          <textarea
            id="package-line-card-reminder"
            value={body}
            maxLength={PACKAGE_LINE_CARD_REMINDER_MAX_LENGTH}
            rows={4}
            onChange={(event) => setBody(event.target.value)}
            placeholder={DEFAULT_PACKAGE_LINE_CARD_REMINDER}
            className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm leading-relaxed text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-earth-400">
            <span>請勿填入姓名、日期、地址或網址，卡片會自動顯示。</span>
            <span>{body.length}/{PACKAGE_LINE_CARD_REMINDER_MAX_LENGTH}</span>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-earth-700">卡片內容預覽</p>
          <div className="min-h-24 rounded-lg border border-earth-100 bg-[#F8F4EE] p-3 text-sm leading-relaxed text-earth-800">
            {trimmedBody || DEFAULT_PACKAGE_LINE_CARD_REMINDER}
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={pending || !canSave}
          onClick={() => save(trimmedBody)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
        >
          {pending ? "儲存中..." : "儲存提醒內容"}
        </button>
      </div>
    </div>
  );
}
