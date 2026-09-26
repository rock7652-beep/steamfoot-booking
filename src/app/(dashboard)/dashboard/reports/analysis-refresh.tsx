"use client";
import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AnalysisRefresh({ updatedAt }: { updatedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refreshing = useRef(false);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || refreshing.current) return;
      refreshing.current = true;
      startTransition(() => router.refresh());
    };
    const checkedAt = Date.parse(updatedAt.replace(" ", "T") + ":00+08:00");
    if (Date.now() - checkedAt > 60000) refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, updatedAt]);
  useEffect(() => { if (!pending) refreshing.current = false; }, [pending, updatedAt]);
  return <div className="flex items-center gap-3 text-xs text-earth-500" aria-live="polite">
    <span>{pending ? "更新中，仍顯示上次結果…" : `最後更新 ${updatedAt}`}</span>
    <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="rounded-md border border-earth-300 px-3 py-1.5 text-primary-700 disabled:opacity-50">更新</button>
  </div>;
}
