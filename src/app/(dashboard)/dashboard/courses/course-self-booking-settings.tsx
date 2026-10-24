"use client";
import { canCloseConfirmedSettingsSave } from "@/lib/settings-save-outcome";

import { courseDisplayText } from "@/lib/course-display-text";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useSettingsSave } from "@/components/admin/use-settings-save";
import { savedSelfBooking } from "@/lib/course-self-booking-save";
import { usePathname, useRouter } from "next/navigation";
import {NotificationSwitch} from "@/components/admin/notification-switch";
import { SettingsListRow } from "@/components/settings";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";

export function CourseSelfBookingSettings({
  storeId,
  immediate=false,savePath,title="允許學員自行預約",description,
  music = false,
  initialEnabled = true,
  initialRevision = 0,
  canEdit,
  expanded,
  onEdit,
  onClose,
}: {
  immediate?:boolean;storeId:string;savePath?:string;title?:string;description?:string;
  music?: boolean;
  initialEnabled?: boolean;
  initialRevision?: number;
  canEdit: boolean;
  expanded: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [state, setState] = useState({ enabled: initialEnabled, savedEnabled: initialEnabled, revision: initialRevision });
  const { enabled, savedEnabled, revision } = state;
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const saving = useRef(false);
  const router = useRouter(), pathname=usePathname();
  const saveRequest=useSettingsSave(savePath??`${pathname.split("/dashboard")[0]}/dashboard/settings-save/course/self-booking`,storeId,savedSelfBooking);
  const dirty = enabled !== savedEnabled;
  useSettingsPanelGuard(!immediate&&dirty, pending || saveRequest.uncertain);
  const latestRevision = useRef(revision);
  useLayoutEffect(() => { latestRevision.current = revision; }, [revision]);

  // Accept only newer authority. Refreshes may update the saved status, never a live draft.
  if (initialRevision > revision) {
    setState({
      enabled: dirty || pending || saveRequest.uncertain ? enabled : initialEnabled,
      savedEnabled: initialEnabled,
      revision: initialRevision,
    });
    setSaved(false);
  }

  function cancel() {
    if (saving.current || saveRequest.uncertain) return;
    setState(current => ({ ...current, enabled: current.savedEnabled }));
    setError("");
    onClose();
  }

  function save(nextEnabled=enabled) {
    if (!canEdit || saving.current || (nextEnabled===savedEnabled && !saveRequest.uncertain)) return;
    saving.current = true;
    setState(current=>({...current,enabled:nextEnabled}));
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await saveRequest.save({ enabled:nextEnabled,expectedRevision:revision });
        if (!result.success) {
          if(immediate&&!result.uncertain)setState(current=>({...current,enabled:current.savedEnabled}));
          setError(result.error ?? "儲存失敗，請重試");
          return;
        }
        const receipt=result.data;
        if (receipt.revision < latestRevision.current) {
          setError("設定已由其他人更新，請確認目前狀態後再儲存。");
          router.refresh();
          return;
        }
        setState(current => receipt.revision < current.revision ? current : {
          enabled: receipt.enabled,
          savedEnabled: receipt.enabled,
          revision: receipt.revision,
        });
        setSaved(true);
        if (canCloseConfirmedSettingsSave(result, setError)) onClose();
      } catch {
        setError("連線失敗，修改內容已保留，請重試");
      } finally {
        saving.current = false;
      }
    });
  }

  if(immediate)return <SettingsListRow title={title} summary={saveRequest.uncertain?'結果待核對':savedEnabled?'開啟':'關閉'} controls={<label className="inline-flex min-h-11 min-w-12 items-center justify-center"><NotificationSwitch aria-label={title} checked={pending||saveRequest.uncertain?enabled:savedEnabled} disabled={!canEdit||pending||saveRequest.uncertain} onChange={event=>save(event.target.checked)}/></label>}>{error&&<p role="alert" className="py-1 text-sm text-red-700">{error}</p>}{saveRequest.uncertain&&<button type="button" className="min-h-11 px-3 text-sm text-primary-800" disabled={pending} onClick={()=>save()}>核對同次儲存結果</button>}</SettingsListRow>;
  return (
    <SettingsListRow
      title={title}
      summary={savedEnabled ? "開啟" : "關閉"}
      expanded={expanded && canEdit}
      keepMounted
      onEdit={canEdit ? onEdit : undefined}
      controls={saved && !dirty ? <span role="status" className="text-sm text-primary-700">已儲存 ✓</span> : dirty ? <span role="status" className="text-sm text-amber-700">未儲存</span> : undefined}
    >
      <form onSubmit={event => { event.preventDefault(); save(); }} className="space-y-3">
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-earth-800">
          <input type="checkbox" checked={enabled} disabled={!canEdit || pending || saveRequest.uncertain} onChange={event => { const checked = event.target.checked; setState(current => ({ ...current, enabled: checked })); setError(""); setSaved(false); }} />
          {title}
        </label>
        <p className="text-sm leading-6 text-earth-600">{description??courseDisplayText("關閉後暫停新增預約與候補遞補；請假、改期分別設定。", music)}</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={pending || saveRequest.uncertain} onClick={cancel} className="min-h-11 rounded-lg border border-earth-200 px-4 text-sm disabled:opacity-40">取消</button>
          <button type="submit" disabled={!canEdit || pending || (!dirty && !saveRequest.uncertain)} className="min-h-11 rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white disabled:opacity-40">{pending ? "儲存中…" : saveRequest.uncertain ? "重試確認儲存結果" : "儲存"}</button>
        </div>
      </form>
    </SettingsListRow>
  );
}
