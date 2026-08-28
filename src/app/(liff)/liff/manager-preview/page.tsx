import { notFound } from "next/navigation";
import { ModulePreviewSwitcher } from "../_components/module-preview-switcher";
import { SPA_INDUSTRY_MODULE } from "@/lib/industry-modules";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";

type PreviewBooking = {
  customer: string;
  service: string;
  provider: string;
  status: "已確認" | "待到店" | "新客體驗";
  tone: "sage" | "sand" | "rose";
};

const previewProviders = ["陳語安", "張若琳", "王心瑜"] as const;

const previewSchedule: Array<{
  time: string;
  bookings: Partial<Record<(typeof previewProviders)[number], PreviewBooking>>;
}> = [
  {
    time: "10:00",
    bookings: {
      陳語安: {
        customer: "林小姐",
        service: "新客舒壓體驗 60 分鐘",
        provider: "陳語安",
        status: "新客體驗",
        tone: "rose",
      },
    },
  },
  {
    time: "11:30",
    bookings: {
      張若琳: {
        customer: "張小姐",
        service: "深層芳療 10 次",
        provider: "張若琳",
        status: "待到店",
        tone: "sand",
      },
      王心瑜: {
        customer: "周小姐",
        service: "全身芳療單次 90 分鐘",
        provider: "王心瑜",
        status: "已確認",
        tone: "sage",
      },
    },
  },
  { time: "13:00", bookings: {} },
  {
    time: "14:30",
    bookings: {
      陳語安: {
        customer: "王小姐",
        service: "全身芳療單次 90 分鐘",
        provider: "陳語安",
        status: "已確認",
        tone: "sage",
      },
      張若琳: {
        customer: "李小姐",
        service: "舒壓療程 5 次",
        provider: "張若琳",
        status: "待到店",
        tone: "sand",
      },
    },
  },
  {
    time: "16:00",
    bookings: {
      王心瑜: {
        customer: "許小姐",
        service: "年度保養 12 次",
        provider: "王心瑜",
        status: "已確認",
        tone: "sage",
      },
    },
  },
] as const;

const managerNavigation = [
  { label: "今日營運", detail: "總覽", active: true },
  { label: "預約管理", detail: "6 筆", active: false },
  { label: "顧客管理", detail: "128 位", active: false },
  { label: "療程管理", detail: "6 項", active: false },
  { label: "芳療師管理", detail: "3 位", active: false },
  { label: "營運設定", detail: "", active: false },
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
    <div className="min-h-screen bg-[#f5f3ee] text-earth-900">
      <div className="mx-auto min-h-screen max-w-[1600px] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden border-r border-earth-200/80 bg-[#2f352b] px-5 py-7 text-white lg:flex lg:flex-col">
          <div className="border-b border-white/10 pb-6">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary-200">蒸管家</p>
            <p className="mt-2 text-lg font-semibold">沐光舒療 SPA</p>
            <p className="mt-1 text-xs text-white/55">店長管理後台・示範店</p>
          </div>

          <nav className="mt-6 space-y-1.5" aria-label="店長後台功能">
            {managerNavigation.map((item) => (
              <div
                key={item.label}
                aria-current={item.active ? "page" : undefined}
                className={`flex min-h-12 items-center justify-between rounded-xl px-3.5 text-sm ${
                  item.active
                    ? "bg-white text-earth-900 shadow-sm"
                    : "text-white/70"
                }`}
              >
                <span className="font-medium">{item.label}</span>
                {item.detail ? (
                  <span className={item.active ? "text-earth-500" : "text-white/40"}>
                    {item.detail}
                  </span>
                ) : null}
              </div>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
            <p className="text-xs text-white/50">目前產業模組</p>
            <p className="mt-1.5 text-sm font-semibold">SPA／美容美體</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <ModuleSetting label="預約間隔" value={`${industryModule.booking.slotIntervalMinutes} 分`} />
              <ModuleSetting label="同時容量" value={`${industryModule.booking.defaultCapacity} 位`} />
            </dl>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 xl:px-10">
          <header className="flex flex-col gap-5 border-b border-earth-200/80 pb-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-700">SPA 模組</span>
                <span className="text-xs text-earth-500">介面預覽・尚未連接 Demo 資料庫</span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {industryModule.manager.dashboardLabel}
              </h1>
              <p className="mt-1 text-sm text-earth-500">2026 年 8 月 29 日・星期六</p>
            </div>
            <div className="w-full max-w-sm xl:w-80">
              <ModulePreviewSwitcher active="manager" />
            </div>
          </header>

          <div className="mt-6 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800 lg:hidden">
            店長後台以桌機操作為主；手機仍可快速查看今日預約。
          </div>

          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="今日營運摘要">
            <MetricCard label="今日預約" value="6" unit="筆" detail="3 位芳療師" />
            <MetricCard label="待服務" value="4" unit="筆" detail="下一筆 10:00" />
            <MetricCard label="新顧客" value="1" unit="位" detail="初次體驗" emphasized />
            <MetricCard label="今日使用療程" value="5" unit="次" detail="單次服務 1 筆" />
          </section>

          <div className="mt-6 grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_rgba(74,66,53,0.06)] ring-1 ring-earth-200/70">
              <div className="flex flex-col gap-3 border-b border-earth-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">今日芳療師預約表</h2>
                  <p className="mt-1 text-sm text-earth-500">依時間與芳療師查看服務安排</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="rounded-lg border border-earth-200 bg-earth-50 px-3 py-2 text-earth-500">前一天</span>
                  <span className="rounded-lg bg-earth-900 px-3 py-2 font-semibold text-white">8/29 今日</span>
                  <span className="rounded-lg border border-earth-200 bg-earth-50 px-3 py-2 text-earth-500">後一天</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left">
                  <thead>
                    <tr className="bg-earth-50/80 text-sm">
                      <th className="w-20 border-b border-r border-earth-100 px-4 py-4 font-medium text-earth-500">時間</th>
                      {previewProviders.map((provider) => (
                        <th key={provider} className="border-b border-r border-earth-100 px-4 py-4 last:border-r-0">
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                              {provider.slice(0, 1)}
                            </span>
                            <div>
                              <p className="font-semibold text-earth-900">{provider}</p>
                              <p className="mt-0.5 text-xs font-normal text-earth-500">{industryModule.roles.provider}</p>
                            </div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewSchedule.map((row) => (
                      <tr key={row.time}>
                        <th className="border-b border-r border-earth-100 px-4 py-4 align-top text-sm font-semibold tabular-nums text-earth-700">
                          {row.time}
                        </th>
                        {previewProviders.map((provider) => {
                          const booking = row.bookings[provider];
                          return (
                            <td key={provider} className="h-28 border-b border-r border-earth-100 p-2 align-top last:border-r-0">
                              {booking ? <ScheduleBooking booking={booking} /> : <EmptySlot />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="grid content-start gap-5 sm:grid-cols-2 2xl:grid-cols-1" aria-label="營運輔助資訊">
              <section className="rounded-2xl bg-earth-900 p-5 text-white shadow-[0_12px_32px_rgba(52,47,39,0.14)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-earth-300">下一筆預約・10:00</p>
                    <h2 className="mt-2 text-xl font-semibold">林小姐</h2>
                  </div>
                  <span className="rounded-full bg-[#f1d9d1] px-2.5 py-1 text-xs font-semibold text-[#855649]">新客體驗</span>
                </div>
                <dl className="mt-5 space-y-3 border-t border-white/10 pt-4 text-sm">
                  <DetailRow label="服務項目" value="新客舒壓體驗 60 分鐘" />
                  <DetailRow label="芳療師" value="陳語安" />
                  <DetailRow label="顧客狀態" value="首次到店" />
                  <DetailRow label="注意事項" value="肩頸容易緊繃" />
                </dl>
                <div className="mt-5 rounded-xl bg-white/8 px-3.5 py-3 text-xs leading-relaxed text-earth-200 ring-1 ring-white/10">
                  連接 Demo 資料庫後，可在此確認到店、完成服務與安排下次預約。
                </div>
              </section>

              <section className="rounded-2xl bg-white p-5 shadow-[0_8px_24px_rgba(74,66,53,0.05)] ring-1 ring-earth-200/70">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">今日提醒</h2>
                  <span className="rounded-full bg-earth-100 px-2 py-1 text-xs text-earth-500">2 項</span>
                </div>
                <div className="mt-4 space-y-3">
                  <AlertItem title="1 位新客首次到店" detail="10:00・林小姐" tone="rose" />
                  <AlertItem title="2 筆療程即將到期" detail="可於服務後提醒續購" tone="sand" />
                </div>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function MetricCard({ label, value, unit, detail, emphasized = false }: {
  label: string;
  value: string;
  unit: string;
  detail: string;
  emphasized?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 ring-1 ${
      emphasized ? "bg-primary-50 ring-primary-100" : "bg-white ring-earth-200/70"
    }`}>
      <p className="text-sm text-earth-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-earth-900">
        {value}<span className="ml-1 text-sm font-medium text-earth-500">{unit}</span>
      </p>
      <p className="mt-2 text-xs text-earth-500">{detail}</p>
    </div>
  );
}

function ScheduleBooking({ booking }: { booking: PreviewBooking }) {
  const toneClasses = {
    sage: "border-[#cbd6c4] bg-[#edf2e9] text-[#4b6241]",
    sand: "border-[#e4d5bb] bg-[#f6f0e5] text-[#765f38]",
    rose: "border-[#e3c7be] bg-[#f7ece8] text-[#855649]",
  } as const;

  return (
    <article className={`h-full rounded-xl border p-3 ${toneClasses[booking.tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-earth-900">{booking.customer}</p>
        <span className="shrink-0 text-[11px] font-semibold">{booking.status}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-earth-700">{booking.service}</p>
    </article>
  );
}

function EmptySlot() {
  return (
    <div className="flex h-full min-h-20 items-center justify-center rounded-xl border border-dashed border-earth-200 bg-earth-50/40 text-xs text-earth-400">
      可安排
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-earth-400">{label}</dt>
      <dd className="text-right font-medium text-earth-100">{value}</dd>
    </div>
  );
}

function AlertItem({ title, detail, tone }: {
  title: string;
  detail: string;
  tone: "rose" | "sand";
}) {
  return (
    <div className="flex gap-3 rounded-xl bg-earth-50 p-3.5">
      <span
        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${tone === "rose" ? "bg-[#c78e7c]" : "bg-[#c5a66c]"}`}
        aria-hidden
      />
      <div>
        <p className="text-sm font-semibold text-earth-900">{title}</p>
        <p className="mt-1 text-xs text-earth-500">{detail}</p>
      </div>
    </div>
  );
}

function ModuleSetting({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-white/40">{label}</dt>
      <dd className="mt-1 font-semibold text-white/90">{value}</dd>
    </div>
  );
}
