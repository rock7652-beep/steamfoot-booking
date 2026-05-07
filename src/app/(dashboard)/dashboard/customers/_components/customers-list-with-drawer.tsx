"use client";

import { useId, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { CustomersTable, type CustomerRow } from "./customers-table";
import { CustomerDetailDrawerContent } from "./customer-detail-drawer-content";
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
    </>
  );
}
