import type { ReactNode } from "react";
import { LINE_CARD_COLORS as colors } from "@/lib/line-card-theme";

// Preview shares the delivery palette; buttons are intentionally non-interactive.
export function LineCardPreview({ title, subtitle, children, actions }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions: { label: string; variant?: "primary" | "outline" | "link" | "cancel" }[];
}) {
  return <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-earth-200 bg-white shadow-sm">
    <div className="border-b p-4" style={{ backgroundColor: colors.headerBackground, color: colors.headerText, borderColor: colors.gold }}>
      <p className="font-semibold">蒸管家｜{title}</p>
      {subtitle && <p className="mt-1 text-xs" style={{ color: colors.headerSubtext }}>{subtitle}</p>}
    </div>
    <div className="space-y-3 whitespace-pre-wrap break-words p-4 text-sm leading-relaxed" style={{ color: colors.text }}>{children}</div>
    <div className="space-y-2 p-4 text-center text-sm" style={{ backgroundColor: colors.ivory }}>
      {actions.map(({ label, variant = "primary" }) => <div key={label} className="rounded-lg px-3 py-3 font-medium" style={{ backgroundColor: variant === "primary" ? colors.primary : variant === "outline" ? colors.background : "transparent", color: variant === "primary" ? colors.headerText : variant === "cancel" ? colors.cancel : colors.primary, border: variant === "outline" ? `1px solid ${colors.primary}` : undefined }}>{label}</div>)}
    </div>
  </div>;
}
