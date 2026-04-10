/**
 * Design System — KPI Card
 *
 * 統一的 KPI 指標卡片，用於 Dashboard、Ops Dashboard 等頁面。
 * 支援前期比較（change prop）：正數綠色 ↑，負數紅色 ↓。
 */

const COLOR_MAP = {
  primary: { bg: "bg-primary-50", text: "text-primary-700", label: "text-primary-600" },
  green: { bg: "bg-green-50", text: "text-green-700", label: "text-green-600" },
  blue: { bg: "bg-blue-50", text: "text-blue-700", label: "text-blue-600" },
  red: { bg: "bg-red-50", text: "text-red-600", label: "text-red-500" },
  amber: { bg: "bg-amber-50", text: "text-amber-700", label: "text-amber-600" },
  earth: { bg: "bg-earth-50", text: "text-earth-800", label: "text-earth-500" },
} as const;

export type KpiColor = keyof typeof COLOR_MAP;

interface KpiCardProps {
  label: string;
  value: number | string;
  unit?: string;
  color?: KpiColor;
  /** 前期比較 — value 為差值或百分比，label 為說明（如「vs 上週」） */
  change?: { value: number; label: string } | null;
}

export function KpiCard({ label, value, unit, color = "primary", change }: KpiCardProps) {
  const c = COLOR_MAP[color];

  return (
    <div className={`rounded-xl px-3 py-2.5 ${c.bg}`}>
      <p className={`text-[11px] ${c.label}`}>{label}</p>
      <p className={`text-xl font-bold ${c.text}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal opacity-60">{unit}</span>}
      </p>
      {change != null && change.value !== 0 && (
        <p className="mt-0.5 text-[10px]">
          <span className={change.value > 0 ? "text-green-600" : "text-red-500"}>
            {change.value > 0 ? "↑" : "↓"}
            {Math.abs(change.value)}
          </span>
          <span className="ml-1 text-earth-400">{change.label}</span>
        </p>
      )}
    </div>
  );
}
