import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  PLAN_LABELS,
  STATUS_LABELS,
  CYCLE_LABELS,
  BILLING_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "./constants";

/**
 * /hq/dashboard/stores/subscriptions — 店家訂閱管理（HQ／總部專用）
 *
 * 列出「所有店家」的訂閱資料（跨店）→ 僅限 HQ ADMIN；分店後台不可見。
 * 「目前方案」一律讀 Store.plan（source of truth，本頁唯讀、不改）；
 * 訂閱 / 付款 / 到期欄位讀 StoreSubscription（currentSubscription ?? 最新一筆）。
 */

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

export default async function StoreSubscriptionsListPage() {
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

  const rows = stores.map((s) => ({
    store: s,
    sub: s.currentSubscription ?? s.subscriptions[0] ?? null,
  }));

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
        「目前方案」以 <span className="font-medium text-earth-800">Store.plan</span>{" "}
        為準（本頁唯讀）。此處僅記錄訂閱 / 付款 / 到期資料，不會改動既有方案判斷或自動停權。
      </section>

      <section className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
        <table className="w-full min-w-[920px] text-[13px]">
          <thead>
            <tr className="border-b border-earth-100 text-left text-[11px] text-earth-500">
              <th className="px-4 py-2.5 font-medium">店家</th>
              <th className="px-3 py-2.5 font-medium">目前方案</th>
              <th className="px-3 py-2.5 font-medium">訂閱狀態</th>
              <th className="px-3 py-2.5 font-medium">付款狀態</th>
              <th className="px-3 py-2.5 font-medium">付款方式</th>
              <th className="px-3 py-2.5 font-medium">週期</th>
              <th className="px-3 py-2.5 font-medium">起始日</th>
              <th className="px-3 py-2.5 font-medium">到期日</th>
              <th className="px-3 py-2.5 text-right font-medium">金額</th>
              <th className="px-3 py-2.5 font-medium">備註</th>
              <th className="px-4 py-2.5 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ store, sub }) => (
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
                    <td className="px-3 py-3 text-earth-700">
                      {STATUS_LABELS[sub.status] ?? sub.status}
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
                      colSpan={8}
                    >
                      尚未建立訂閱
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/hq/dashboard/stores/subscriptions/${store.id}`}
                        className="rounded-lg bg-primary-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-primary-700"
                      >
                        建立訂閱
                      </Link>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {rows.length === 0 ? (
        <p className="px-1 text-[13px] text-earth-400">目前沒有任何店家。</p>
      ) : null}
    </PageShell>
  );
}
