"use client";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";

import { useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {useSettingsSave} from "@/components/admin/use-settings-save";
import {useConfirmedSettingsRows} from "@/components/admin/use-confirmed-settings-rows";
import {savedDutySettings} from "@/lib/duty-settings-save";

import {useDutyStatus} from "./duty-status";

interface Props {
  enabled: boolean;
  storeId:string;
  onSaved?:(enabled:boolean)=>void;
  course?: boolean;
  /** Compact layout — switch only, no surrounding card. */
  compact?: boolean;
}

export function DutySchedulingToggle({ enabled, storeId, onSaved, compact = false, course = false }: Props) {
  const pathname=usePathname();
  const request=useSettingsSave(`${pathname.split("/dashboard")[0]}/dashboard/settings-save/duty`,storeId,savedDutySettings);
  const isPending=request.pending,locked=isPending||request.uncertain;
  useSettingsPanelGuard(false, locked);
  const source=useMemo(()=>[{id:"duty",enabled}],[enabled]);
  const confirmed=useConfirmedSettingsRows(source,row=>String(row.enabled));
  const status=useDutyStatus();
  const isEnabled=status?.enabled??confirmed.rows[0].enabled;

  const submitLock=useRef(false);
  const [confirming,setConfirming] = useState(false);
  const [error,setError] = useState("");

  function handleToggle(confirmedCourse = false) {
    if(submitLock.current||(locked&&!request.uncertain))return;
    const newValue = !isEnabled;

    setError("");
    if (newValue && course && !confirmedCourse && !request.uncertain) { setConfirming(true); return; }
    if (newValue && !course && !request.uncertain) {
      const confirmed = window.confirm(
        "啟用後，未安排值班的時段將不對客戶開放預約。\n\n確定要啟用值班排班聯動？",
      );
      if (!confirmed) return;
    }

    setConfirming(false);
    submitLock.current=true;
    void request.save({enabled:newValue,expectedEnabled:isEnabled}).then(result=>{
      if(result.success){
        confirmed.confirm({id:"duty",enabled:result.data.enabled});status?.confirm(result.data.enabled);onSaved?.(result.data.enabled);
        toast.success(result.syncWarning?"已儲存；其他頁面更新失敗，請重新整理核對。":result.data.enabled?"已啟用值班排班聯動":"已關閉值班排班聯動");
      }else {setError(result.error);toast.error(result.error);}
    }).finally(()=>{submitLock.current=false;});
  }

  const switchEl = (
    <button
      type="button"
      role="switch"
      aria-checked={isEnabled}
      disabled={locked}
      onClick={() => handleToggle()}
      aria-label={course ? "值班與課程排課聯動" : "值班排班聯動"}
      className="inline-flex min-h-11 w-11 shrink-0 items-center rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className={`pointer-events-none relative inline-flex h-6 w-11 rounded-full border-2 border-transparent transition-colors duration-200 ${isEnabled?"bg-primary-600":"bg-earth-300"}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${isEnabled?"translate-x-5":"translate-x-0"}`} />
      </span>
    </button>
  );

  return <div className="min-w-0 max-w-md space-y-3">
    <div className="flex min-h-11 items-center gap-2">
      {!compact && <span className="text-sm">{isEnabled?"已啟用":"未啟用"}</span>}
      {switchEl}
    </div>
    {course && confirming && <div className="rounded-lg border border-earth-200 p-2.5 text-xs">
      <p>啟用前將檢查授課人員值班是否涵蓋全部未結束課程。有衝突會列出並阻擋，不取消課程或預約。</p>
      <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={locked} onClick={()=>handleToggle(true)} className="min-h-11 rounded bg-primary-700 px-3 text-xs text-white">確認啟用</button><button type="button" onClick={()=>setConfirming(false)} className="min-h-11 rounded border px-3 text-xs">取消</button></div>
    </div>}
    {request.uncertain && <button type="button" disabled={isPending} onClick={()=>handleToggle(true)} className="min-h-11 rounded border px-3 text-sm">重試確認儲存結果</button>}
    {error && <p role="alert" className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </div>;
}
