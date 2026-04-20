import { DashboardLink as Link } from "@/components/dashboard-link";

/**
 * Settings Primitive — SettingsNavSection
 *
 * 設定首頁左欄分類區塊。視覺上是輕量 TOC，不是導航欄（不會 highlight active），
 * 只是讓店長一眼看到「目前設定分幾類、各類有什麼」。
 *
 * 每個 item 都是連結到對應的設定子頁；點擊後就是一般頁面跳轉。
 */

export interface SettingsNavItem {
  label: string;
  href: string;
}

interface SettingsNavSectionProps {
  title: string;
  items: SettingsNavItem[];
}

export function SettingsNavSection({ title, items }: SettingsNavSectionProps) {
  return (
    <div>
      <h3 className="px-2 text-[11px] font-semibold uppercase tracking-wider text-earth-400">
        {title}
      </h3>
      <ul className="mt-1.5 space-y-0.5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-md px-2 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50 hover:text-earth-900"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
