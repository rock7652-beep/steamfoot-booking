"use client";

import { useId, useCallback, useState, useMemo, useRef, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { RightSheet } from "@/components/admin/right-sheet";
import { CustomersTable, isInactiveRow, type CustomerRow } from "./customers-table";
import { CustomerDetailDrawerContent } from "./customer-detail-drawer-content";
import { CustomerDrawerSkeleton } from "./customer-drawer-skeleton";
import { BulkAssignBar } from "./bulk-assign-bar";
import {
  bulkUpdateCustomerAssignment,
  getCustomerDrawerDetailAction,
} from "@/server/actions/customer";
import type { getCustomerDrawerDetail } from "@/server/queries/customer";

type DrawerDetail = Awaited<ReturnType<typeof getCustomerDrawerDetail>>;

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
  /** Deep-link：初次載入時 ?customerId= 的值（之後開關純 client state） */
  initialCustomerId: string | null;
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
  initialCustomerId,
  drawerFocus,
}: Props) {
  const titleId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Drawer：可見性與資料皆為 client state（與 server prop / RSC 脫鉤）──
  // 這是避免「RSC 快取導致 drawer 關不掉」的關鍵：可見性只看 openId，
  // 關閉 = setOpenId(null)，不依賴任何 server 重算，故該 bug 結構上不可能重現。
  const cacheRef = useRef<Map<string, DrawerDetail>>(new Map());
  const [openId, setOpenId] = useState<string | null>(initialCustomerId);
  const [detail, setDetail] = useState<DrawerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState<"plan" | null>(drawerFocus);

  // 只同步 URL 的 ?customerId=（cosmetic / 可分享），用 history.replaceState
  // 不走 Next 導航 → 不觸發 RSC 重算、不重刷列表。
  const syncUrl = useCallback(
    (customerId: string | null, f: "plan" | null) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (customerId) params.set("customerId", customerId);
      else params.delete("customerId");
      if (f) params.set("drawerFocus", f);
      else params.delete("drawerFocus");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
      );
    },
    [],
  );

  // 競態防護：只套用「最後一次請求」的結果（快速連點不同顧客時）
  const reqIdRef = useRef(0);

  const fetchDetail = useCallback(async (customerId: string) => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    const res = await getCustomerDrawerDetailAction(customerId);
    if (myReq !== reqIdRef.current) return; // 已被更新的請求取代 → 丟棄
    setLoading(false);
    if (!res.success) {
      toast.error(res.error ?? "讀取顧客資料失敗");
      // 取不到（已合併 / 停用 / 跨店 / 不存在）→ 關閉 drawer，不卡 skeleton
      setOpenId(null);
      setDetail(null);
      return;
    }
    cacheRef.current.set(customerId, res.data);
    setDetail(res.data);
  }, []);

  // 初次 deep-link：?customerId= 帶值 → 開 drawer 並抓資料
  useEffect(() => {
    if (initialCustomerId) void fetchDetail(initialCustomerId);
    // 僅 mount 執行一次（deep-link 入口）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 表格列的「在新分頁開啟」anchor href（cmd / 中鍵點擊）。
  // 一般左鍵點擊走 onView → openCustomer（client 即時），不經此 href。
  const buildHref = useCallback(
    (customerId: string | null, focus: "plan" | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (customerId) params.set("customerId", customerId);
      else params.delete("customerId");
      if (focus) params.set("drawerFocus", focus);
      else params.delete("drawerFocus");
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  // 點顧客 → drawer 立即滑出（openId 同步設定）。已看過的顧客用 client
  // cache 立即填入；未看過先 skeleton，背景 fetch 完成再填。
  const openCustomer = useCallback(
    (customerId: string, f: "plan" | null = null) => {
      setOpenId(customerId);
      setFocus(f);
      syncUrl(customerId, f);
      const cached = cacheRef.current.get(customerId);
      if (cached) {
        setDetail(cached);
        setLoading(false);
        reqIdRef.current++; // 取消任何在途請求，避免覆蓋快取
      } else {
        setDetail(null);
        void fetchDetail(customerId);
      }
    },
    [syncUrl, fetchDetail],
  );

  // 關閉 = 純 client state，不 router.push / 不 router.refresh → 立即關閉。
  const closeDrawer = useCallback(() => {
    setOpenId(null);
    setDetail(null);
    setFocus(null);
    reqIdRef.current++; // 丟棄在途請求
    syncUrl(null, null);
  }, [syncUrl]);

  // drawer 內成功操作（指派方案 / 歸屬設定）後刷新本人資料，
  // 不整頁 refresh、不重刷列表（列表 _count 短暫 stale 為已知取捨）。
  const refreshDrawer = useCallback(() => {
    if (openId) {
      cacheRef.current.delete(openId);
      void fetchDetail(openId);
    }
  }, [openId, fetchDetail]);

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
        open={openId !== null}
        onClose={closeDrawer}
        labelledById={titleId}
        width={520}
      >
        {detail ? (
          <CustomerDetailDrawerContent
            key={detail.id}
            customer={detail}
            plans={plans}
            canDiscount={canDiscount}
            staffOptions={staffOptions}
            canAssign={canAssign}
            focus={focus}
            onClose={closeDrawer}
            onMutated={refreshDrawer}
            titleId={titleId}
          />
        ) : openId ? (
          <CustomerDrawerSkeleton titleId={titleId} loading={loading} onClose={closeDrawer} />
        ) : null}
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
