import { notFound } from "next/navigation";
import { ModulePreviewSwitcher } from "../_components/module-preview-switcher";
import { SPA_INDUSTRY_MODULE } from "@/lib/industry-modules";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";

const previewBookings = [
  {
    time: "10:00",
    customer: "林小姐",
    service: "新客舒壓體驗 60 分鐘",
    provider: "陳語安",
    status: "已確認",
  },
  {
    time: "11:30",
    customer: "張小姐",
    service: "深層芳療 10 次",
    provider: "張若琳",
    status: "待到店",
  },
  {
    time: "14:30",
    customer: "王小姐",
    service: "全身芳療單次 90 分鐘",
    provider: "王心瑜",
    status: "待到店",
  },
] as const;

/**
 * Draft Preview only. It contains static fictional data and is unavailable in
 * Production. No staff session, customer record, or database is read.
 */
export default async function SpaManagerPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const storeSlug = await resolveStoreSlugForLiff();
  if (storeSlug !== "demo") notFound();

  const industryModule = SPA_INDUSTRY_MODULE;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-5 pb-10 pt-7">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-[0.1em] text-primary-700">
            沐光舒療 SPA 示範店
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-earth-900">
            {industryModule.manager.dashboardLabel}
          </h1>
          <p className="mt-1 text-xs text-earth-500">介面預覽・尚未連接 Demo 資料庫</p>
        </div>
        <span className="rounded-full bg-primary-100 px-3 py-1.5 text-xs font-semibold text-primary-700">
          SPA 模組
        </span>
      </header>

      <ModulePreviewSwitcher active="manager" />

      <section className="grid grid-cols-3 gap-2" aria-label="今日摘要">
        <MetricCard label="今日預約" value="6" unit="筆" />
        <MetricCard label="待服務" value="4" unit="筆" />
        <MetricCard label="新顧客" value="1" unit="位" emphasized />
      </section>

      <section className="rounded-3xl bg-white px-5 py-5 shadow-[0_8px_24px_rgba(74,66,53,0.07)] ring-1 ring-earth-200/70">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-earth-900">接下來的預約</h2>
            <p className="mt-0.5 text-xs text-earth-500">依時間排列，快速確認顧客與芳療師</p>
          </div>
          <span className="text-xs font-semibold text-primary-700">查看全部</span>
        </div>

        <div className="mt-4 divide-y divide-earth-100">
          {previewBookings.map((booking) => (
            <article key={`${booking.time}-${booking.customer}`} className="flex gap-3 py-4 first:pt-0 last:pb-0">
              <time className="w-12 shrink-0 pt-0.5 text-base font-semibold tabular-nums text-earth-900">
                {booking.time}
              </time>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-earth-900">{booking.customer}</p>
                  <span className="shrink-0 rounded-full bg-primary-50 px-2 py-1 text-[11px] font-medium text-primary-700">
                    {booking.status}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-earth-600">{booking.service}</p>
                <p className="mt-1 text-xs text-earth-500">{industryModule.roles.provider}：{booking.provider}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <nav className="grid grid-cols-2 gap-3" aria-label="店長功能">
        <ManagerTile label={industryModule.manager.bookingLabel} detail="查看與安排時段" />
        <ManagerTile label={industryModule.manager.customerLabel} detail="搜尋顧客與紀錄" />
        <ManagerTile label={industryModule.manager.planLabel} detail="療程次數與期限" />
        <ManagerTile label={industryModule.manager.staffLabel} detail="排班與服務安排" />
      </nav>

      <section className="rounded-3xl bg-earth-900 px-5 py-5 text-white shadow-[0_14px_34px_rgba(52,47,39,0.16)]">
        <p className="text-sm font-semibold text-earth-200">本店模組設定</p>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <ModuleSetting label="預約間隔" value={`${industryModule.booking.slotIntervalMinutes} 分鐘`} />
          <ModuleSetting label="同時容量" value={`${industryModule.booking.defaultCapacity} 位`} />
          <ModuleSetting label="公休日" value="每週一" />
          <ModuleSetting label="方案單位" value={industryModule.customer.sessionUnit} />
        </dl>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  emphasized = false,
}: {
  label: string;
  value: string;
  unit: string;
  emphasized?: boolean;
}) {
  return (
    <div className={`rounded-2xl px-3 py-4 text-center ring-1 ${
      emphasized
        ? "bg-primary-50 ring-primary-100"
        : "bg-white ring-earth-200/70"
    }`}>
      <p className="text-xs text-earth-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-earth-900">
        {value}<span className="ml-0.5 text-xs font-medium text-earth-500">{unit}</span>
      </p>
    </div>
  );
}

function ManagerTile({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="min-h-24 rounded-2xl bg-white p-4 shadow-[0_6px_18px_rgba(74,66,53,0.05)] ring-1 ring-earth-200/70">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-earth-900">{label}</p>
        <span className="rounded-full bg-earth-100 px-2 py-1 text-[10px] font-medium text-earth-500">
          預覽
        </span>
      </div>
      <p className="mt-3 text-xs text-earth-500">{detail}</p>
    </div>
  );
}

function ModuleSetting({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-earth-400">{label}</dt>
      <dd className="mt-1 font-semibold text-earth-100">{value}</dd>
    </div>
  );
}
