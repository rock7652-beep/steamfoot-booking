import type { ReactNode } from "react";

interface RightPanelCardProps {
  title: string;
  count?: number | string;
  countTone?: "neutral" | "danger" | "warning";
  rightLink?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function RightPanelCard({
  title,
  count,
  countTone = "neutral",
  rightLink,
  children,
  className = "",
}: RightPanelCardProps) {
  const countClass =
    countTone === "danger"
      ? "bg-red-50 text-red-700"
      : countTone === "warning"
        ? "bg-amber-50 text-amber-700"
        : "bg-earth-100 text-earth-700";
  return (
    <div className={`rounded-lg border border-earth-200 bg-white p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-earth-900">{title}</h3>
          {count != null && (
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1.5 text-xs font-semibold tabular-nums ${countClass}`}
            >
              {count}
            </span>
          )}
        </div>
        {rightLink && <div className="text-sm text-primary-600">{rightLink}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
