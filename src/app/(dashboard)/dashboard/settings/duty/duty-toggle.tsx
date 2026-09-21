"use client";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateDutyScheduling } from "@/server/actions/shop";

interface Props {
  enabled: boolean;
  course?: boolean;
  /** Compact layout — switch only, no surrounding card. */
  compact?: boolean;
}

export function DutySchedulingToggle({ enabled, compact = false, course = false }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  useSettingsPanelGuard(false, isPending);
  const [isEnabled, setIsEnabled] = useState(enabled);

  const [confirming,setConfirming] = useState(false);
  const [error,setError] = useState("");

  function handleToggle(confirmedCourse = false) {
    const newValue = !isEnabled;

    setError("");
    if (newValue && course && !confirmedCourse) { setConfirming(true); return; }
    if (newValue && !course) {
      const confirmed = window.confirm(
        "啟用後，未安排值班的時段將不對客戶開放預約。\n\n確定要啟用值班排班聯動？",
      );
      if (!confirmed) return;
    }

    setConfirming(false);
    startTransition(async () => {
      try {
        const result = await updateDutyScheduling(newValue);
        if (result.success) {
          setIsEnabled(newValue);
          toast.success(
            newValue ? "已啟用值班排班聯動" : "已關閉值班排班聯動",
          );
          router.refresh();
        } else {
          setError(result.error);
          toast.error(result.error);
        }
      } catch {
        setError("操作失敗，請稍後再試");
        toast.error("操作失敗，請稍後再試");
      }
    });
  }

  const switchEl = (
    <button
      type="button"
      role="switch"
      aria-checked={isEnabled}
      disabled={isPending}
      onClick={() => handleToggle()}
      aria-label={course ? "值班與課程排課聯動" : "值班排班聯動"}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        isEnabled ? "bg-primary-600" : "bg-earth-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
          isEnabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );

  return <div className="min-w-0 max-w-md space-y-3">
    <div className="flex items-center gap-2">
      {compact && <span className={`text-[11px] font-medium ${isEnabled ? "text-primary-700" : "text-earth-500"}`}>{isEnabled ? "已啟用" : "停用中"}</span>}
      {switchEl}
    </div>
    {course && confirming && <div className="rounded-lg border border-earth-200 p-3 text-sm">
      <p>啟用前將檢查教練值班是否涵蓋全部未結束課程。有衝突會列出並阻擋，不取消課程或預約。</p>
      <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={isPending} onClick={()=>handleToggle(true)} className="min-h-11 rounded bg-primary-700 px-3 text-white">確認啟用</button><button type="button" onClick={()=>setConfirming(false)} className="min-h-11 rounded border px-3">取消</button></div>
    </div>}
    {course && error && <p role="alert" className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </div>;
}
