import { getCurrentUser } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { SubscriptionForm, type SubscriptionInitial } from "./subscription-form";

/**
 * /dashboard/settings/store-subscriptions/[storeId] — 建立 / 編輯該店訂閱
 *
 * 有 currentSubscription（或最新一筆）→ 編輯；否則 → 建立。
 * 僅 ADMIN / OWNER 可進入。
 */

const subSelect = {
  id: true,
  plan: true,
  status: true,
  billingCycle: true,
  startedAt: true,
  effectiveAt: true,
  expiresAt: true,
  billingStatus: true,
  paymentMethod: true,
  priceAmount: true,
  note: true,
} as const;

/** DB date 欄位讀回成 YYYY-MM-DD（AGENTS.md 允許的例外） */
function toInputDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function StoreSubscriptionFormPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/hq/login");
  if (user.role !== "ADMIN" && user.role !== "OWNER") notFound();

  const { storeId } = await params;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
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
  });
  if (!store) notFound();

  const sub = store.currentSubscription ?? store.subscriptions[0] ?? null;
  const isEdit = sub !== null;

  const initial: SubscriptionInitial | null = sub
    ? {
        subscriptionId: sub.id,
        plan: sub.plan,
        status: sub.status,
        billingCycle: sub.billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY",
        startedAt: toInputDate(sub.startedAt),
        effectiveAt: toInputDate(sub.effectiveAt),
        expiresAt: toInputDate(sub.expiresAt),
        billingStatus: sub.billingStatus,
        paymentMethod: sub.paymentMethod ?? "",
        priceAmount: sub.priceAmount,
        note: sub.note ?? "",
      }
    : null;

  return (
    <PageShell className="mx-auto flex max-w-[760px] flex-col gap-4 px-5 py-4">
      <PageHeader
        title={`${isEdit ? "編輯" : "建立"}訂閱 · ${store.name}`}
        subtitle={`${store.slug}　目前方案：${store.plan}（Store.plan，本頁不改動）`}
        actions={
          <Link
            href="/dashboard/settings/store-subscriptions"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回列表
          </Link>
        }
      />
      <SubscriptionForm storeId={store.id} isEdit={isEdit} initial={initial} />
    </PageShell>
  );
}
