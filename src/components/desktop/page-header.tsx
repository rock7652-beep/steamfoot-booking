/**
 * Desktop Primitive — PageHeader
 *
 * 統一的桌機頁面標頭。取代各頁「一大塊卡片當標題」的舊做法。
 *
 * 規格（對齊 design/04-phase2-plan.md §2.2）：
 *   左：title (lg bold earth-900) + subtitle (11px earth-500，可選)
 *   右：actions slot — ReactNode，通常放 2–3 顆次要按鈕
 *   整體：無卡片感、無背景色、僅保留少量下 padding
 *
 * 使用時機：
 *   - 所有 Decision / Operation / Hub 頁的第一個子元素
 *   - 禁止在 page.tsx 裡自己另寫 `<div className="... 白卡 + 圓角 ...">` 作為標題
 */

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** 右側 actions — 通常是 2–3 個 Link 或按鈕。不放主要 CTA（主 CTA 應該在頁內決策區） */
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col items-stretch gap-3 pb-1 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-earth-900">{title}</h1>
        {subtitle ? (
          <p className="text-[11px] text-earth-500">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5 self-start">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
