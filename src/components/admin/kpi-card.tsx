import type { ReactNode } from "react";

export type KpiTrend = "up" | "down" | "flat";
export type KpiEmphasis = "normal" | "highlight" | "warning";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  delta?: { value: string; trend: KpiTrend } | null;
  emphasis?: KpiEmphasis;
  onClick?: () => void;
  href?: string;
}

const TREND = {
  up: { color: "text-green-600", icon: "▲" },
  down: { color: "text-red-500", icon: "▼" },
  flat: { color: "text-earth-400", icon: "—" },
} as const;

export function KpiCard({
  label,
  value,
  hint,
  delta,
  emphasis = "normal",
  onClick,
}: KpiCardProps) {
  const clickable = !!onClick;
  const borderLeft =
    emphasis === "highlight"
      ? "border-l-[3px] border-l-primary-500"
      : emphasis === "warning"
        ? "border-l-[3px] border-l-amber-500"
        : "";

  const dotColor =
    emphasis === "warning"
      ? "bg-amber-500"
      : emphasis === "highlight"
        ? "bg-primary-500"
        : "";

  return (
    <div
      onClick={onClick}
      className={`relative flex h-[88px] flex-col justify-center gap-1 rounded-md border border-earth-200 bg-white px-4 py-3 ${borderLeft} ${
        clickable
          ? "cursor-pointer transition-shadow hover:shadow-[0_1px_2px_rgba(20,24,31,0.06)]"
          : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        {emphasis === "warning" && (
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden />
        )}
        <p className="text-xs font-medium text-earth-500">{label}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-[22px] font-bold leading-7 tabular-nums text-earth-900">
          {value}
        </p>
        {delta && (
          <span className={`text-xs font-semibold ${TREND[delta.trend].color}`}>
            {TREND[delta.trend].icon} {delta.value}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-earth-500">{hint}</p>}
    </div>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="flex h-[88px] animate-pulse flex-col justify-center gap-2 rounded-md border border-earth-200 bg-white px-4 py-3">
      <div className="h-3 w-16 rounded bg-earth-100" />
      <div className="h-6 w-20 rounded bg-earth-100" />
      <div className="h-3 w-14 rounded bg-earth-100" />
    </div>
  );
}
