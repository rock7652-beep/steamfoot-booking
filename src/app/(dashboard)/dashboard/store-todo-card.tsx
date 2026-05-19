import { DashboardLink as Link } from "@/components/dashboard-link";
import type { StoreTodoItem } from "@/server/queries/store-todos";
import { StoreTodoList } from "./store-todo-list";

interface StoreTodoCardProps {
  /** 已過濾 dismissed、已去重、已排序的完整待辦清單；前 N 筆呈現由 list 處理 */
  items: StoreTodoItem[];
}

export function StoreTodoCard({ items }: StoreTodoCardProps) {
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

  return (
    <section className="rounded-xl border border-earth-200 bg-white">
      <header className="border-b border-earth-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-earth-800">今天待處理</h2>
        <p className="text-[11px] text-earth-400">店長今天最重要的事</p>
      </header>
      <StoreTodoList items={items} />
    </section>
  );
}
