import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import {
  computeLifecycle,
  effectiveStateLabel,
  SUBSCRIPTION_GRACE_DAYS,
  type EffectiveSubscriptionState,
} from "@/lib/subscription-lifecycle";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  PLAN_LABELS,
  CYCLE_LABELS,
  BILLING_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "./constants";

/**
 * /hq/dashboard/stores/subscriptions — 店家訂閱管理（HQ／總部專用）
 *
 * 列出「所有店家」的訂閱資料（跨店）→ 僅限 HQ ADMIN；分店後台不可見。
 * 「目前方案」一律讀 Store.plan（source of truth，本頁唯讀、不改）。
 * 「狀態」為衍生生命週期（TRIAL/ACTIVE/EXPIRED/SUSPENDED，由 expiresAt + 寬限期計算，
 * 不存 DB、不改既有方案判斷）。恢復 = 編輯訂閱把 expiresAt 改到未來 → 立即回 ACTIVE。
 */

/** 衍生狀態 → badge 顏色 */
function stateBadgeCls(state: EffectiveSubscriptionState): string {
  switch (state) {
    case "ACTIVE":
      return "bg-primary-50 text-primary-700";
    case "TRIAL":
      return "bg-amber-50 text-amber-700";
    case "EXPIRED":
      return "bg-orange-100 text-orange-700";
    case "SUSPENDED":
      return "bg-red-100 text-red-700";
    default:
      return "bg-earth-100 text-earth-500";
  }
}

/** 篩選頁籤定義（§7） */
const FILTERS: { value: string; label: string }[] = [
  { value: "ALL", label: "全部" },
  { value: "TRIAL", label: "試用中" },
  { value: "ACTIVE", label: "使用中" },
  { value: "EXPIRED", label: "已到期" },
  { value: "SUSPENDED", label: "已暫停" },
];

const subSelect = {
  id: true,
  plan: true,
  status: true,
  billingCycle: true,
  startedAt: true,
  expiresAt: true,
  billingStatus: true,
  paymentMethod: true,
  priceAmount: true,
  note: true,
} as const;

/** DB date 欄位讀回顯示（AGENTS.md 允許的例外） */
function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10).replace(/-/g, "/") : "—";
}

export default async function StoreSubscriptionsListPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const user = await getCurrentUser();
  // HQ 跨店資料 → 僅限 ADMIN（proxy 已擋非 ADMIN，此處為 defense-in-depth）
  if (!user || user.role !== "ADMIN") redirect("/hq/login");

  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      currentSubscription: { select: subSelect },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: subSelect,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const todayYmd = toLocalDateStr();
  const allRows = stores.map((s) => {
    const sub = s.currentSubscription ?? s.subscriptions[0] ?? null;
    const lc = computeLifecycle(
      { status: sub?.status ?? null, expiresAt: sub?.expiresAt ?? null },
      todayYmd,
    );
    return { store: s, sub, lc };
  });

  // §7 篩選（衍生狀態）
  const activeFilter = (await searchParams).state ?? "ALL";
  const rows =
    activeFilter === "ALL"
      ? allRows
      : allRows.filter((r) => r.lc.state === activeFilter);
  const countOf = (state: string) =>
    state === "ALL"
      ? allRows.length
      : allRows.filter((r) => r.lc.state === state).length;

  /** 剩餘天數 / 寬限 / 暫停 顯示文字 */
  function remainingText(lc: (typeof allRows)[number]["lc"]): string {
    if (lc.state === "NONE" || lc.remainingDays == null) return "—";
    if (lc.isSuspended) return "已暫停";
    if (lc.isExpired)
      return `已到期 · 寬限至 ${lc.graceEndsYmd?.replace(/-/g, "/") ?? "—"}`;
    return `剩餘 ${lc.remainingDays} 天`;
  }

  return (
    <PageShell className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-4">
      <PageHeader
        title="店家訂閱管理"
        subtitle="記錄各店方案、付款方式、付款狀態與到期日（不影響既有方案判斷）"
        actions={
          <Link
            href="/hq/dashboard/stores"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回店舖管理
          </Link>
        }
      />

      <section className="rounded-lg border border-earth-100 bg-earth-50/40 px-4 py-2.5 text-[12px] leading-relaxed text-earth-600">
        「狀態」為依到期日 + 寬限期（{SUBSCRIPTION_GRACE_DAYS} 天）計算的生命週期，
        <span className="font-medium text-earth-800">不存 DB、不改既有方案判斷</span>。
        到期後進入寬限期顯示「已到期」，超過寬限顯示「已暫停」。
        恢復 = 編輯訂閱把到期日改到未來。本階段
        <span className="font-medium text-earth-800">僅顯示狀態，不限制任何操作</span>。
      </section>

      {/* §7 篩選 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const isActive = activeFilter === f.value;
          return (
            <Link
              key={f.value}
              href={
                f.value === "ALL"
                  ? "/hq/dashboard/stores/subscriptions"
                  : `/hq/dashboard/stores/subscriptions?state=${f.value}`
              }
              className={`rounded-full px-3 py-1 text-[12px] font-medium ${
                isActive
                  ? "bg-primary-600 text-white"
                  : "border border-earth-200 text-earth-600 hover:bg-earth-50"
              }`}
            >
              {f.label}
              <span
                className={`ml-1.5 tabular-nums ${isActive ? "text-primary-100" : "text-earth-400"}`}
              >
                {countOf(f.value)}
              </span>
            </Link>
          );
        })}
      </div>

      <section className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
        <table className="w-full min-w-[1020px] text-[13px]">
          <thead>
            <tr className="border-b border-earth-100 text-left text-[11px] text-earth-500">
              <th className="px-4 py-2.5 font-medium">店家</th>
              <th className="px-3 py-2.5 font-medium">目前方案</th>
              <th className="px-3 py-2.5 font-medium">狀態</th>
              <th className="px-3 py-2.5 font-medium">付款狀態</th>
              <th className="px-3 py-2.5 font-medium">付款方式</th>
              <th className="px-3 py-2.5 font-medium">週期</th>
              <th className="px-3 py-2.5 font-medium">起始日</th>
              <th className="px-3 py-2.5 font-medium">到期日</th>
              <th className="px-3 py-2.5 font-medium">剩餘天數</th>
              <th className="px-3 py-2.5 text-right font-medium">金額</th>
              <th className="px-3 py-2.5 font-medium">備註</th>
              <th className="px-4 py-2.5 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ store, sub, lc }) => (
              <tr
                key={store.id}
                className="border-b border-earth-50 last:border-0 align-top"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-earth-900">{store.name}</div>
                  <div className="text-[11px] text-earth-400">{store.slug}</div>
                </td>
                <td className="px-3 py-3 text-earth-700">
                  {PLAN_LABELS[store.plan] ?? store.plan}
                </td>
                {sub ? (
                  <>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${stateBadgeCls(lc.state)}`}
                      >
                        {effectiveStateLabel(lc.state)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-earth-700">
                      {BILLING_STATUS_LABELS[sub.billingStatus] ??
                        sub.billingStatus}
                    </td>
                    <td className="px-3 py-3 text-earth-700">
                      {sub.paymentMethod
                        ? PAYMENT_METHOD_LABELS[sub.paymentMethod] ??
                          sub.paymentMethod
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-earth-700">
                      {sub.billingCycle
                        ? CYCLE_LABELS[sub.billingCycle] ?? sub.billingCycle
                        : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-earth-700">
                      {fmtDate(sub.startedAt)}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-earth-700">
                      {fmtDate(sub.expiresAt)}
                    </td>
                    <td
                      className={`px-3 py-3 tabular-nums ${lc.isSuspended ? "text-red-600" : lc.isExpired ? "text-orange-600" : "text-earth-700"}`}
                    >
                      {remainingText(lc)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-earth-700">
                      {sub.priceAmount != null
                        ? `NT$${sub.priceAmount.toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-3 text-earth-500">
                      {sub.note ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/hq/dashboard/stores/subscriptions/${store.id}`}
                        className="rounded-lg border border-earth-200 px-2.5 py-1 text-[12px] font-medium text-earth-700 hover:bg-earth-50"
                      >
                        編輯訂閱
                      </Link>
                    </td>
                  </>
                ) : (
                  <>
                    <td
                      className="px-3 py-3 text-[12px] text-earth-400"
                      colSpan={9}
                    >
                      尚未建立訂閱
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Link
                          href={`/hq/dashboard/stores/subscriptions/${store.id}/trial`}
                          className="rounded-lg bg-primary-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-primary-700"
                        >
                          建立 Trial
                        </Link>
                        <Link
                          href={`/hq/dashboard/stores/subscriptions/${store.id}`}
                          className="rounded-lg border border-earth-200 px-2.5 py-1 text-[12px] font-medium text-earth-700 hover:bg-earth-50"
                        >
                          建立訂閱
                        </Link>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {rows.length === 0 ? (
        <p className="px-1 text-[13px] text-earth-400">
          {activeFilter === "ALL"
            ? "目前沒有任何店家。"
            : "此狀態目前沒有店家。"}
        </p>
      ) : null}
    </PageShell>
  );
}
