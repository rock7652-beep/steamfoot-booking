"use client";

import { useState } from "react";
import { submitUpgradeRequest } from "@/server/actions/upgrade-request";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import type { PricingPlan } from "@prisma/client";
import { toast } from "sonner";

const PLAN_ORDER: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];

interface Props {
  currentPlan: PricingPlan;
  hasPending?: boolean;
}

export function DowngradeRequestForm({ currentPlan, hasPending }: Props) {
  const currentIdx = PLAN_ORDER.indexOf(currentPlan);
  const availablePlans = PLAN_ORDER.filter((_, i) => i < currentIdx);

  const [selected, setSelected] = useState<PricingPlan>(availablePlans[availablePlans.length - 1]);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (hasPending) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-xs font-medium text-blue-800">
          已提交降級申請，等候管理員審核中
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-xs font-medium text-green-800">
          降級申請已送出，核准後將於下月 1 日生效
        </p>
      </div>
    );
  }

  if (availablePlans.length === 0) return null;

  async function handleSubmit() {
    setPending(true);
    const result = await submitUpgradeRequest({
      requestedPlan: selected,
      requestType: "DOWNGRADE",
      source: "SETTINGS",
      reason: reason.trim() || undefined,
    });
    setPending(false);

    if (result.success) {
      setSubmitted(true);
      toast.success("降級申請已送出");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <details className="rounded-lg border border-earth-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-earth-700 hover:bg-earth-50">
        申請降級方案
      </summary>
      <div className="p-4 pt-0 space-y-3">
        <p className="text-[11px] text-earth-500">
          降級核准後將於下月 1 日生效，當前方案權益維持至生效日
        </p>

        <div className="flex flex-wrap gap-2">
          {availablePlans.map((plan) => {
            const info = PRICING_PLAN_INFO[plan];
            const isSelected = plan === selected;
            return (
              <button
                key={plan}
                onClick={() => setSelected(plan)}
                className={`rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition ${
                  isSelected
                    ? "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-earth-200 text-earth-600 hover:border-earth-300"
                }`}
              >
                {info.label}
              </button>
            );
          })}
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="降級原因（選填）"
          rows={2}
          className="w-full rounded-lg border border-earth-200 px-3 py-2 text-xs text-earth-700 placeholder:text-earth-400 focus:border-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-300"
        />

        <button
          onClick={handleSubmit}
          disabled={pending}
          className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? "送出中..." : `申請降級至${PRICING_PLAN_INFO[selected].label}`}
        </button>
      </div>
    </details>
  );
}
