/**
 * Desktop Primitive — FormGrid
 *
 * 兩欄 grid，手機自動落回單欄。FormSection 內一般用 2 欄排 半寬欄位
 * （例如：姓名/電話、性別/生日）。
 *
 * 若某欄要跨 2 欄，對 child 加 `className="md:col-span-2"` 即可。
 */

interface FormGridProps {
  children: React.ReactNode;
  className?: string;
}

export function FormGrid({ children, className }: FormGridProps) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 md:grid-cols-2${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
