"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerReconciliation } from "@/server/actions/reconciliation";
import { toast } from "sonner";

export function RunReconciliationButton() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      try {
        await triggerReconciliation();
        router.refresh();
        toast.success("對帳完成");
      } catch (e) {
        console.error("[reconciliation] trigger failed:", e);
        toast.error(e instanceof Error ? e.message : "對帳失敗，請重試");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
    >
      {isPending ? "執行中..." : "手動執行對帳"}
    </button>
  );
}
