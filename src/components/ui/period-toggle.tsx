/**
 * Design System — Period Toggle
 *
 * 統一的時段切換器，用於趨勢圖等需要切換時間範圍的場景。
 */

"use client";

interface PeriodToggleProps<T extends string> {
  periods: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}

export function PeriodToggle<T extends string>({ periods, value, onChange }: PeriodToggleProps<T>) {
  return (
    <div className="flex rounded-lg border border-earth-200 p-0.5">
      {periods.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            value === p.key
              ? "bg-primary-600 text-white"
              : "text-earth-500 hover:text-earth-700"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
