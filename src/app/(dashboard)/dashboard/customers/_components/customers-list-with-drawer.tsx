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
  /** 內部服務備註可編輯（= customer.update）。false 時 Drawer 只顯示不可改。 */
  canEditNote: boolean;
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
  canEditNote,
}: Props) {
  const titleId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Drawer：可見性與資料皆為 client state ──────────────────────────
  // open 的唯一來源 = URL ?customerId= 的「實際變化」（整列 <Link> 點擊 /
  // 「查看」鈕 router.push / 初次 deep-link）；close = 純 client state +
  // history.replaceState（不 soft-nav、不 router.refresh、不重刷列表）。
  const cacheRef = useRef<Map<string, DrawerDetail>>(new Map());
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DrawerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState<"plan" | null>(null);

  // 競態防護：只套用「最後一次請求」的結果（快速連點不同顧客時）
  const reqIdRef = useRef(0);
  // 記錄「上次已處理的 URL customerId」。effect 只在此值「實際改變」時動作，
  // 故 close（history.replaceState，不更新 Next searchParams）造成的 stale
  // 殘值不會觸發重開（取代了 closedIdRef 的職責，且更穩：close 後重設為
  // null，下次同一位的真實 URL 導航即可再次開啟，不會被殘值卡住）。
  const lastUrlCidRef = useRef<string | null>(null);

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

  // 開啟：cache 命中即時填入；未命中先 skeleton + 背景 fetch。
  const applyOpen = useCallback(
    (customerId: string, f: "plan" | null) => {
      setOpenId(customerId);
      setFocus(f);
      const cached = cacheRef.current.get(customerId);
      if (cached) {
        setDetail(cached);
        setLoading(false);
        reqIdRef.current++; // 取消在途請求，避免覆蓋 cache
      } else {
        setDetail(null);
        void fetchDetail(customerId);
      }
    },
    [fetchDetail],
  );

  // 單一 open 來源：把「外部系統 URL ?customerId=」的實際變化同步成 client
  // state（涵蓋整列 <Link> 點擊、「查看」鈕 router.push、初次 deep-link）。
  //
  // 這正是 react 文件允許的 effect 用途：「subscribe to an external system,
  // call setState when it changes」。`lastUrlCidRef` early-return 讓本 effect
  // 對同一 cid 冪等，不會 cascading render（rule 真正擔心的事不會發生）；且必須
  // 用 effect 而非「render 時 setState」pattern：close 走 history.replaceState
  // 不改 Next searchParams 物件，effect 不會因 close 重跑 → 重設 ref 安全；
  // render-time pattern 則會在 close 後的 re-render 用 stale searchParams 誤重開。
  // 因此於此處 scoped 關閉 set-state-in-effect（已用 guard 消除其風險）。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const cid = searchParams.get("customerId");
    if (cid === lastUrlCidRef.current) return; // URL cid 沒真的變 → 忽略
    lastUrlCidRef.current = cid;
    const f = searchParams.get("drawerFocus") === "plan" ? "plan" : null;
    if (cid) {
      applyOpen(cid, f);
    } else {
      // 經由 Next 導航把 customerId 拿掉（例如改篩選）→ 確保關閉
      setOpenId(null);
      setDetail(null);
      setFocus(null);
    }
  }, [searchParams, applyOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 整列 <Link>（cmd / 中鍵新分頁）與 router.push 共用：保留既有篩選參數。
  const buildHref = useCallback(
    (customerId: string | null, f: "plan" | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (customerId) params.set("customerId", customerId);
      else params.delete("customerId");
      if (f) params.set("drawerFocus", f);
      else params.delete("drawerFocus");
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  // 「查看」/「＋指派」鈕 → **立即**開 Drawer（client state），不再用 router.push
  // 當開啟前置條件。原本 router.push(?customerId=) 會觸發整個顧客管理頁 server
  // component re-render（重跑 listCustomers），Drawer 被卡在這段 navigation 後面
  // → 點擊後 3–5 秒沒反應。改為直接 applyOpen + 用 history API 同步網址（不 soft-nav）。
  const openCustomer = useCallback(
    (customerId: string, f: "plan" | null = null) => {
      // 1) 立即開 Drawer：走既有 cache 命中即時填入 / 未命中先 skeleton + 背景 fetch。
      applyOpen(customerId, f);
      // 2) URL 同步走 history.pushState（非 Next 導航）→ 不觸發 server component
      //    re-render / listCustomers 重查，但 ?customerId= 仍寫入網址（refresh /
      //    複製連結 deep-link 可用）。Back/Forward 由下方 popstate effect 同步。
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        params.set("customerId", customerId);
        if (f) params.set("drawerFocus", f);
        else params.delete("drawerFocus");
        const qs = params.toString();
        window.history.pushState(
          null,
          "",
          qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
        );
      }
      // 3) 標記已處理此 cid：若之後 Next searchParams 同步到同值，deep-link
      //    effect 會 early-return，不重複 applyOpen。
      lastUrlCidRef.current = customerId;
    },
    [applyOpen],
  );

  // 關閉 = 純 client state；history.replaceState 移除 ?customerId=
  // （不 soft-nav、不 router.refresh、不重刷列表）。lastUrlCidRef 重設為
  // null：close 不更新 Next searchParams，stale 殘值不會觸發 effect 重開，
  // 而下次「真的」導航到同一位（含剛關的那位）時 cid≠null 會被視為變化而開啟。
  const closeDrawer = useCallback(() => {
    setOpenId(null);
    setDetail(null);
    setFocus(null);
    reqIdRef.current++; // 丟棄在途請求
    lastUrlCidRef.current = null;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("customerId");
      params.delete("drawerFocus");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
      );
    }
  }, []);

  // Back / Forward 同步：openCustomer 用 history.pushState 開 Drawer，瀏覽器
  // 上一頁/下一頁需據網址重開/關閉對應 Drawer（取代原 router.push 的 Back 行為），
  // 且同樣不觸發 server re-render。只在本頁掛載期間生效。
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const cid = params.get("customerId");
      const f = params.get("drawerFocus") === "plan" ? "plan" : null;
      lastUrlCidRef.current = cid;
      if (cid) {
        applyOpen(cid, f);
      } else {
        setOpenId(null);
        setDetail(null);
        setFocus(null);
        reqIdRef.current++; // 丟棄在途請求
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyOpen]);

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
            canEditNote={canEditNote}
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
