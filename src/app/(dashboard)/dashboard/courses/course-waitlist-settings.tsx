"use client";

import { useState, useTransition } from "react";
import { saveCourseWaitlistSettings } from "@/server/actions/course-waitlist";

export function CourseWaitlistSettings({
  initial,
  canEdit,
}: {
  initial: { enabled: boolean; defaultLimit: number; autoPromoteStopMinutes: number };
  canEdit: boolean;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [defaultLimit, setDefaultLimit] = useState(initial.defaultLimit);
  const [stopMinutes, setStopMinutes] = useState(initial.autoPromoteStopMinutes);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function save() {
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await saveCourseWaitlistSettings({
        enabled,
        defaultLimit,
        autoPromoteStopMinutes: stopMinutes,
      });
      if (!result.success) {
        setError(result.error ?? "儲存失敗");
        return;
      }
      setMessage("候補設定已儲存");
    });
  }

  return (
    <div className="mt-3 space-y-3">
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canEdit || pending}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        啟用候補功能
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-earth-700">
          預設候補名額
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3"
            type="number"
            min={1}
            max={100}
            value={defaultLimit}
            disabled={!canEdit || pending}
            onChange={(event) => setDefaultLimit(Number(event.target.value))}
          />
        </label>
        <label className="block text-sm text-earth-700">
          開課前停止自動遞補
          <select
            className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3"
            value={stopMinutes}
            disabled={!canEdit || pending}
            onChange={(event) => setStopMinutes(Number(event.target.value))}
          >
            <option value={0}>不停止</option>
            <option value={60}>1 小時</option>
            <option value={120}>2 小時</option>
            <option value={240}>4 小時</option>
            <option value={360}>6 小時</option>
            <option value={720}>12 小時</option>
            <option value={1440}>24 小時</option>
          </select>
        </label>
      </div>
      <p className="text-xs leading-5 text-earth-500">
        關閉後不接受新候補，也不會自動遞補；既有候補紀錄保留。每個課程可另外決定是否開放候補與名額上限。
      </p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-primary-700">{message}</p>}
      {canEdit && (
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="min-h-11 rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "儲存中…" : "儲存候補設定"}
        </button>
      )}
    </div>
  );
}
