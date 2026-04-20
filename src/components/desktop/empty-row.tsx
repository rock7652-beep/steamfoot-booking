import { DashboardLink as Link } from "@/components/dashboard-link";

/**
 * Desktop Primitive — EmptyRow
 *
 * 替代舊 `components/ui/empty-state` 的大灰框版本。CTA 必給，不做純觀賞空狀態。
 *
 * 規格（對齊 design/04-phase2-plan.md §2.6）：
 *   py-8 center-aligned
 *   title: 14px earth-700
 *   hint: 11px earth-400
 *   cta: 小按鈕（可選）
 *
 * 使用時機：
 *   - DataTable empty 插槽
 *   - SideCard 空內容
 *   - Page-level 空狀態（需包一層 rounded border）
 */

interface EmptyRowProps {
  title: string;
  hint?: string;
  cta?: { label: string; href: string };
  /** 壓緊版：py-5；預設 py-8 */
  dense?: boolean;
}

export function EmptyRow({ title, hint, cta, dense = false }: EmptyRowProps) {
  return (
    <div className={`px-4 text-center ${dense ? "py-5" : "py-8"}`}>
      <p className="text-sm text-earth-700">{title}</p>
      {hint ? <p className="mt-1 text-[11px] text-earth-400">{hint}</p> : null}
      {cta ? (
        <Link
          href={cta.href}
          className="mt-2 inline-block rounded-md bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700"
        >
          {cta.label} →
        </Link>
      ) : null}
    </div>
  );
}
