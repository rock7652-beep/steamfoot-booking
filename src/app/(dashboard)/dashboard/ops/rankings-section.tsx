"use client";

import { useState, useTransition } from "react";
import type { StaffRanking } from "@/server/queries/ops-dashboard-v2";
import { getStaffRankings } from "@/server/queries/ops-dashboard-v2";

const medals = ["🥇", "🥈", "🥉"];
const periodOptions = [
  { label: "7 天", days: 7 },
  { label: "30 天", days: 30 },
  { label: "90 天", days: 90 },
];

interface Props {
  rankings: StaffRanking[];
  initialDays?: number;
}

export function RankingsSection({ rankings: initialRankings, initialDays = 30 }: Props) {
  const [selectedDays, setSelectedDays] = useState(initialDays);
  const [rankings, setRankings] = useState(initialRankings);
  const [pending, startTransition] = useTransition();

  function handlePeriodChange(days: number) {
    if (days === selectedDays) return;
    setSelectedDays(days);
    startTransition(async () => {
      const data = await getStaffRankings(days);
      setRankings(data);
    });
  }

  if (rankings.length === 0 && !pending) {
    return (
      <p className="py-4 text-center text-sm text-earth-400">尚無店長績效資料</p>
    );
  }

  const maxRevenue = Math.max(...rankings.map((r) => r.revenue), 1);

  return (
    <div>
      {/* Period switcher */}
      <div className="mb-3 flex gap-1.5">
        {periodOptions.map((opt) => (
          <button
            key={opt.days}
            onClick={() => handlePeriodChange(opt.days)}
            disabled={pending}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
              selectedDays === opt.days
                ? "bg-primary-600 text-white"
                : "bg-earth-100 text-earth-500 hover:text-earth-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {pending ? (
        <div className="flex items-center justify-center py-8 text-sm text-earth-400">
          載入中...
        </div>
      ) : (
        <div className="space-y-3">
          {rankings.map((staff) => (
            <div
              key={staff.staffId}
              className="rounded-xl border border-earth-100 bg-earth-50/50 px-4 py-3"
            >
              {/* Top row: rank + name + revenue */}
              <div className="flex items-center gap-3">
                <span className="text-lg">
                  {staff.rank <= 3 ? medals[staff.rank - 1] : (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-earth-200 text-xs font-bold text-earth-600">
                      {staff.rank}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: staff.colorCode }}
                  />
                  <span className="text-sm font-semibold text-earth-800">
                    {staff.displayName}
                  </span>
                </span>
                <span className="ml-auto text-base font-bold text-earth-900">
                  ${staff.revenue.toLocaleString()}
                </span>
                {staff.revenueGrowth != null && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                      staff.revenueGrowth >= 0
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {staff.revenueGrowth >= 0 ? "↑" : "↓"}
                    {Math.abs(staff.revenueGrowth)}%
                  </span>
                )}
              </div>

              {/* Revenue bar */}
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-earth-100">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all duration-500"
                  style={{ width: `${(staff.revenue / maxRevenue) * 100}%` }}
                />
              </div>

              {/* Metrics row */}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-earth-500">
                <span>到店率 <b className={staff.completionRate >= 80 ? "text-green-600" : staff.completionRate >= 50 ? "text-yellow-600" : "text-red-500"}>{staff.completionRate}%</b></span>
                <span>顧客數 <b className="text-earth-700">{staff.customerCount}</b></span>
                <span>新客 <b className="text-blue-600">{staff.newCustomerCount}</b></span>
                <span>客單價 <b className="text-earth-700">${staff.avgRevenue.toLocaleString()}</b></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
