"use client";

import { useState } from "react";
import Link from "next/link";
import { HEALTH_DISPLAY_METRICS } from "@/lib/health-display-metrics";
import type { TrendPoint } from "@/lib/health-service";

const INITIAL_VISIBLE_RECORDS = 5;
const RECORDS_PER_LOAD = 5;

interface HealthHistoryListProps {
  trend: TrendPoint[];
  totalRecords: number;
  editBasePath?: string;
  recordIds?: string[];
}

export function HealthHistoryList({
  trend,
  totalRecords,
  editBasePath,
  recordIds,
}: HealthHistoryListProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_RECORDS);
  const recentRecords = trend
    .map((record, index) => ({ record, recordId: recordIds?.[index] }))
    .reverse();
  const visibleRecords = recentRecords.slice(0, visibleCount);
  const remainingLoadedRecords = Math.max(0, recentRecords.length - visibleCount);
  const canLoadMore = remainingLoadedRecords > 0;

  return (
    <div className="mb-4 border-t border-earth-100 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-earth-900">近期量測紀錄</h4>
        <span className="text-[11px] text-earth-500">
          顯示 {visibleRecords.length} 筆
        </span>
      </div>

      <div
        id="health-history-records"
        className="mt-2 divide-y divide-earth-100 rounded-xl border border-earth-100"
      >
        {visibleRecords.map(({ record, recordId }, index) => (
          <div
            key={`${record.measuredAt}-${index}`}
            className="px-3 py-3 text-xs"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-earth-800">
                {formatDate(record.measuredAt)}
              </p>
              <div className="flex items-center gap-2">
                {record.storeName && (
                  <span className="rounded-full bg-earth-50 px-2 py-1 text-[10px] text-earth-600">
                    量測門市：{record.storeName}
                  </span>
                )}
                {editBasePath && recordId && (
                  <Link
                    href={`${editBasePath}/${recordId}/edit`}
                    className="flex min-h-10 items-center rounded-lg border border-primary-200 px-3 text-xs font-semibold text-primary-700"
                  >
                    編輯
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
              {HEALTH_DISPLAY_METRICS.map((metric) => (
                <span
                  key={metric.key}
                  className="flex justify-between gap-2 text-earth-600"
                >
                  <span>{metric.label}</span>
                  <span className="tabular-nums text-earth-800">
                    {record[metric.key] == null
                      ? "—"
                      : `${record[metric.key]}${metric.unit}`}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-earth-500">
          曲線使用最近 {trend.length} 筆，共 {totalRecords} 筆紀錄
        </p>
        <div className="flex gap-2">
          {visibleCount > INITIAL_VISIBLE_RECORDS && (
            <button
              type="button"
              onClick={() => setVisibleCount(INITIAL_VISIBLE_RECORDS)}
              className="min-h-10 rounded-md border border-earth-200 px-3 text-xs font-medium text-earth-600"
            >
              收合紀錄
            </button>
          )}
          {canLoadMore && (
            <button
              type="button"
              aria-controls="health-history-records"
              aria-expanded={visibleCount > INITIAL_VISIBLE_RECORDS}
              onClick={() =>
                setVisibleCount((count) =>
                  Math.min(count + RECORDS_PER_LOAD, recentRecords.length),
                )
              }
              className="min-h-10 rounded-md bg-primary-600 px-4 text-xs font-semibold text-white"
            >
              載入更多（尚有 {remainingLoadedRecords} 筆）
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return `${match[1]}/${match[2]}/${match[3]}`;
}
