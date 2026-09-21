/**
 * Desktop Primitive — FormSection
 *
 * 一個具標題的表單區塊，視覺上是白卡 + padding，標題走 section header 層級
 * （比 PageHeader 小一階），避免整頁變得像一條長表單。
 */

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** 彈出式快速表單使用：移除卡片外框，只保留清楚的欄位分組。 */
  compact?: boolean;
}

export function FormSection({ title, description, children, compact = false }: FormSectionProps) {
  return (
    <section
      className={
        compact
          ? "border-b border-earth-100 pb-4 last:border-b-0 last:pb-0"
          : "rounded-xl border border-earth-200 bg-white p-5 shadow-sm"
      }
    >
      <header className={compact ? "mb-3" : "mb-4"}>
        <h2 className="text-sm font-semibold text-earth-900">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[11px] text-earth-500">{description}</p>
        ) : null}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
