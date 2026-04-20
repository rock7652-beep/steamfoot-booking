/**
 * 成長系統 v2 — Inline KPI Row
 *
 * 桌機版重畫 v2.0：去卡片化，把 KPI 壓成一行 inline。
 * 高度 ≤ 48px，數字加粗，項目間用 ｜ 分隔。
 * 不允許再用大型 KPI 卡。
 */

interface KpiItem {
  label: string;
  value: number;
  /** 重點數字才上色（高潛力 / 可升級 用 amber/green），其餘用 earth */
  tone?: "amber" | "green" | "blue" | "primary" | "earth";
}

interface Props {
  items: KpiItem[];
}

const TONE_MAP = {
  amber: "text-amber-700",
  green: "text-green-700",
  blue: "text-blue-700",
  primary: "text-primary-700",
  earth: "text-earth-900",
} as const;

export function GrowthKpiInline({ items }: Props) {
  return (
    <div className="flex h-10 items-center gap-x-1 overflow-x-auto border-b border-earth-200 text-sm">
      {items.map((it, i) => {
        const toneClass = TONE_MAP[it.tone ?? "earth"];
        return (
          <div key={it.label} className="flex items-center gap-1 whitespace-nowrap">
            {i > 0 && <span className="px-2 text-earth-200">｜</span>}
            <span className="text-[11px] text-earth-500">{it.label}</span>
            <span className={`text-[15px] font-bold tabular-nums ${toneClass}`}>{it.value}</span>
          </div>
        );
      })}
    </div>
  );
}
