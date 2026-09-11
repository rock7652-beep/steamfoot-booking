import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getShopConfig } from "@/lib/shop-config";
import { resolveStorePresentation, resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { PurchaseButton } from "@/app/(customer)/book/shop/[planId]/checkout/purchase-button";

export const dynamic = "force-dynamic";

export default async function LiffPlanCheckoutPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const slug = await resolveStoreSlugForLiff();
  if (!slug) notFound();
  const store = await resolveStorePresentation(slug);
  if (!store) notFound();

  const [plan, config] = await Promise.all([
    prisma.servicePlan.findFirst({
      where: { id: planId, storeId: store.id, isActive: true, publicVisible: true },
      select: { id: true, name: true, price: true, sessionCount: true, validityDays: true, description: true },
    }),
    getShopConfig(store.id),
  ]);
  if (!plan) notFound();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <header className="text-center">
        <p className="text-xs uppercase tracking-widest text-earth-500">{store.name}</p>
        <h1 className="mt-1 text-xl font-bold text-earth-900">確認購買方案</h1>
      </header>

      <section className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-earth-900">{plan.name}</h2>
            <p className="mt-1 text-sm text-earth-600">{plan.sessionCount} 堂{plan.validityDays ? `・${plan.validityDays} 天有效` : ""}</p>
          </div>
          <p className="shrink-0 text-xl font-bold text-primary-700">NT$ {Number(plan.price).toLocaleString()}</p>
        </div>
        {plan.description ? <p className="mt-3 border-t border-earth-100 pt-3 text-sm text-earth-600">{plan.description}</p> : null}
      </section>

      <section className="rounded-xl border border-primary-200 bg-primary-50 p-4">
        <h2 className="text-sm font-semibold text-primary-800">付款方式：銀行轉帳</h2>
        {config.bankAccountNumber ? (
          <div className="mt-3 space-y-2 text-sm text-earth-800">
            {config.bankName ? <p>銀行：{config.bankName}</p> : null}
            {config.bankCode ? <p>代號：{config.bankCode}</p> : null}
            <p className="font-medium">帳號：{config.bankAccountNumber}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-amber-800">店家尚未設定轉帳資訊，請先聯絡店家。</p>
        )}
      </section>

      <PurchaseButton
        planId={plan.id}
        successPath={`/s/${store.slug}/liff/wallets/shop/thank-you`}
      />

      <Link href={`/s/${store.slug}/liff/wallets/shop`} className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-earth-300 bg-white px-4 py-3 font-medium text-earth-700">
        返回方案列表
      </Link>
    </div>
  );
}
