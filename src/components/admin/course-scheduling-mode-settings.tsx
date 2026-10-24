"use client";
import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSettingsPanelGuard } from "./settings-panel-context";
import { useSettingsSave } from "./use-settings-save";
import { savedSchedulingModes } from "@/lib/course-scheduling-mode-save";
import { NotificationSwitch } from "./notification-switch";
import { SettingsListRow } from "@/components/settings";
export function CourseSchedulingModeSettings({ storeId, open, assigned, revision, canEdit }: { storeId: string; open: boolean; assigned: boolean; revision: number; canEdit: boolean }) {
  const [state, setState] = useState({ open, assigned, revision });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const lock = useRef(false);
  const pathname = usePathname(), router = useRouter();
  const request = useSettingsSave(`${pathname.split("/dashboard")[0]}/dashboard/settings-save/course/scheduling-modes`, storeId, savedSchedulingModes);
  useSettingsPanelGuard(false, pending || request.uncertain);
  if (revision > state.revision && !pending && !request.uncertain) setState({ open, assigned, revision });
  async function save(mode: "OPEN" | "ASSIGNED", enabled: boolean) {
    if (lock.current || !canEdit) return;
    lock.current = true; setError("");
    start(async () => {
      try {
        const r = await request.save({ mode, enabled, expectedRevision: state.revision });
        if (!r.success) { setError(r.error); return; }
        setState(r.data);
        if (r.syncWarning) setError("已儲存，畫面同步中");
        router.refresh();
      } finally { lock.current = false; }
    });
  }
  return <fieldset className="min-w-0" aria-label="排課模式"><legend className="py-2 font-semibold text-primary-900">排課模式</legend><div className="grid min-w-0 grid-cols-1 gap-x-4 sm:grid-cols-2">
    {([['OPEN','開放選課','open'],['ASSIGNED','指定學員','assigned']] as const).map(([mode,label,key]) => <SettingsListRow key={mode} compact title={label} summary={state[key] ? "開啟" : "關閉"} controls={<label className="inline-flex min-h-11 min-w-12 items-center justify-center"><NotificationSwitch aria-label={label} checked={state[key]} disabled={!canEdit || pending || request.uncertain} onChange={e => void save(mode, e.target.checked)}/></label>}/>)}
    {error && <p role="alert" className="col-span-full py-1 text-sm text-red-700">{error}</p>}
    {request.uncertain && <button type="button" className="min-h-11 text-primary-700 underline" disabled={pending} onClick={() => void save("OPEN", state.open)}>重試確認</button>}
  </div></fieldset>;
}
