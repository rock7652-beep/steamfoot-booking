"use client";

import { useState } from "react";
import { useResponsiveAction } from "@/hooks/use-responsive-action";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updatePlan } from "@/server/actions/plan";

interface Props {
  planId: string;
  planName: string;
  publicVisible: boolean;
  isActive: boolean;
  /** compact 版（手機列表用）*/
  compact?: boolean;
  /**
   * 桌機版 manager 路徑：傳入後不打 `router.refresh()`，由 caller 用
   * 回傳的 next 值更新本地 plans 狀態。
   */
  onChange?: (next: boolean) => void;
}

export function PlanPublishToggle({
  planId,
  planName,
  publicVisible,
  isActive,
  compact = false,
  onChange,
}: Props) {
  const [preview, setPreview] = useState<boolean | null>(null);
  const [lastServerValue, setLastServerValue] = useState(publicVisible);
  if (lastServerValue !== publicVisible) {
    setLastServerValue(publicVisible);
    setPreview(null);
  }
  const saves = useResponsiveAction();
  const pending = saves.isBlocked(planId);
  const displayed = preview ?? publicVisible;
  const router = useRouter();

  function handleToggle() {
    const next = !displayed;
    void saves.run(planId, () => updatePlan(planId, { publicVisible: next }), {
      apply: () => setPreview(next),
      rollback: () => setPreview(null),
      confirmed: () => {
        toast.success(`「${planName}」設定已儲存`);
        if (onChange) onChange(next);
        else router.refresh();

      },
    });
  }

  // 下架（isActive=false）時整個 plan 不可用，toggle 無意義 → 只顯示靜態 badge
  if (!isActive) {
    return (
      <span
        className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
          compact ? "text-[10px]" : ""
        } bg-earth-100 text-earth-500`}
      >
        已下架
      </span>
    );
  }

  const label = displayed ? "顧客可購買" : "僅後台指派";
  const badgeClass = displayed
    ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
    : "bg-earth-100 text-earth-600 hover:bg-earth-200";

  return (
    <span className="inline-flex flex-col items-start gap-1">
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      aria-pressed={displayed}
      title={displayed ? "點擊改為僅後台指派" : "點擊上架給顧客"}
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition ${badgeClass} ${
        compact ? "text-[10px]" : ""
      } ${pending ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          displayed ? "bg-blue-500" : "bg-earth-400"
        }`}
      />
      {label}{saves.states[planId]?.phase === "saving" ? "・儲存中…" : ""}
    </button>
    {(saves.states[planId]?.phase === "error" || saves.states[planId]?.phase === "unknown") && <span role="alert" className="max-w-64 text-xs text-red-700">{saves.states[planId].message}</span>}
    </span>
  );
}
