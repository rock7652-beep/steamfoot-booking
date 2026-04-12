"use client";

import { useState } from "react";
import { adminStartTrial } from "@/server/actions/upgrade-request";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import type { PricingPlan } from "@prisma/client";
import { toast } from "sonner";

const PLANS: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];

interface Props {
  storeId: string;
  storeName: string;
}

export function AdminTrialStart({ storeId, storeName }: Props) {
  const [selected, setSelected] = useState<PricingPlan>("BASIC");
  const [days, setDays] = useState(14);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleStart() {
    const confirmed = window.confirm(
      `確認為「${storeName}」開通「${PRICING_PLAN_INFO[selected].label}」試用 ${days} 天？`
    );
    if (!confirmed) return;

    setPending(true);
    const result = await adminStartTrial({
      storeId,
      trialPlan: selected,
      trialDays: days,
      reason: reason.trim() || undefined,
    });
    setPending(false);

    if (result.success) {
      toast.success("試用已開通");
      setTimeout(() => window.location.reload(), 1000);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">
        開通試用
      </summary>
      <div className="mt-2 rounded-lg border border-blue-200 bg-white p-4 space-y-3">
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
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-earth-200 text-earth-600 hover:border-earth-300"
                }`}
              >
                {info.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-earth-600">試用天數：</label>
          <input
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-20 rounded-lg border border-earth-200 px-2 py-1.5 text-xs text-earth-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
          <span className="text-xs text-earth-400">天</span>
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="備註（選填）"
          rows={2}
          className="w-full rounded-lg border border-earth-200 px-3 py-2 text-xs text-earth-700 placeholder:text-earth-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
        />

        <button
          onClick={handleStart}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "開通中..." : `開通 ${PRICING_PLAN_INFO[selected].label} 試用 ${days} 天`}
        </button>
      </div>
    </details>
  );
}
