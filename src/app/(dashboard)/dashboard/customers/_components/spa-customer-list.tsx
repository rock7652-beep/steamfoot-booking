"use client";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";
import { toLocalDateStr } from "@/lib/date-utils";
import type { SpaCustomerSummary } from "@/server/queries/spa-customer-summary";
import type { SpaCustomerPermissions } from "./spa-customers";
export function SpaCustomerList({
  customers,
  search,
  permissions,
  onOpen,
  onPrefetch,
}: {
  customers: SpaCustomerSummary[];
  search: string;
  permissions: SpaCustomerPermissions;
  onOpen: (c: SpaCustomerSummary) => void;
  onPrefetch: (id: string) => void;
}) {
  const router = useRouter(),
    pathname = usePathname();
  const [query, setQuery] = useState(search),
    [filter, setFilter] = useState("all"),
    [pending, start] = useTransition();
  const [cutoff] = useState(() =>
    toLocalDateStr(new Date(Date.now() - 30 * 86400000)),
  );
  const visible = customers.filter(
    (c) =>
      filter === "all" ||
      (filter === "recent"
        ? !!c.lastVisit && c.lastVisit.slice(0, 10) >= cutoff
        : filter === "stale"
          ? !!c.lastVisit && c.lastVisit.slice(0, 10) < cutoff
          : !c.lastVisit),
  );
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">顧客管理</h1>
          <p className="mt-1 text-sm text-earth-500">
            點選顧客，查看需求、方案或安排預約。
          </p>
        </div>
        {permissions.canCreate && (
          <DashboardLink
            href="/dashboard/customers/new"
            className="rounded-lg bg-earth-800 px-4 py-3 text-white"
          >
            ＋新增顧客
          </DashboardLink>
        )}
      </header>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(() =>
            router.replace(
              `${pathname}${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ""}`,
              { scroll: false },
            ),
          );
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋姓名／電話"
          aria-label="搜尋姓名或電話"
          className="min-w-0 flex-1 rounded-lg border bg-white p-3"
        />
        <button disabled={pending} className="rounded-lg border px-5">
          {pending ? "搜尋中…" : "搜尋"}
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        {(permissions.canReadBookings
          ? [
              ["all", "全部"],
              ["recent", "近 30 天來店"],
              ["stale", "超過 30 天未來店"],
              ["never", "尚未來店"],
            ]
          : [["all", "全部"]]
        ).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-2 text-sm ${filter === value ? "bg-earth-800 text-white" : "bg-white text-earth-600"}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-sm text-earth-500">
          {visible.length} 位顧客
        </span>
      </div>
      <div
        aria-busy={pending}
        className="overflow-hidden rounded-xl border border-earth-200 bg-white"
      >
        <div className="hidden grid-cols-[1.1fr_1fr_1fr_1.2fr] gap-4 bg-earth-50 px-4 py-3 text-sm text-earth-500 lg:grid">
          <span>顧客</span>
          <span>來店與預約</span>
          <span>方案與儲值</span>
          <span>服務備註</span>
        </div>
        <div className="divide-y divide-earth-100">
          {visible.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpen(c)}
              onPointerEnter={() => onPrefetch(c.id)}
              onFocus={() => onPrefetch(c.id)}
              className="grid w-full grid-cols-1 gap-2 px-4 py-4 text-left hover:bg-earth-50 focus-visible:outline-2 focus-visible:outline-earth-600 sm:grid-cols-2 lg:grid-cols-[1.1fr_1fr_1fr_1.2fr] lg:gap-4"
            >
              <span className="min-w-0">
                <strong className="block truncate">{c.name}</strong>
                <span className="text-sm text-earth-500">
                  {c.phone?.startsWith("_")
                    ? "未填電話"
                    : c.phone || "未填電話"}
                </span>
              </span>
              <span className="text-sm">
                {permissions.canReadBookings ? (
                  <>
                    <span className="block text-earth-500">
                      最近：{c.lastVisit?.slice(0, 10) ?? "尚未來店"}
                    </span>
                    <span className="block">
                      下次：{c.nextVisit ?? "尚未預約"}
                    </span>
                  </>
                ) : (
                  "無預約查看權限"
                )}
              </span>
              <span className="min-w-0 text-sm">
                {permissions.canReadAccounts ? (
                  <>
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      {c.packages[0] ? (
                        <>
                          <span
                            className="min-w-0 max-w-full truncate"
                            title={c.packages[0].name}
                          >
                            {c.packages[0].name}
                          </span>
                          <strong className="shrink-0 whitespace-nowrap">
                            可用 {c.packages[0].available} 次
                          </strong>
                        </>
                      ) : (
                        "無有效方案"
                      )}
                    </span>
                    <span className="block text-earth-500">
                      {c.packages.length > 1
                        ? `另有 ${c.packages.length - 1} 個方案 · `
                        : ""}
                      儲值 NT${(c.balance ?? 0).toLocaleString()}
                    </span>
                  </>
                ) : (
                  "無帳務查看權限"
                )}
              </span>
              <span className="line-clamp-2 text-sm text-earth-600">
                {c.serviceNote || "尚無服務備註"}
              </span>
            </button>
          ))}
        </div>
        {!visible.length && (
          <p className="p-8 text-center text-earth-500">
            {search || filter !== "all"
              ? "沒有符合條件的顧客，請調整搜尋或篩選。"
              : "尚無顧客，從右上方新增第一位顧客。"}
          </p>
        )}
      </div>
      {customers.length === 100 && (
        <p className="text-sm text-earth-500">
          目前顯示搜尋結果前 100 位，來店篩選套用於這 100
          位；請以姓名或電話縮小搜尋。
        </p>
      )}
    </>
  );
}
