"use client";

import { useState } from "react";
import { adminChangeStorePlan } from "@/server/actions/upgrade-request";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import type { PricingPlan } from "@prisma/client";
import { toast } from "sonner";

const PLANS: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];

interface Props {
  storeId: string;
  storeName: string;
  currentPlan: PricingPlan;
}

export function AdminPlanOverride({ storeId, storeName, currentPlan }: Props) {
  const [selected, setSelected] = useState(currentPlan);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function handleChange() {
    if (selected === currentPlan) return;
    if (!reason.trim()) {
      toast.error("請填寫調整原因");
      return;
    }

    const confirmed = window.confirm(
      `確認將「${storeName}」的方案從「${PRICING_PLAN_INFO[currentPlan].label}」調整為「${PRICING_PLAN_INFO[selected].label}」？`
    );
    if (!confirmed) return;

    setPending(true);
    try {
      const result = await adminChangeStorePlan({
        storeId,
        newPlan: selected,
        reason: reason.trim(),
      });

      if (result.success) {
        toast.success("方案已調整");
        setReason("");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast.error(result.error ?? "操作失敗");
      }
    } catch (err) {
      console.error("adminChangeStorePlan error:", err);
      toast.error(err instanceof Error ? err.message : "操作失敗，請稍後再試");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <h4 className="text-xs font-semibold text-indigo-800">管理員手動調整方案</h4>
      </div>

      <div className="flex flex-wrap gap-2">
        {PLANS.map((plan) => {
          const info = PRICING_PLAN_INFO[plan];
          const isSelected = plan === selected;
          return (
            <button
              key={plan}
              onClick={() => setSelected(plan)}
              className={`rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition ${
                isSelected
                  ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                  : "border-earth-200 text-earth-600 hover:border-earth-300"
              }`}
            >
              {info.label}
              {plan === currentPlan && <span className="ml-1 text-[10px] text-earth-400">*</span>}
            </button>
          );
        })}
      </div>

      {selected !== currentPlan && (
        <>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="調整原因（必填）"
            rows={2}
            className="w-full rounded-lg border border-earth-200 px-3 py-2 text-xs text-earth-700 placeholder:text-earth-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
          <button
            onClick={handleChange}
            disabled={pending || !reason.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "調整中..." : `調整至 ${PRICING_PLAN_INFO[selected].label}`}
          </button>
        </>
      )}
    </div>
  );
}
