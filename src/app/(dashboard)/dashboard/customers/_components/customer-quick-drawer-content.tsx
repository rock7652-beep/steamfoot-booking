"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { AssignPlanForm } from "../[id]/assign-plan-form";
import type { CustomerRow } from "./customers-table";
import { CustomerStatusBadge } from "./customer-status-badge";

interface Plan {
  id: string;
  name: string;
  category: string;
  price: number;
  sessionCount: number;
}

interface Props {
  customer: CustomerRow;
  plans: Plan[];
  canDiscount: boolean;
  onClose: () => void;
  titleId: string;
}

export function CustomerQuickDrawerContent({
  customer,
  plans,
  canDiscount,
  onClose,
  titleId,
}: Props) {
  const router = useRouter();

  // 開啟時把焦點交給 drawer header，避免誤觸表格背景
  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    headerRef.current?.focus();
  }, []);

  const phoneDisplay = customer.phone.startsWith("_oauth_") ? "—" : customer.phone;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        ref={headerRef}
        tabIndex={-1}
        className="flex items-start justify-between border-b border-earth-100 px-5 py-4 outline-none"
      >
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-earth-900">
            {customer.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-earth-500">
            {phoneDisplay !== "—" && <span>☎ {phoneDisplay}</span>}
            {customer.lineName && <span>LINE {customer.lineName}</span>}
          </div>
          <div className="mt-2">
            <CustomerStatusBadge
              stage={customer.customerStage}
              lineLinkStatus={customer.lineLinkStatus}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="rounded p-1 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Assign Plan Form — 直接用現有元件 */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-earth-800">＋指派方案</h3>
          <AssignPlanForm
            customerId={customer.id}
            plans={plans}
            canDiscount={canDiscount}
            alwaysOpen
            onSuccess={() => router.refresh()}
          />
        </section>
      </div>

      {/* Footer */}
      <div className="border-t border-earth-100 px-5 py-3">
        <Link
          href={`/dashboard/customers/${customer.id}`}
          className="text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          查看完整詳情 →
        </Link>
      </div>
    </div>
  );
}
