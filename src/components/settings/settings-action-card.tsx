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
  onPrimaryAction?: () => void;
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
  onPrimaryAction,
  primaryLabel = "進入設定",
  secondaryHref,
  secondaryLabel,
}: SettingsActionCardProps) {
  return (
    <section className="rounded-xl border border-earth-200 bg-white p-3 shadow-sm transition hover:border-earth-300 hover:bg-earth-50/30">
      <header className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-earth-50 text-earth-500">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
            width={16}
            height={16}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-earth-900">{title}</h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-earth-500">
            {description}
          </p>
        </div>
        {onPrimaryAction ? <button type="button" onClick={onPrimaryAction} className="min-h-10 min-w-24 shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-200">{primaryLabel}</button> : <Link
          href={primaryHref}
          className="min-h-10 min-w-24 shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-200"
        >
          {primaryLabel}
        </Link>}
      </header>

      {summary ? (
        <div className="mt-2 border-t border-earth-100 pt-2">{summary}</div>
      ) : null}

      {secondaryHref && secondaryLabel ? (
        <div className="mt-1 flex justify-end">
          <Link
            href={secondaryHref}
            className="text-xs text-earth-500 hover:text-earth-700 hover:underline"
          >
            {secondaryLabel} →
          </Link>
        </div>
      ) : null}
    </section>
  );
}
