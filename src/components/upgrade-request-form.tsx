"use client";

import { useState } from "react";
import { submitUpgradeRequest } from "@/server/actions/upgrade-request";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import type { PricingPlan, RequestSource } from "@prisma/client";
import { toast } from "sonner";

const PLAN_ORDER: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];

interface Props {
  currentPlan: PricingPlan;
  source: RequestSource;
  /** 已有 PENDING 申請 → 顯示等候狀態 */
  hasPending?: boolean;
}

export function UpgradeRequestForm({ currentPlan, source, hasPending }: Props) {
  const currentIdx = PLAN_ORDER.indexOf(currentPlan);
  const availablePlans = PLAN_ORDER.filter((_, i) => i > currentIdx);

  const [selected, setSelected] = useState<PricingPlan>(availablePlans[0]);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (hasPending) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-xs font-medium text-blue-800">
          已提交升級申請，等候管理員審核中
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-xs font-medium text-green-800">
          升級申請已送出，管理員將盡快審核
        </p>
      </div>
    );
  }

  if (availablePlans.length === 0) return null;

  async function handleSubmit() {
    setPending(true);
    const result = await submitUpgradeRequest({
      requestedPlan: selected,
      requestType: "UPGRADE",
      source,
      reason: reason.trim() || undefined,
    });
    setPending(false);

    if (result.success) {
      setSubmitted(true);
      toast.success("升級申請已送出");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="rounded-lg border border-earth-200 bg-white p-4 space-y-3">
      <h4 className="text-sm font-semibold text-earth-800">申請升級方案</h4>

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
                  ? "border-primary-400 bg-primary-50 text-primary-700"
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
        placeholder="升級原因（選填）"
        rows={2}
        className="w-full rounded-lg border border-earth-200 px-3 py-2 text-xs text-earth-700 placeholder:text-earth-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
      />

      <button
        onClick={handleSubmit}
        disabled={pending}
        className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
      >
        {pending ? "送出中..." : `申請升級至${PRICING_PLAN_INFO[selected].label}`}
      </button>
    </div>
  );
}
