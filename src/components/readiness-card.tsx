"use client";

import { useEffect, useState } from "react";
import type { ReadinessStatus } from "@/app/api/coach/readiness/route";

interface ReadinessData {
  referralCount: number;
  bookingCount: number;
  status: ReadinessStatus;
  nextGoal: { referral: number; booking: number };
}

const STATUS_CONFIG: Record<ReadinessStatus, { label: string; color: string; bg: string }> = {
  READY: { label: "已準備好", color: "text-green-700", bg: "bg-green-50 border-green-200" },
  HIGH: { label: "高度準備", color: "text-primary-700", bg: "bg-primary-50 border-primary-200" },
  MEDIUM: { label: "持續累積中", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  LOW: { label: "剛起步", color: "text-earth-600", bg: "bg-earth-50 border-earth-200" },
};

interface Props {
  onInvite?: () => void;
}

export function ReadinessCard({ onInvite }: Props) {
  const [data, setData] = useState<ReadinessData | null>(null);

  useEffect(() => {
    fetch("/api/coach/readiness")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setData(d); });
  }, []);

  if (!data) return null;

  const cfg = STATUS_CONFIG[data.status];
  const refRemaining = Math.max(0, data.nextGoal.referral - data.referralCount);
  const bookRemaining = Math.max(0, data.nextGoal.booking - data.bookingCount);
  const isReady = data.status === "READY";

  return (
    <div className={`rounded-2xl border p-5 ${cfg.bg}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-earth-800">教練準備度</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color} ${cfg.bg}`}>
          {cfg.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-lg bg-white/80 px-3 py-2 text-center">
          <p className="text-lg font-bold text-earth-900">{data.referralCount}</p>
          <p className="text-xs text-earth-500">已邀請</p>
        </div>
        <div className="rounded-lg bg-white/80 px-3 py-2 text-center">
          <p className="text-lg font-bold text-earth-900">{data.bookingCount}</p>
          <p className="text-xs text-earth-500">朋友已預約</p>
        </div>
      </div>

      {isReady ? (
        <p className="text-sm text-green-700 text-center">
          你已經做到了！隨時可以開始教練之路
        </p>
      ) : (
        <p className="text-xs text-earth-500 text-center">
          {refRemaining > 0 && `還差 ${refRemaining} 位邀請`}
          {refRemaining > 0 && bookRemaining > 0 && "、"}
          {bookRemaining > 0 && `${bookRemaining} 筆朋友預約`}
          {refRemaining === 0 && bookRemaining === 0 && "持續邀請朋友體驗吧"}
        </p>
      )}

      {!isReady && onInvite && (
        <button
          onClick={onInvite}
          className="mt-3 w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          邀請朋友
        </button>
      )}
    </div>
  );
}
