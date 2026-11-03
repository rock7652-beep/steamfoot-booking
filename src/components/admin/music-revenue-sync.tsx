"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { subscribeMusicFinanceChange } from "@/lib/music-finance-sync";

export function MusicRevenueSync({ targetedTransactions = false }: { targetedTransactions?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeMusicFinanceChange((kind) => {
      if (targetedTransactions && kind !== "general") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        setChanged(true);
        startTransition(() => router.refresh());
      }, 150);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [router, targetedTransactions]);
  return changed ? <p role="status" className="text-sm text-earth-600">{pending ? "同步交易明細中…" : "交易明細已同步"}</p> : null;
}
