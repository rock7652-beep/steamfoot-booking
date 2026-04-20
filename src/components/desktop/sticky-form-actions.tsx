/**
 * Desktop Primitive — StickyFormActions
 *
 * 固定貼底的浮動動作列，避免長表單看不到儲存按鈕。以「圓角浮條」風格呈現
 * （而非全寬 bar），視覺比較輕。
 *
 * 使用方式：放在 `<form>` 的最後一個子元素。外層 form 記得留下方 padding
 * （例如 `pb-4`）避免 sticky 和最後欄位黏太近。
 */

interface StickyFormActionsProps {
  children: React.ReactNode;
  /** 左側可選文字說明（例如提示、最後修改時間） */
  info?: React.ReactNode;
}

export function StickyFormActions({ children, info }: StickyFormActionsProps) {
  return (
    <div className="sticky bottom-4 z-10">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-earth-200 bg-white/95 px-4 py-3 shadow-md backdrop-blur">
        <div className="min-w-0 text-xs text-earth-500">{info ?? null}</div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
