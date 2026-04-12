"use client";

import { useState } from "react";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import type { PricingPlan, UpgradeRequestStatus } from "@prisma/client";

interface Props {
  status: UpgradeRequestStatus;
  requestedPlan: PricingPlan;
  reviewNote?: string | null;
}

export function UpgradeResultBanner({ status, requestedPlan, reviewNote }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (status === "PENDING") return null;

  const isApproved = status === "APPROVED";
  const info = PRICING_PLAN_INFO[requestedPlan];

  return (
    <div
      className={`rounded-xl border px-5 py-4 ${
        isApproved
          ? "border-green-200 bg-gradient-to-r from-green-50 to-emerald-50"
          : "border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              isApproved ? "bg-green-100" : "bg-amber-100"
            }`}
          >
            {isApproved ? (
              <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            )}
          </div>
          <div>
            <p className={`text-sm font-semibold ${isApproved ? "text-green-900" : "text-amber-900"}`}>
              {isApproved
                ? `方案已升級至${info.label}`
                : `升級至${info.label}的申請未通過`}
            </p>
            <p className={`text-xs ${isApproved ? "text-green-700" : "text-amber-700"}`}>
              {isApproved
                ? "新功能已開通，可以開始使用"
                : reviewNote
                  ? `原因：${reviewNote}`
                  : "如需協助，請聯繫管理員"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className={`shrink-0 rounded-lg p-1 transition ${
            isApproved
              ? "text-green-400 hover:bg-green-100 hover:text-green-600"
              : "text-amber-400 hover:bg-amber-100 hover:text-amber-600"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
