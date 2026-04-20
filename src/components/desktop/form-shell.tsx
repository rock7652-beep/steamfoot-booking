/**
 * Desktop Primitive — FormShell
 *
 * 桌機版 form 外層容器：集中寬度限制 + 區塊垂直間距，讓 page.tsx 不用
 * 再寫 `mx-auto max-w-... space-y-...`。
 *
 * 搭配 FormSection / FormGrid / StickyFormActions 使用。
 */

interface FormShellProps {
  children: React.ReactNode;
  /** md=1200px（預設，顧客表單）、lg=1280px（預約等較寬表單） */
  width?: "md" | "lg";
}

export function FormShell({ children, width = "md" }: FormShellProps) {
  const widthClass = width === "lg" ? "max-w-[1280px]" : "max-w-[1200px]";
  return (
    <div className={`mx-auto w-full ${widthClass} space-y-6`}>{children}</div>
  );
}
