"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isMusicPreviewPage, subscribeMusicFinanceChange } from "@/lib/music-finance-sync";

/** Refresh authoritative balances without navigating or remounting form state. */
export function MusicCashDrawerSync() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (!isMusicPreviewPage()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dispose = subscribeMusicFinanceChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setChanged(true);
        startTransition(() => router.refresh());
      }, 150);
    });
    return () => { clearTimeout(timer); dispose(); };
  }, [router]);
  return changed ? <p role="status" className="text-sm text-earth-600">{pending ? "同步現金抽屜中…" : "現金抽屜已同步"}</p> : null;
}
