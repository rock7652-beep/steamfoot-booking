"use client";

import { useState } from "react";
import { updateShopPlan } from "@/server/actions/shop";
import { PLAN_INFO } from "@/lib/shop-plan";
import type { ShopPlan } from "@prisma/client";

const PLANS: ShopPlan[] = ["FREE", "BASIC", "PRO"];

export function PlanSwitcher({ currentPlan }: { currentPlan: ShopPlan }) {
  const [selected, setSelected] = useState(currentPlan);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSwitch() {
    if (selected === currentPlan) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await updateShopPlan(selected);
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
    <div className="rounded-xl border border-earth-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-earth-800">切換方案</h3>
      <p className="mt-1 text-xs text-earth-400">僅限店主操作，切換後立即生效</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {PLANS.map((plan) => {
          const info = PLAN_INFO[plan];
          const isSelected = plan === selected;
          return (
            <button
              key={plan}
              onClick={() => setSelected(plan)}
              className={`rounded-lg border-2 px-4 py-2 text-sm font-medium transition ${
                isSelected
                  ? "border-primary-400 bg-primary-50 text-primary-700"
                  : "border-earth-200 text-earth-600 hover:border-earth-300"
              }`}
            >
              {info.label}
              {plan === currentPlan && <span className="ml-1 text-[10px] text-earth-400">（目前）</span>}
            </button>
          );
        })}
      </div>

      {selected !== currentPlan && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSwitch}
            disabled={pending}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? "切換中..." : `切換至 ${PLAN_INFO[selected].label}`}
          </button>
          <button
            onClick={() => setSelected(currentPlan)}
            className="text-sm text-earth-400 hover:text-earth-600"
          >
            取消
          </button>
        </div>
      )}

      {message && (
        <p className="mt-3 text-sm text-green-600">{message}</p>
      )}
    </div>
  );
}
