import type { ReactNode } from "react";

interface EmptyStateCompactProps {
  icon?: ReactNode;
  title: string;
  hint?: string;
  cta?: ReactNode;
  size?: "inline" | "section";
}

export function EmptyStateCompact({
  icon,
  title,
  hint,
  cta,
  size = "inline",
}: EmptyStateCompactProps) {
  const h = size === "inline" ? "min-h-[140px]" : "min-h-[220px]";
  return (
    <div
      className={`flex ${h} flex-col items-center justify-center gap-2 rounded-md border border-dashed border-earth-200 bg-earth-50 px-6 py-6 text-center`}
    >
      {icon && <div className="text-earth-300">{icon}</div>}
      <p className="text-sm font-semibold text-earth-700">{title}</p>
      {hint && <p className="text-xs text-earth-500">{hint}</p>}
      {cta && <div className="mt-1">{cta}</div>}
    </div>
  );
}
