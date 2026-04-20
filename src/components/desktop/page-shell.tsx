/**
 * Desktop Primitive — PageShell
 *
 * 後台桌機版「頁面最外層容器」。取代各頁各自寫的 `mx-auto max-w-... px-... py-...`。
 *
 * 規格（對齊 design/04-phase2-plan.md §2.1）：
 *   max-width: 1440px
 *   mx-auto
 *   padding: 24px
 *   flex col, gap: 16px
 *
 * 使用時機：
 *   - Decision Page / Operation Page / Hub Page 三大頁型的最外層
 *   - 不要再在 page.tsx 裡寫 `<div className="mx-auto max-w-...">`
 *
 * 若頁面需要不同 gap，可覆寫 className（rare case）。
 */

interface PageShellProps {
  children: React.ReactNode;
  /** 極罕見情況覆寫 layout。一般情況不要用 */
  className?: string;
}

export function PageShell({ children, className }: PageShellProps) {
  return (
    <div
      className={
        className ??
        "mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6"
      }
    >
      {children}
    </div>
  );
}
