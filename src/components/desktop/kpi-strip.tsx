/**
 * Desktop Primitive — KpiStrip
 *
 * 去卡片化的 inline KPI row。取代 `components/ui/kpi-card` 的大色塊卡 grid。
 *
 * 規格（對齊 design/04-phase2-plan.md §2.3）：
 *   h-10, border-b, 項目間用 ｜ 分隔
 *   label 11px earth-500，value 15px bold tabular-nums + tone 色
 *   tone: amber | green | blue | primary | earth（沿用 production token）
 *
 * 使用時機：
 *   - Decision Page：放在 PageHeader 下面，接著主要 table 或主區
 *   - 禁止再用 `components/ui/kpi-card` 的大卡 grid 呈現 KPI
 *
 * 前身：`growth/_components/kpi-inline.tsx`（Phase 2 泛化後該檔可 deprecate；
 * 本 PR 已將成長頁切過來用這支）。
 */

export type KpiTone = "amber" | "green" | "blue" | "primary" | "earth";

export interface KpiStripItem {
  label: string;
  value: number | string;
  /** 重點數字用色；次要指標留 earth */
  tone?: KpiTone;
}

interface KpiStripProps {
  items: KpiStripItem[];
}

const TONE_MAP: Record<KpiTone, string> = {
  amber: "text-amber-700",
  green: "text-green-700",
  blue: "text-blue-700",
  primary: "text-primary-700",
  earth: "text-earth-900",
};

export function KpiStrip({ items }: KpiStripProps) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-earth-200 bg-earth-200 text-sm sm:flex sm:h-10 sm:items-center sm:gap-x-1 sm:overflow-x-auto sm:rounded-none sm:border-x-0 sm:border-t-0 sm:bg-transparent">
      {items.map((it, i) => {
        const toneClass = TONE_MAP[it.tone ?? "earth"];
        return (
          <div key={it.label} className="flex min-h-[76px] flex-col justify-center gap-1 bg-white px-3 sm:min-h-0 sm:flex-row sm:items-center sm:gap-1 sm:bg-transparent sm:px-0 sm:whitespace-nowrap">
            {i > 0 && <span className="hidden px-2 text-earth-200 sm:inline">｜</span>}
            <span className="text-[10px] text-earth-500 sm:text-[11px]">{it.label}</span>
            <span className={`text-lg font-bold tabular-nums sm:text-[15px] ${toneClass}`}>
              {it.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
