"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerReconciliation } from "@/server/actions/reconciliation";

export function RunReconciliationButton() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await triggerReconciliation();
      router.refresh();
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
