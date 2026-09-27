import { CashbookShortcut } from "../../cashbook/_components/cashbook-shortcut";
import { DashboardLink as Link } from "@/components/dashboard-link";
/** Shared mature operations navigation; each module supplies its own ledger. */
export function RevenueTabs({ readOnly, showMonthly = false }: { readOnly: boolean; showMonthly?: boolean }) {
  return <div aria-label="營運頁籤" className="grid grid-cols-2 items-center gap-2 border-b border-earth-200 pb-3 md:flex md:flex-wrap md:gap-3">
    <span className="flex min-h-11 items-center justify-center rounded-lg border-b-2 border-primary-600 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 md:min-h-0 md:bg-transparent md:py-1.5">營收明細</span>
    <CashbookShortcut readOnly={readOnly} triggerClassName="w-full justify-center md:min-h-0 md:w-auto md:px-3 md:py-1.5" />
    <Link href="/dashboard/cashbook" className={`${showMonthly ? "" : "col-span-2"} flex min-h-11 items-center justify-center rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 md:col-span-1 md:min-h-0 md:border-0 md:bg-transparent md:py-1.5`}>完整現金管理 →</Link>
    {showMonthly && <Link href="/dashboard/service-fee-calculator" className="flex min-h-11 items-center justify-center rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 md:min-h-0 md:border-0 md:bg-transparent md:py-1.5">月結管理 →</Link>}
  </div>;
}
