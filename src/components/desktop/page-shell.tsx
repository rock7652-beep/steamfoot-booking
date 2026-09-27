/**
 * Desktop Primitive — PageShell
 *
 * 後台桌機版「頁面最外層容器」。取代各頁各自寫的 `mx-auto max-w-... px-... py-...`。
 *
 * 規格：
 *   填滿後台內容區；左右邊距由 DashboardShell 管理
 *   flex col, gap: 16px
 *
 * 使用時機：
 *   - Decision Page / Operation Page / Hub Page 三大頁型的最外層
 *   - 不要再在 page.tsx 裡寫 `<div className="mx-auto max-w-...">`
 *
 * 表單等需要閱讀寬度的頁面可覆寫 className。
 */

interface PageShellProps {
  children: React.ReactNode;
  /** 極罕見情況覆寫 layout。一般情況不要用 */
  className?: string;
}

export function PageShell({ children, className }: PageShellProps) {
  return (
    <div
      data-page-shell
      className={
        className ??
        "flex w-full min-w-0 flex-col gap-4 py-6"
      }
    >
      {children}
    </div>
  );
}
