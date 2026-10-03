"use client";

import type { SaveState } from "@/hooks/use-responsive-action";

/** Normal success is already visible in the booking; only uncertainty needs a button. */
export function BookingActionFeedback({ state, onCheck }: { state?: SaveState; onCheck: () => void }) {
  if (!state || state.phase === "saved") return null;
  const alert = state.phase === "error" || state.phase === "unknown";
  return <div className="flex flex-wrap items-center gap-2 py-2 text-sm text-amber-800">
    <span role={alert ? "alert" : "status"}>{state.phase === "saving" ? "正在確認預約狀態…" : state.message}</span>
    {state.phase === "unknown" && <button type="button" onClick={onCheck} className="min-h-11 rounded-lg border border-amber-300 bg-amber-50 px-3 font-medium hover:bg-amber-100">查看最新狀態</button>}
  </div>;
}
