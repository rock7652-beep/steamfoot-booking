"use client";

import { useState } from "react";
import { updateStorePlan } from "@/server/actions/shop";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import type { PricingPlan } from "@prisma/client";

const PLANS: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];

interface Props {
  storeId: string;
  storeName: string;
  currentPlan: PricingPlan;
}

export function PricingPlanSwitcher({ storeId, storeName, currentPlan }: Props) {
  const [selected, setSelected] = useState(currentPlan);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSwitch() {
    if (selected === currentPlan) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await updateStorePlan(storeId, selected);
      if (result.success) {
        setMessage("方案已更新，頁面將重新載入...");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setMessage(result.error ?? "更新失敗");
      }
    } catch {
      setMessage("更新失敗");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-earth-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-earth-800">{storeName}</h4>
          <p className="text-xs text-earth-400">
            目前：
            <span className={`font-medium ${PRICING_PLAN_INFO[currentPlan].color}`}>
              {PRICING_PLAN_INFO[currentPlan].label}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {PLANS.map((plan) => {
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
              {plan === currentPlan && <span className="ml-1 text-[10px] text-earth-400">*</span>}
            </button>
          );
        })}
      </div>

      {selected !== currentPlan && (
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleSwitch}
            disabled={pending}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? "切換中..." : `切換至 ${PRICING_PLAN_INFO[selected].label}`}
          </button>
          <button
            onClick={() => setSelected(currentPlan)}
            className="text-xs text-earth-400 hover:text-earth-600"
          >
            取消
          </button>
        </div>
      )}

      {message && (
        <p className={`mt-2 text-xs ${message.includes("更新") ? "text-green-600" : "text-red-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
