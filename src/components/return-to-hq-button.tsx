"use client";

import { useTransition } from "react";
import { switchActiveStore } from "@/server/actions/store-switch";
import { hqStoreSwitchDestination } from "@/lib/hq-navigation";
import { toast } from "sonner";

export function ReturnToHqButton({ collapsed = false }: { collapsed?: boolean }) {
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} aria-label="返回 HQ 總部" title="返回 HQ 總部"
    className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
    onClick={() => startTransition(async () => {
      const result = await switchActiveStore("__all__");
      if (result.success) window.location.assign(hqStoreSwitchDestination(window.location.search));
      else toast.error(result.error ?? "返回總部失敗，已保留目前店舖");
    })}>
    <svg aria-hidden="true" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l-7 7 7 7M2 12h13a7 7 0 017 7" /></svg>
    {!collapsed && <span>{pending ? "讀取中…" : "返回 HQ 總部"}</span>}
  </button>;
}
