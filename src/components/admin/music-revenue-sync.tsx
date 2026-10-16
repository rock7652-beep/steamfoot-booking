"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { subscribeMusicFinanceChange } from "@/lib/music-finance-sync";

export function MusicRevenueSync() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeMusicFinanceChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setChanged(true);
        startTransition(() => router.refresh());
      }, 150);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [router]);
  return changed ? <p role="status" className="text-sm text-earth-600">{pending ? "同步收款資料中…" : "收款資料已同步"}</p> : null;
}
