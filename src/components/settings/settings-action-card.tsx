import { DashboardLink as Link } from "@/components/dashboard-link";

/**
 * Settings Primitive — SettingsActionCard
 *
 * 設定首頁中間主卡。核心設計：先讀狀態、再看入口。
 *
 *   [icon] 標題                          [primaryAction]
 *          描述
 *          ─────────────
 *          summary 區（狀態清單）
 *          ─────────────
 *          secondary link（選填）
 *
 * Props：
 *   title          — 卡片標題（例：人員管理）
 *   description    — 一行描述
 *   iconPath       — SVG path data（沿用 hub 原本用的 24x24 icons）
 *   summary        — React node；通常是 <InfoList items=[...]/> 或簡短 JSX
 *   primaryHref    — 主按鈕連結
 *   primaryLabel   — 主按鈕文字（預設「進入設定」）
 *   secondaryHref  — 次入口連結（選填）
 *   secondaryLabel — 次入口文字
 */

interface SettingsActionCardProps {
  title: string;
  description: string;
  iconPath: string;
  summary?: React.ReactNode;
  primaryHref: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

export function SettingsActionCard({
  title,
  description,
  iconPath,
  summary,
  primaryHref,
  primaryLabel = "進入設定",
  secondaryHref,
  secondaryLabel,
}: SettingsActionCardProps) {
  return (
    <section className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm transition hover:border-earth-300">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-earth-50 text-earth-500">
          <svg
            className="h-4.5 w-4.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
            width={18}
            height={18}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-earth-900">{title}</h3>
          <p className="mt-0.5 text-[11px] text-earth-500">{description}</p>
        </div>
        <Link
          href={primaryHref}
          className="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
        >
          {primaryLabel}
        </Link>
      </header>

      {summary ? (
        <div className="mt-3 border-t border-earth-100 pt-3">{summary}</div>
      ) : null}

      {secondaryHref && secondaryLabel ? (
        <div className="mt-2 flex justify-end">
          <Link
            href={secondaryHref}
            className="text-[11px] text-earth-500 hover:text-earth-700 hover:underline"
          >
            {secondaryLabel} →
          </Link>
        </div>
      ) : null}
    </section>
  );
}
