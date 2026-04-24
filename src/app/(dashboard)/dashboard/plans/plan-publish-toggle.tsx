"use client";

import { useTransition } from "react";
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
}

export function PlanPublishToggle({
  planId,
  planName,
  publicVisible,
  isActive,
  compact = false,
}: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle() {
    const next = !publicVisible;
    startTransition(async () => {
      const result = await updatePlan(planId, { publicVisible: next });
      if (result.success) {
        toast.success(
          next
            ? `「${planName}」已上架給顧客`
            : `「${planName}」已改為僅後台指派`
        );
        router.refresh();
      } else {
        toast.error(result.error ?? "切換失敗");
      }
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

  const label = publicVisible ? "顧客可購買" : "僅後台指派";
  const badgeClass = publicVisible
    ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
    : "bg-earth-100 text-earth-600 hover:bg-earth-200";

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      aria-pressed={publicVisible}
      title={publicVisible ? "點擊改為僅後台指派" : "點擊上架給顧客"}
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition ${badgeClass} ${
        compact ? "text-[10px]" : ""
      } ${pending ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          publicVisible ? "bg-blue-500" : "bg-earth-400"
        }`}
      />
      {pending ? "切換中..." : label}
    </button>
  );
}
