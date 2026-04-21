"use client";

import type { ReactNode } from "react";

interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: SegmentedControlProps<T>) {
  const h = size === "sm" ? "h-7" : "h-8";
  const segH = size === "sm" ? "h-6" : "h-7";
  const padX = size === "sm" ? "px-2.5" : "px-3";
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-md bg-earth-100 p-0.5 ${h}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`${segH} ${padX} inline-flex items-center rounded-[5px] text-xs font-semibold transition-colors ${
              active
                ? "bg-white text-earth-900 shadow-[0_1px_2px_rgba(20,24,31,0.08)]"
                : "text-earth-500 hover:text-earth-800"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
