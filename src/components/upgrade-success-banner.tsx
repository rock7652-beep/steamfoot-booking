"use client";

import { useState } from "react";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import type { PricingPlan } from "@prisma/client";

interface Props {
  requestedPlan: PricingPlan;
}

export function UpgradeSuccessBanner({ requestedPlan }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const info = PRICING_PLAN_INFO[requestedPlan];

  return (
    <div className="rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
            <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-green-900">
              方案已升級至{info.label}
            </p>
            <p className="text-xs text-green-700">
              新功能已開通，可以開始使用
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-lg p-1 text-green-400 transition hover:bg-green-100 hover:text-green-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
