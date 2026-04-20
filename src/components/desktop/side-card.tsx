import { DashboardLink as Link } from "@/components/dashboard-link";

/**
 * Desktop Primitive — SideCard
 *
 * Decision Page 右側 col-4 的行動區單元（今日該做 / mini table / 快速操作 等）。
 *
 * 規格（對齊 design/04-phase2-plan.md §2.5）：
 *   rounded-xl border border-earth-200 bg-white
 *   header: h3 xs semibold + subtitle 10px earth-400 + action link（可選）
 *   body: children
 *
 * 使用時機：
 *   - 決策頁右側小卡
 *   - 禁止用 `components/ui/section-card`（那是大卡片版）
 */

interface SideCardProps {
  title: string;
  subtitle?: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  /** 沒有內容邊距（要 header 緊貼 table 時用） */
  flush?: boolean;
  className?: string;
}

export function SideCard({
  title,
  subtitle,
  action,
  children,
  flush = false,
  className,
}: SideCardProps) {
  return (
    <section
      className={`rounded-xl border border-earth-200 bg-white ${className ?? ""}`}
    >
      <div
        className={`flex items-center justify-between px-3 py-2 ${
          flush ? "border-b border-earth-100" : ""
        }`}
      >
        <div>
          <h3 className="text-xs font-semibold text-earth-800">{title}</h3>
          {subtitle ? (
            <p className="text-[10px] text-earth-400">{subtitle}</p>
          ) : null}
        </div>
        {action ? (
          <Link
            href={action.href}
            className="text-[11px] text-primary-600 hover:text-primary-700"
          >
            {action.label} →
          </Link>
        ) : null}
      </div>
      <div className={flush ? "" : "px-3 pb-2.5"}>{children}</div>
    </section>
  );
}
