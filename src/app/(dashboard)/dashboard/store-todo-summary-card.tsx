import { DashboardLink as Link } from "@/components/dashboard-link";
import { SideCard } from "@/components/desktop";
import type { StoreTodoItem, StoreTodoType } from "@/server/queries/store-todos";

/**
 * 首頁「今天待處理」摘要卡（PR-2C 三欄版）
 *
 * 三分之一寬的精簡版:只顯示總數 + 前 2 筆(可點進該筆處理) + 剩餘件數。
 * 不含 dismiss / 展開全部 — 完整待辦互動仍在原 StoreTodoCard(本頁改用摘要版,
 * 不在此 PR 做完整任務管理)。純呈現,不寫 DB。
 */

const PREVIEW_N = 2;

const TYPE_BADGE: Record<StoreTodoType, string> = {
  PAYMENT: "bg-amber-100 text-amber-800",
  BOOKING: "bg-blue-100 text-blue-800",
  FOLLOW_UP: "bg-earth-100 text-earth-700",
  LOW_SESSIONS: "bg-orange-100 text-orange-800",
};

export function StoreTodoSummaryCard({ items }: { items: StoreTodoItem[] }) {
  const total = items.length;

  if (total === 0) {
    return (
      <SideCard title="今天待處理">
        <p className="text-xs text-earth-700">今天目前沒有急件</p>
        <p className="text-[11px] text-earth-400">系統狀態很穩定</p>
      </SideCard>
    );
  }

  const preview = items.slice(0, PREVIEW_N);
  const hidden = total - preview.length;

  return (
    <SideCard title="今天待處理" subtitle={`共 ${total} 件`}>
      <ul className="space-y-1.5">
        {preview.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE[item.type]}`}
            >
              {item.label}
            </span>
            <Link
              href={item.href}
              className="min-w-0 flex-1 truncate text-xs text-earth-800 hover:text-primary-700"
            >
              {item.message}
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="mt-1.5 text-[11px] text-earth-400">還有 {hidden} 件待處理</p>
      ) : null}
    </SideCard>
  );
}
