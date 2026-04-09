"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { activateStaff, deactivateStaff } from "@/server/actions/staff";
import { useRouter } from "next/navigation";

interface StaffStatusToggleProps {
  staffId: string;
  currentStatus: string;
}

export function StaffStatusToggle({ staffId, currentStatus }: StaffStatusToggleProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isActive = currentStatus === "ACTIVE";

  function handleToggle() {
    startTransition(async () => {
      const result = isActive
        ? await deactivateStaff(staffId)
        : await activateStaff(staffId);

      if (!result.success) {
        toast.error(result.error || "操作失敗");
        return;
      }
      toast.success(isActive ? "已停用員工" : "已啟用員工");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
        isPending
          ? "bg-earth-100 text-earth-400 cursor-wait"
          : isActive
            ? "bg-red-50 text-red-600 hover:bg-red-100"
            : "bg-green-50 text-green-600 hover:bg-green-100"
      }`}
    >
      {isPending ? "處理中..." : isActive ? "停用" : "啟用"}
    </button>
  );
}
