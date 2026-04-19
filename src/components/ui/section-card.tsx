/**
 * Design System — Section Card
 *
 * 統一的區塊容器，用於 Dashboard 各 section。
 * 包含標題、副標題、右上角動作連結。
 */

import { DashboardLink as Link } from "@/components/dashboard-link";

interface SectionCardProps {
  title: string;
  subtitle?: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}

export function SectionCard({ title, subtitle, action, children, className }: SectionCardProps) {
  return (
    <section className={`rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${className ?? ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-earth-800">{title}</h3>
          {subtitle && <p className="text-[11px] text-earth-400">{subtitle}</p>}
        </div>
        {action && (
          <Link
            href={action.href}
            className="text-xs text-primary-600 hover:text-primary-700"
          >
            {action.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
