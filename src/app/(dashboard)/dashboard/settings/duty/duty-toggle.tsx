"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateDutyScheduling } from "@/server/actions/shop";

interface Props {
  enabled: boolean;
  /** Compact layout — switch only, no surrounding card. */
  compact?: boolean;
}

export function DutySchedulingToggle({ enabled, compact = false }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEnabled, setIsEnabled] = useState(enabled);

  function handleToggle() {
    const newValue = !isEnabled;

    if (newValue) {
      const confirmed = window.confirm(
        "啟用後，未安排值班的時段將不對客戶開放預約。\n\n確定要啟用值班排班聯動？",
      );
      if (!confirmed) return;
    }

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
          toast.error(result.error);
        }
      } catch {
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
      onClick={handleToggle}
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

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span
          className={`text-[11px] font-medium ${
            isEnabled ? "text-primary-700" : "text-earth-500"
          }`}
        >
          {isEnabled ? "已啟用" : "停用中"}
        </span>
        {switchEl}
      </div>
    );
  }

  return switchEl;
}
