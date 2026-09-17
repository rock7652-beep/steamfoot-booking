"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CustomersTable, type CustomerRow } from "../customers/_components/customers-table";
import { CustomersToolbar } from "../customers/_components/customers-toolbar";
import { filterCourseCustomers } from "@/lib/course-customer-list";
import type { CourseCardView } from "./member-workspace";

export function CourseCustomerList({ rows, cards, canReadCards, onView, onCreate, onAssign }: {
  rows: CustomerRow[]; cards: CourseCardView[]; canReadCards: boolean;
  onView: (id: string) => void; onCreate?: () => void; onAssign?: (id: string) => void;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const points = new Map<string, number>();
  const sessions = new Map<string, number>();
  for (const card of cards) for (const member of card.members) {
    const balances = card.unit === "SESSION" ? sessions : points;
    balances.set(member.id, (balances.get(member.id) ?? 0) + card.available);
  }
  const filtered = filterCourseCustomers(rows, new URLSearchParams(params.toString()), points);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const requestedPage = Number(params.get("page"));
  const page = Math.min(pageCount, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const setPage = (value: number) => {
    const next = new URLSearchParams(params.toString()); next.set("page", String(value));
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const staff = [...new Map(rows.flatMap(row => row.assignedStaff ? [[row.assignedStaff.id, row.assignedStaff] as const] : [])).values()];
  return <section className="space-y-3">
    <CustomersToolbar staffOptions={staff} basePath="/dashboard/courses?view=customers" courseMode />
    <p className="text-xs text-earth-500">最近上課依已完成出席記錄。可用額度已扣除預約占用；共卡額度由授權成員共用。</p>
    <CustomersTable stickyActions rows={filtered.slice((page - 1) * 20, page * 20)}
      basePath="/dashboard/courses?view=customers" searchQuery={params.get("search") ?? ""}
      hasActiveFilters={["search", "status", "visit", "referral", "staff"].some(key => !!params.get(key))}
      onView={row => onView(row.id)} onCreate={onCreate} readOnly={!onCreate}
      onQuickAssign={onAssign ? row => onAssign(row.id) : undefined}
      buildViewHref={row => { const next = new URLSearchParams(params.toString()); next.set("customerId", row.id); return `${pathname}?${next}`; }}
      lastVisitLabel="最近上課"
      balanceColumn={{ label: "可用額度", render: row => canReadCards
        ? <span className="text-sm">{points.get(row.id) ?? 0} 點 · {sessions.get(row.id) ?? 0} 堂</span>
        : <span className="text-xs text-earth-400">無檢視權限</span> }} />
    {pageCount > 1 && <nav aria-label="顧客分頁" className="flex items-center justify-end gap-3 text-sm">
      <span>共 {filtered.length} 人 · 第 {page}／{pageCount} 頁</span>
      <button className="min-h-11 rounded-lg border px-3 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</button>
      <button className="min-h-11 rounded-lg border px-3 disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>下一頁</button>
    </nav>}
  </section>;
}
