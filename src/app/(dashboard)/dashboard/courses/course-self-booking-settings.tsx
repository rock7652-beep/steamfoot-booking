"use client";

import { courseDisplayText } from "@/lib/course-display-text";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useSettingsSave } from "@/components/admin/use-settings-save";
import { savedSelfBooking } from "@/lib/course-self-booking-save";
import { usePathname, useRouter } from "next/navigation";
import { SettingsListRow } from "@/components/settings";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";

export function CourseSelfBookingSettings({
  storeId,
  music = false,
  initialEnabled = true,
  initialRevision = 0,
  canEdit,
  expanded,
  onEdit,
  onClose,
}: {
  storeId:string;
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
  const saveRequest=useSettingsSave(`${pathname.split("/dashboard")[0]}/dashboard/settings-save/course/self-booking`,storeId,savedSelfBooking);
  const dirty = enabled !== savedEnabled;
  useSettingsPanelGuard(dirty, pending || saveRequest.uncertain);
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

  function save() {
    if (!canEdit || saving.current || (!dirty && !saveRequest.uncertain)) return;
    saving.current = true;
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await saveRequest.save({ enabled,expectedRevision:revision });
        if (!result.success) {
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
        if(result.syncWarning)setError("已儲存；其他頁面更新失敗，請重新整理核對。");
        onClose();
      } catch {
        setError("連線失敗，修改內容已保留，請重試");
      } finally {
        saving.current = false;
      }
    });
  }

  return (
    <SettingsListRow
      title="允許學員自行預約"
      summary={savedEnabled ? "開啟" : "關閉"}
      expanded={expanded && canEdit}
      keepMounted
      onEdit={canEdit ? onEdit : undefined}
      controls={saved && !dirty ? <span role="status" className="text-sm text-primary-700">已儲存 ✓</span> : dirty ? <span role="status" className="text-sm text-amber-700">未儲存</span> : undefined}
    >
      <form onSubmit={event => { event.preventDefault(); save(); }} className="space-y-3">
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-earth-800">
          <input type="checkbox" checked={enabled} disabled={!canEdit || pending || saveRequest.uncertain} onChange={event => { const checked = event.target.checked; setState(current => ({ ...current, enabled: checked })); setError(""); setSaved(false); }} />
          允許學員自行預約
        </label>
        <p className="text-sm leading-6 text-earth-600">{courseDisplayText("關閉後保留課表、預約與候補順位；新增預約、改期、加入候補及自動遞補暫停。取消與店家／教練操作不變，可隨時重新開啟。", music)}</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={pending || saveRequest.uncertain} onClick={cancel} className="min-h-11 rounded-lg border border-earth-200 px-4 text-sm disabled:opacity-40">取消</button>
          <button type="submit" disabled={!canEdit || pending || (!dirty && !saveRequest.uncertain)} className="min-h-11 rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white disabled:opacity-40">{pending ? "儲存中…" : saveRequest.uncertain ? "重試確認儲存結果" : "儲存"}</button>
        </div>
      </form>
    </SettingsListRow>
  );
}
