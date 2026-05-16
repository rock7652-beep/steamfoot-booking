import { DashboardLink as Link } from "@/components/dashboard-link";
import type { StoreTodoItem, StoreTodoType } from "@/server/queries/store-todos";
import { dismissTodoFormAction } from "@/server/actions/todo-dismiss";

interface StoreTodoCardProps {
  items: StoreTodoItem[];
  total: number;
}

const TYPE_BADGE: Record<StoreTodoType, string> = {
  PAYMENT: "bg-amber-100 text-amber-800",
  BOOKING: "bg-blue-100 text-blue-800",
  FOLLOW_UP: "bg-earth-100 text-earth-700",
  LOW_SESSIONS: "bg-orange-100 text-orange-800",
};

export function StoreTodoCard({ items, total }: StoreTodoCardProps) {
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-earth-200 bg-earth-50/40 px-4 py-3">
        <header className="mb-1">
          <h2 className="text-sm font-semibold text-earth-800">今天待處理</h2>
          <p className="text-[11px] text-earth-400">店長今天最重要的事</p>
        </header>
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-earth-600">
            今天目前沒有急件，系統狀態很穩定。
          </p>
          <Link
            href="/dashboard/bookings/new"
            className="shrink-0 rounded-md border border-earth-200 bg-white px-3 py-1 text-[11px] font-medium text-earth-700 hover:bg-earth-50"
          >
            ＋ 新增預約
          </Link>
        </div>
      </section>
    );
  }

  const remaining = total - items.length;

  return (
    <section className="rounded-xl border border-earth-200 bg-white">
      <header className="border-b border-earth-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-earth-800">今天待處理</h2>
        <p className="text-[11px] text-earth-400">店長今天最重要的事</p>
      </header>
      <ul className="divide-y divide-earth-100">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 px-4 py-2.5"
          >
            {/* 左側「我已知悉」圈圈：點擊 → dismissTodo → 該筆從本人首頁消失。
                狀態改變（回訪 / 補堂 / 收款確認 / 過今天）→ todoKey 變 → 重新出現 */}
            <form action={dismissTodoFormAction} className="shrink-0">
              <input type="hidden" name="todoKey" value={item.id} />
              <input type="hidden" name="todoType" value={item.type} />
              <button
                type="submit"
                aria-label={`標記「${item.message}」為已知悉`}
                title="標記為已知悉（從首頁收起）"
                className="flex h-4 w-4 items-center justify-center rounded-full border border-earth-300 text-transparent hover:border-primary-500 hover:bg-primary-50 hover:text-primary-600"
              >
                <span aria-hidden className="text-[10px] leading-none">✓</span>
              </button>
            </form>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE[item.type]}`}
            >
              {item.label}
            </span>
            <p className="min-w-0 flex-1 truncate text-xs text-earth-800">
              {item.message}
            </p>
            <Link
              href={item.href}
              className="shrink-0 rounded-md border border-earth-200 bg-white px-3 py-1 text-[11px] font-medium text-earth-700 hover:bg-earth-50"
            >
              {item.actionLabel}
            </Link>
          </li>
        ))}
      </ul>
      {remaining > 0 ? (
        <footer className="flex items-center justify-between border-t border-earth-100 px-4 py-2">
          <p className="text-[11px] text-earth-500">還有 {remaining} 件待處理</p>
          <Link
            href="/dashboard/customers"
            className="text-[11px] text-primary-600 hover:text-primary-700"
          >
            查看全部 →
          </Link>
        </footer>
      ) : null}
    </section>
  );
}
