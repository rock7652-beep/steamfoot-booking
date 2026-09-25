"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CustomersTable, isInactiveRow, type CustomerRow } from "../customers/_components/customers-table";
import { BulkAssignBar } from "../customers/_components/bulk-assign-bar";
import { bulkAssignCourseCustomers } from "@/server/actions/course-customer-attribution";
import { CustomersToolbar } from "../customers/_components/customers-toolbar";
import { filterCourseCustomers } from "@/lib/course-customer-list";
import type { CourseCustomerPage } from "@/server/queries/course-customer-page";
import type { CourseCardView } from "./member-workspace";
import { DashboardLink } from "@/components/dashboard-link";

export function CourseCustomerList({ rows, cards, customerPage, canReadCards, onView, onCreate, onAssign, canAssignManager = false, assignmentStaff = [], canMerge = false }: {
  customerPage?: CourseCustomerPage;
  rows: CustomerRow[]; cards: CourseCardView[]; canReadCards: boolean;
  onView: (id: string) => void; onCreate?: () => void; onAssign?: (id: string) => void;
  canAssignManager?: boolean; assignmentStaff?: Array<{ id: string; displayName: string }>;
  canMerge?: boolean;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [selection, setSelection] = useState<{ scope: string; ids: Set<string> }>({ scope: "", ids: new Set() });
  const [result, setResult] = useState("");
  const scopeParams = new URLSearchParams(params.toString());
  scopeParams.delete("page");scopeParams.delete("customerId");
  const scope = scopeParams.toString();
  const selectedIds = selection.scope === scope ? selection.ids : new Set<string>();
  const setSelected = (ids: Set<string>) => setSelection({ scope, ids });
  const points = new Map<string, number>();
  const sessions = new Map<string, number>();
  for (const card of cards) for (const member of card.members) {
    const balances = card.unit === "SESSION" ? sessions : points;
    balances.set(member.id, (balances.get(member.id) ?? 0) + card.available);
  }
  for (const row of customerPage?.rows ?? []) { points.set(row.id,row.points); sessions.set(row.id,row.sessions); }
  const filtered = customerPage ? customerPage.rows.flatMap(item => { const row=rows.find(r=>r.id===item.id); return row ? [row] : []; }) : filterCourseCustomers(rows, new URLSearchParams(params.toString()), points);
  const total = customerPage?.total ?? filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / 20));
  const requestedPage = Number(params.get("page"));
  const page = customerPage?.page ?? Math.min(pageCount, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const setPage = (value: number) => {
    const next = new URLSearchParams(params.toString()); next.set("page", String(value));
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const staff = [...new Map(rows.flatMap(row => row.assignedStaff ? [[row.assignedStaff.id, row.assignedStaff] as const] : [])).values()];
  const pageRows = customerPage ? filtered : filtered.slice((page - 1) * 20, page * 20);
  return <section className={`space-y-3 ${selectedIds.size ? "pb-40" : ""}`}>
    <CustomersToolbar staffOptions={assignmentStaff.length ? assignmentStaff : staff} basePath="/dashboard/courses?view=customers" courseMode />
    {canMerge && <DashboardLink href="/dashboard/customers/merge" className="inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3 text-sm text-primary-700">處理重複顧客</DashboardLink>}
    <p className="text-xs text-earth-500">最近上課依已完成出席記錄。可用額度已扣除預約占用；共卡額度由授權成員共用。</p>
    {result && <p role="status" className="text-sm text-earth-700">{result}</p>}
    <CustomersTable stickyActions rows={pageRows}
      selectionEnabled={canAssignManager} selectedIds={selectedIds}
      onToggleRow={id => { const next = new Set(selectedIds); if (next.has(id)) next.delete(id); else next.add(id); setSelected(next); }}
      onToggleAll={() => { const ids = pageRows.filter(row => !isInactiveRow(row)).map(row => row.id); const next=new Set(selectedIds); if(ids.every(id=>next.has(id)))ids.forEach(id=>next.delete(id));else ids.forEach(id=>next.add(id));setSelected(next); }}
      basePath="/dashboard/courses?view=customers" searchQuery={params.get("search") ?? ""}
      hasActiveFilters={["search", "status", "visit", "referral", "staff"].some(key => !!params.get(key))}
      onView={row => onView(row.id)} onCreate={onCreate} readOnly={!onCreate && !canAssignManager && !onAssign}
      quickAssignLabel="購買方案"
      onQuickAssign={onAssign ? row => onAssign(row.id) : undefined}
      buildViewHref={row => { const next = new URLSearchParams(params.toString()); next.set("customerId", row.id); return `${pathname}?${next}`; }}
      lastVisitLabel="最近上課"
      balanceColumn={{ label: "可用額度", render: row => canReadCards
        ? <span className="text-sm">{points.get(row.id) ?? 0} 點 · {sessions.get(row.id) ?? 0} 堂</span>
        : <span className="text-xs text-earth-400">無檢視權限</span> }} />
    {pageCount > 1 && <nav aria-label="顧客分頁" className="flex items-center justify-end gap-3 text-sm">
      <span>共 {total} 人 · 第 {page}／{pageCount} 頁</span>
      <button className="min-h-11 rounded-lg border px-3 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</button>
      <button className="min-h-11 rounded-lg border px-3 disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>下一頁</button>
    </nav>}
    {canAssignManager && selectedIds.size > 0 && <BulkAssignBar inlineConfirmation selectedCount={selectedIds.size} staffOptions={assignmentStaff}
      onCancel={() => setSelected(new Set())}
      onSubmit={async assignedStaffId => {
        const response = await bulkAssignCourseCustomers({ customerIds: [...selectedIds], assignedStaffId });
        if (!response.success) { setResult(response.error ?? "本批未儲存，請重試。"); return false; }
        setResult(`已指派 ${response.data.count} 位顧客，推薦人與既有方案不變。`);
        setSelected(new Set()); router.refresh();
      }} />}
  </section>;
}
