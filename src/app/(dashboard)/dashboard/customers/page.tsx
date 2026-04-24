import { listCustomers } from "@/server/queries/customer";
import { listStaffSelectOptions } from "@/server/queries/staff";
import { listPlans } from "@/server/queries/plan";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { FormSuccessToast } from "@/components/form-success-toast";
import type { CustomerStage } from "@prisma/client";

import { CustomersToolbar } from "./_components/customers-toolbar";
import { CustomersListWithDrawer } from "./_components/customers-list-with-drawer";
import type { CustomerRow } from "./_components/customers-table";
import type {
  CustomerListStatus,
  CustomerListVisit,
  CustomerListReferral,
  CustomerListSort,
} from "@/server/queries/customer";

/**
 * 顧客管理 — Operation Page（Phase 2 桌機版重構 PR1）
 *
 * 對照 design/04-phase2-plan.md §3②：
 *   PageShell → PageHeader → Toolbar → DataTable → Pagination
 *
 * 權限：需 `customer.read`；無權限導回 `/dashboard`。
 */
interface PageProps {
  searchParams: Promise<{
    // 新版 toolbar 支援的參數
    status?: string;
    visit?: string;
    referral?: string;
    sort?: string;
    // 既有保留
    stage?: CustomerStage;
    search?: string;
    staff?: string;
    page?: string;
  }>;
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);

  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const [{ customers, total, pageSize }, staffOptions, plans, canDiscount] = await Promise.all([
    listCustomers({
      stage: params.stage,
      status: normalizeStatus(params.status),
      visit: normalizeVisit(params.visit),
      referral: normalizeReferral(params.referral),
      search: params.search,
      assignedStaffId: params.staff,
      sort: normalizeSort(params.sort),
      page,
      pageSize: 20,
      activeStoreId,
    }),
    listStaffSelectOptions(activeStoreId),
    // PR-5.5：快速指派 drawer 需要的資料
    listPlans().catch(() => []),
    checkPermission(user.role, user.staffId, "transaction.discount").catch(() => false),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilters = !!(
    params.search ||
    params.status ||
    params.visit ||
    params.referral ||
    params.staff ||
    params.stage
  );

  // 語意 basePath — 由 DashboardLink 於 render 時 prefix 為實際的 /hq/.. 或 /s/{slug}/admin/..
  const basePath = "/dashboard/customers";

  const rows: CustomerRow[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    lineName: c.lineName,
    customerStage: c.customerStage,
    lineLinkStatus: c.lineLinkStatus,
    lastVisitAt: c.lastVisitAt,
    createdAt: c.createdAt,
    totalPoints: c.totalPoints,
    sponsoredCount: c.sponsoredCount,
    sponsor: c.sponsor ? { id: c.sponsor.id, name: c.sponsor.name } : null,
    assignedStaff: c.assignedStaff,
  }));

  return (
    <PageShell>
      <FormSuccessToast />
      <PageHeader
        title="顧客管理"
        subtitle="查詢顧客、追蹤來店、快速進入詳情"
        actions={
          <>
            <Link
              href="/api/export/customers"
              className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              匯出
            </Link>
            <Link
              href="/dashboard/customers/new"
              className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700"
            >
              + 新增顧客
            </Link>
          </>
        }
      />

      <CustomersToolbar staffOptions={staffOptions} basePath={basePath} />

      <div className="flex items-center justify-between text-[11px] text-earth-500">
        <span>共 {total} 位顧客{hasActiveFilters ? "（已套用篩選）" : ""}</span>
        {totalPages > 1 ? (
          <span>
            第 {page} / {totalPages} 頁
          </span>
        ) : null}
      </div>

      <CustomersListWithDrawer
        rows={rows}
        searchQuery={params.search}
        hasActiveFilters={hasActiveFilters}
        basePath={basePath}
        plans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          price: Number(p.price),
          sessionCount: p.sessionCount,
        }))}
        canDiscount={canDiscount}
      />

      {totalPages > 1 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          params={params}
          basePath={basePath}
        />
      ) : null}
    </PageShell>
  );
}

// ============================================================
// Helpers
// ============================================================

function normalizeStatus(v?: string): CustomerListStatus | undefined {
  return v === "linked" || v === "unlinked" || v === "lead" || v === "customer"
    ? v
    : undefined;
}

function normalizeVisit(v?: string): CustomerListVisit | undefined {
  return v === "month" || v === "stale30" || v === "never" ? v : undefined;
}

function normalizeReferral(v?: string): CustomerListReferral | undefined {
  return v === "has" || v === "none" ? v : undefined;
}

function normalizeSort(v?: string): CustomerListSort | undefined {
  return v === "recent" || v === "created" || v === "points" ? v : undefined;
}

// ============================================================
// Pagination — 與 toolbar 用同一組 URL params，不會互相覆蓋
// ============================================================

interface PaginationParams {
  search?: string;
  status?: string;
  visit?: string;
  referral?: string;
  sort?: string;
  stage?: CustomerStage;
  staff?: string;
}

function Pagination({
  page,
  totalPages,
  params,
  basePath,
}: {
  page: number;
  totalPages: number;
  params: PaginationParams;
  basePath: string;
}) {
  const buildHref = (p: number) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.status) qs.set("status", params.status);
    if (params.visit) qs.set("visit", params.visit);
    if (params.referral) qs.set("referral", params.referral);
    if (params.sort) qs.set("sort", params.sort);
    if (params.stage) qs.set("stage", params.stage);
    if (params.staff) qs.set("staff", params.staff);
    qs.set("page", String(p));
    return `${basePath}?${qs.toString()}`;
  };

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  const base =
    "rounded-md border px-3 py-1 text-xs font-medium transition-colors";

  return (
    <div className="flex items-center justify-end gap-2">
      {prevDisabled ? (
        <span className={`${base} cursor-not-allowed border-earth-100 text-earth-300`}>
          上一頁
        </span>
      ) : (
        <Link
          href={buildHref(page - 1)}
          className={`${base} border-earth-200 bg-white text-earth-700 hover:bg-earth-50`}
        >
          上一頁
        </Link>
      )}
      {nextDisabled ? (
        <span className={`${base} cursor-not-allowed border-earth-100 text-earth-300`}>
          下一頁
        </span>
      ) : (
        <Link
          href={buildHref(page + 1)}
          className={`${base} border-earth-200 bg-white text-earth-700 hover:bg-earth-50`}
        >
          下一頁
        </Link>
      )}
    </div>
  );
}
