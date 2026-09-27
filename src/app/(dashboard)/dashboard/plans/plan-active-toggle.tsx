"use client";

import { useState } from "react";
import { useResponsiveAction } from "@/hooks/use-responsive-action";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updatePlan } from "@/server/actions/plan";

interface Props {
  planId: string;
  planName: string;
  isActive: boolean;
  /** compact 版（手機列表用）*/
  compact?: boolean;
  /**
   * 桌機版 manager 路徑：傳入後不打 `router.refresh()`，由 caller 用
   * 回傳的 next 值更新本地 plans 狀態（避免整頁 RSC re-fetch）。
   */
  onChange?: (next: boolean) => void;
}

export function PlanActiveToggle({ planId, planName, isActive, compact = false, onChange }: Props) {
  const [preview, setPreview] = useState<boolean | null>(null);
  const [lastServerValue, setLastServerValue] = useState(isActive);
  if (lastServerValue !== isActive) {
    setLastServerValue(isActive);
    setPreview(null);
  }
  const saves = useResponsiveAction();
  const pending = saves.isBlocked(planId);
  const displayed = preview ?? isActive;
  const router = useRouter();

  function handleToggle() {
    const next = !displayed;
    void saves.run(planId, () => updatePlan(planId, { isActive: next }), {
      apply: () => setPreview(next),
      rollback: () => setPreview(null),
      confirmed: () => {
        toast.success(`「${planName}」設定已儲存`);
        if (onChange) onChange(next);
        else router.refresh();

      },
    });
  }

  const label = displayed ? "上架中" : "已下架";
  const badgeClass = displayed
    ? "bg-green-100 text-green-700 hover:bg-green-200"
    : "bg-red-100 text-red-600 hover:bg-red-200";

  return (
    <span className="inline-flex flex-col items-start gap-1">
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      aria-pressed={displayed}
      title={displayed ? "點擊下架此方案" : "點擊重新上架此方案"}
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition ${badgeClass} ${
        compact ? "text-[10px]" : ""
      } ${pending ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          displayed ? "bg-green-500" : "bg-red-500"
        }`}
      />
      {label}{saves.states[planId]?.phase === "saving" ? "・儲存中…" : ""}
    </button>
    {(saves.states[planId]?.phase === "error" || saves.states[planId]?.phase === "unknown") && <span role="alert" className="max-w-64 text-xs text-red-700">{saves.states[planId].message}</span>}
    </span>
  );
}
