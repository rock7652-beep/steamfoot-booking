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
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-earth-900">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[11px] text-earth-500">{description}</p>
        ) : null}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
