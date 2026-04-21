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
  const h = size === "inline" ? "min-h-[160px]" : "min-h-[240px]";
  return (
    <div
      className={`flex ${h} flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-earth-200 bg-earth-50 px-6 py-8 text-center`}
    >
      {icon && <div className="text-earth-400">{icon}</div>}
      <p className="text-base font-semibold text-earth-800">{title}</p>
      {hint && <p className="text-sm text-earth-700">{hint}</p>}
      {cta && <div className="mt-2">{cta}</div>}
    </div>
  );
}
