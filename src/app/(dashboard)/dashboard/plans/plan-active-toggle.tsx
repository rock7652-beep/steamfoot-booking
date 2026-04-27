"use client";

import { useTransition } from "react";
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
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle() {
    const next = !isActive;
    startTransition(async () => {
      const result = await updatePlan(planId, { isActive: next });
      if (result.success) {
        toast.success(
          next
            ? `「${planName}」已上架`
            : `「${planName}」已下架（既有顧客錢包不受影響）`
        );
        if (onChange) {
          onChange(next);
        } else {
          router.refresh();
        }
      } else {
        toast.error(result.error ?? "切換失敗");
      }
    });
  }

  const label = isActive ? "上架中" : "已下架";
  const badgeClass = isActive
    ? "bg-green-100 text-green-700 hover:bg-green-200"
    : "bg-red-100 text-red-600 hover:bg-red-200";

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      aria-pressed={isActive}
      title={isActive ? "點擊下架此方案" : "點擊重新上架此方案"}
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition ${badgeClass} ${
        compact ? "text-[10px]" : ""
      } ${pending ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          isActive ? "bg-green-500" : "bg-red-500"
        }`}
      />
      {pending ? "切換中..." : label}
    </button>
  );
}
