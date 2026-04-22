import { DashboardLink as Link } from "@/components/dashboard-link";

/**
 * 右側 Sidebar S1 — 快速操作（主 CTA 放最上層）
 *
 * 規格：主按鈕 h-12 (48px)、次按鈕 h-11 (44px)、rounded-[12px]
 */

interface Props {
  customerId: string;
  phone: string;
  canEdit: boolean;
}

export function SidebarQuickActions({ customerId, phone, canEdit }: Props) {
  return (
    <section className="rounded-[20px] border border-earth-200 bg-white p-5">
      <h3 className="text-[13px] font-semibold text-earth-800">快速操作</h3>
      <p className="text-[11px] text-earth-400">常用動作直接進入</p>

      <div className="mt-3 flex flex-col gap-2">
        <Link
          href="#booking"
          className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-primary-600 text-[15px] font-semibold text-white shadow-sm transition hover:bg-primary-700"
        >
          <span aria-hidden>📅</span>
          <span>建立預約</span>
        </Link>

        <Link
          href="#plan"
          className="flex h-11 items-center justify-center gap-2 rounded-[12px] border border-earth-200 bg-white text-[14px] font-medium text-earth-800 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
        >
          <span aria-hidden>🧾</span>
          <span>建立訂單</span>
        </Link>

        <a
          href={`tel:${phone}`}
          className="flex h-11 items-center justify-center gap-2 rounded-[12px] border border-earth-200 bg-white text-[14px] font-medium text-earth-800 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
        >
          <span aria-hidden>📞</span>
          <span>撥打電話</span>
        </a>

        {canEdit ? (
          <Link
            href={`/dashboard/customers/${customerId}/edit`}
            className="flex h-11 items-center justify-center gap-2 rounded-[12px] border border-earth-200 bg-white text-[14px] font-medium text-earth-800 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
          >
            <span aria-hidden>✏️</span>
            <span>編輯資料</span>
          </Link>
        ) : (
          <span className="flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-[12px] border border-earth-200 bg-white text-[14px] font-medium text-earth-400 opacity-60">
            <span aria-hidden>✏️</span>
            <span>編輯資料</span>
          </span>
        )}
      </div>
    </section>
  );
}
