"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { REFERRAL_STATUS_CONFIG, REFERRAL_STATUS_TRANSITIONS } from "@/types/referral";
import { updateReferralStatus } from "@/server/actions/referral";
import type { ReferralStatus } from "@prisma/client";

interface ReferralItem {
  id: string;
  referredName: string;
  referredPhone: string | null;
  status: ReferralStatus;
  note: string | null;
  createdAt: string; // ISO string
}

interface Props {
  customerId: string;
  referrals: ReferralItem[];
  canManage: boolean;
  onAddClick: () => void;
}

export function ReferralSection({ customerId, referrals, canManage, onAddClick }: Props) {
  return (
    <div className="mt-4 rounded-lg border border-earth-100 bg-earth-50/50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-earth-500">轉介紹紀錄</h3>
        {canManage && (
          <button
            type="button"
            onClick={onAddClick}
            className="rounded bg-primary-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-primary-700"
          >
            + 新增轉介紹
          </button>
        )}
      </div>

      {referrals.length === 0 ? (
        <p className="mt-3 text-center text-xs text-earth-400">尚無轉介紹紀錄</p>
      ) : (
        <div className="mt-3 space-y-2">
          {referrals.map((r) => (
            <ReferralRow key={r.id} referral={r} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReferralRow({ referral, canManage }: { referral: ReferralItem; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const config = REFERRAL_STATUS_CONFIG[referral.status];
  const transitions = REFERRAL_STATUS_TRANSITIONS[referral.status];

  function handleStatusChange(newStatus: string) {
    startTransition(async () => {
      const result = await updateReferralStatus({
        referralId: referral.id,
        newStatus,
      });
      if (!result.success) {
        toast.error(result.error ?? "狀態更新失敗，請重新整理頁面");
      }
    });
  }

  const dateStr = new Date(referral.createdAt).toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
  });

  return (
    <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-earth-800">{referral.referredName}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${config.bg} ${config.color}`}>
            {config.label}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-earth-400">
          <span>{dateStr}</span>
          {referral.referredPhone && <span>{referral.referredPhone}</span>}
          {referral.note && <span>· {referral.note}</span>}
        </div>
      </div>

      {canManage && transitions.length > 0 && (
        <div className="ml-2 flex flex-wrap gap-1">
          {transitions.map((next) => {
            const nextConfig = REFERRAL_STATUS_CONFIG[next];
            return (
              <button
                key={next}
                type="button"
                disabled={isPending}
                onClick={() => handleStatusChange(next)}
                className={`rounded px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50 ${nextConfig.bg} ${nextConfig.color} hover:opacity-80`}
              >
                {next === "CANCELLED" ? "取消" : nextConfig.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
