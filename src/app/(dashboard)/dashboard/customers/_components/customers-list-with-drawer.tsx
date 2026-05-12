"use client";

import { useId, useCallback, useState, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { RightSheet } from "@/components/admin/right-sheet";
import { CustomersTable, isInactiveRow, type CustomerRow } from "./customers-table";
import { CustomerDetailDrawerContent } from "./customer-detail-drawer-content";
import { BulkAssignBar } from "./bulk-assign-bar";
import { bulkUpdateCustomerAssignment } from "@/server/actions/customer";
import type { getCustomerDetail } from "@/server/queries/customer";

type CustomerDetail = Awaited<ReturnType<typeof getCustomerDetail>>;

interface Plan {
  id: string;
  name: string;
  category: string;
  price: number;
  sessionCount: number;
  validityDays: number | null;
}

interface StaffOption {
  id: string;
  displayName: string;
}

interface Props {
  rows: CustomerRow[];
  searchQuery?: string;
  hasActiveFilters: boolean;
  basePath: string;
  plans: Plan[];
  canDiscount: boolean;
  staffOptions: StaffOption[];
  canAssign: boolean;
  /** Server 已依 ?customerId= 抓好的詳情；null = drawer 關閉 */
  customerDetail: CustomerDetail | null;
  /** ?drawerFocus=plan → 自動展開指派方案區並滾到該位置 */
  drawerFocus: "plan" | null;
}

export function CustomersListWithDrawer({
  rows,
  searchQuery,
  hasActiveFilters,
  basePath,
  plans,
  canDiscount,
  staffOptions,
  canAssign,
  customerDetail,
  drawerFocus,
}: Props) {
  const titleId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const buildHref = useCallback(
    (customerId: string | null, focus: "plan" | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (customerId) {
        params.set("customerId", customerId);
      } else {
        params.delete("customerId");
      }
      if (focus) {
        params.set("drawerFocus", focus);
      } else {
        params.delete("drawerFocus");
      }
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  const openCustomer = useCallback(
    (customerId: string, focus: "plan" | null = null) => {
      router.push(buildHref(customerId, focus), { scroll: false });
    },
    [router, buildHref],
  );

  const closeDrawer = useCallback(() => {
    router.push(buildHref(null, null), { scroll: false });
  }, [router, buildHref]);

  // ── 批次選取 state（僅 canAssign 才啟用） ─────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 監聽「篩選／分頁／搜尋」變更 → 清空 selection（不含 drawer open/close）
  // 用 React 官方推薦的 prop-derived state pattern（不用 useEffect 觸發 setState）
  // 參考：https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const filterKey = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    // 排除 drawer-only params；其他都當「資料 view 改變」
    params.delete("customerId");
    params.delete("drawerFocus");
    return params.toString();
  }, [searchParams]);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setSelectedIds(new Set());
  }

  const toggleRow = useCallback(
    (customerId: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(customerId)) {
          next.delete(customerId);
        } else {
          next.add(customerId);
        }
        return next;
      });
    },
    [],
  );

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const selectableIds = rows.filter((r) => !isInactiveRow(r)).map((r) => r.id);
      const allSelected =
        selectableIds.length > 0 &&
        selectableIds.every((id) => prev.has(id));
      if (allSelected) {
        // 全消（只消當頁的，跨頁選取不變 — 但目前不支援跨頁，可視為清空）
        const next = new Set(prev);
        selectableIds.forEach((id) => next.delete(id));
        return next;
      }
      // 全選當頁可操作列
      const next = new Set(prev);
      selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }, [rows]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkSubmit = useCallback(
    async (assignedStaffId: string) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      const result = await bulkUpdateCustomerAssignment({
        customerIds: ids,
        assignedStaffId,
      });
      if (!result.success) {
        toast.error(result.error ?? "批次指派失敗");
        return;
      }
      const { successCount, failedCount, skippedCount, errors } = result.data;
      const staffName =
        staffOptions.find((s) => s.id === assignedStaffId)?.displayName ?? "店長";
      if (failedCount === 0 && skippedCount === 0) {
        toast.success(`已成功指派 ${successCount} 位顧客給 ${staffName}`);
      } else {
        const detailLines: string[] = [];
        detailLines.push(`成功 ${successCount} 位`);
        if (skippedCount > 0) detailLines.push(`跳過 ${skippedCount} 位（已合併或停用）`);
        if (failedCount > 0) {
          detailLines.push(`失敗 ${failedCount} 位`);
          // 取前 3 筆原因示意
          const reasons = errors.slice(0, 3).map((e) => `• ${e.reason}`).join("\n");
          if (reasons) detailLines.push(reasons);
        }
        toast.message(`批次指派完成（${staffName}）`, {
          description: detailLines.join("\n"),
        });
      }
      clearSelection();
      router.refresh();
    },
    [selectedIds, staffOptions, clearSelection, router],
  );

  return (
    <>
      <CustomersTable
        rows={rows}
        searchQuery={searchQuery}
        hasActiveFilters={hasActiveFilters}
        basePath={basePath}
        onView={(row) => openCustomer(row.id)}
        buildViewHref={(row) => buildHref(row.id, null)}
        onQuickAssign={canAssign ? (row) => openCustomer(row.id, "plan") : undefined}
        selectionEnabled={canAssign}
        selectedIds={selectedIds}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
      />

      <RightSheet
        open={customerDetail !== null}
        onClose={closeDrawer}
        labelledById={titleId}
        width={520}
      >
        {customerDetail && (
          <CustomerDetailDrawerContent
            key={customerDetail.id}
            customer={customerDetail}
            plans={plans}
            canDiscount={canDiscount}
            staffOptions={staffOptions}
            canAssign={canAssign}
            focus={drawerFocus}
            onClose={closeDrawer}
            titleId={titleId}
          />
        )}
      </RightSheet>

      {canAssign && selectedIds.size > 0 ? (
        <BulkAssignBar
          selectedCount={selectedIds.size}
          staffOptions={staffOptions}
          onSubmit={handleBulkSubmit}
          onCancel={clearSelection}
        />
      ) : null}
    </>
  );
}
