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
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirty = enabled !== initial.enabled || defaultLimit !== initial.defaultLimit || stopMinutes !== initial.autoPromoteStopMinutes;

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
      setMessage("已儲存");
      setExpanded(false);
    });
  }

  return (
    <div>
      {!expanded ? (
        <div className="flex justify-end">
          {canEdit && <button type="button" onClick={() => setExpanded(true)} className="min-h-10 rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50">修改</button>}
        </div>
      ) : (
        <div className="grid items-end gap-3 sm:grid-cols-[auto_minmax(140px,0.55fr)_minmax(170px,0.8fr)_auto]">
          <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-earth-700">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canEdit || pending}
              onChange={(event) => { setEnabled(event.target.checked); setMessage(""); }}
            />
            啟用
          </label>
          <label className={`block text-sm text-earth-700 ${enabled ? "" : "opacity-45"}`}>
            候補名額
            <input
              className="mt-1 min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3 text-sm"
              type="number"
              min={1}
              max={100}
              value={defaultLimit}
              disabled={!canEdit || pending || !enabled}
              onChange={(event) => { setDefaultLimit(Number(event.target.value)); setMessage(""); }}
            />
          </label>
          <label className={`block text-sm text-earth-700 ${enabled ? "" : "opacity-45"}`}>
            停止遞補
            <select
              className="mt-1 min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3 text-sm"
              value={stopMinutes}
              disabled={!canEdit || pending || !enabled}
              onChange={(event) => { setStopMinutes(Number(event.target.value)); setMessage(""); }}
            >
              <option value={0}>不停止</option>
              <option value={60}>1 小時前</option>
              <option value={120}>2 小時前</option>
              <option value={240}>4 小時前</option>
              <option value={360}>6 小時前</option>
              <option value={720}>12 小時前</option>
              <option value={1440}>24 小時前</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => { setEnabled(initial.enabled); setDefaultLimit(initial.defaultLimit); setStopMinutes(initial.autoPromoteStopMinutes); setMessage(""); setError(""); setExpanded(false); }} className="min-h-10 rounded-lg border border-earth-200 px-3 text-sm">取消</button>
            {canEdit && (
              <button
                type="button"
                disabled={pending || !dirty}
                onClick={save}
                className="min-h-10 rounded-lg bg-primary-700 px-3 text-sm font-semibold text-white disabled:opacity-30"
              >
                {pending ? "儲存中…" : "儲存"}
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-2 text-sm text-primary-700">{message}</p>}
    </div>
  );
}
