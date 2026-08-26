import Link from "next/link";
import type { PlanCategory } from "@prisma/client";
import { notFound } from "next/navigation";
import { getFrontendPlans } from "@/server/queries/plan";
import { resolveStorePresentation, resolveStoreSlugForLiff } from "@/lib/store-resolver";

const CATEGORY_LABEL: Record<PlanCategory, string> = {
  TRIAL: "體驗",
  SINGLE: "單次",
  PACKAGE: "課程",
};

export const dynamic = "force-dynamic";

export default async function LiffPlanShopPage() {
  const slug = await resolveStoreSlugForLiff();
  if (!slug) notFound();
  const store = await resolveStorePresentation(slug);
  if (!store) notFound();
  const plans = await getFrontendPlans(store.id);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <header className="text-center">
        <p className="text-xs uppercase tracking-widest text-earth-500">{store.name}</p>
        <h1 className="mt-1 text-xl font-bold text-earth-900">購買／續購方案</h1>
        <p className="mt-2 text-sm text-earth-600">選擇方案後，可直接在 LINE 內完成購買申請。</p>
      </header>

      {plans.length === 0 ? (
        <div className="rounded-xl border border-earth-200 bg-white px-4 py-8 text-center text-sm text-earth-600">
          目前沒有可購買的方案，請聯絡店家。
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {plans.map((plan) => {
            const price = Number(plan.price);
            return (
              <Link
                key={plan.id}
                href={`/s/${store.slug}/liff/wallets/shop/${plan.id}`}
                className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm transition active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="rounded bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                      {CATEGORY_LABEL[plan.category]}
                    </span>
                    <h2 className="mt-2 text-base font-semibold text-earth-900">{plan.name}</h2>
                    <p className="mt-1 text-sm text-earth-600">
                      {plan.sessionCount} 堂{plan.validityDays ? `・${plan.validityDays} 天有效` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold text-primary-700">NT$ {price.toLocaleString()}</p>
                    <p className="mt-1 text-sm font-semibold text-primary-700">選擇方案 →</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Link href={`/s/${store.slug}/liff/wallets`} className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-earth-300 bg-white px-4 py-3 font-medium text-earth-700">
        返回我的方案
      </Link>
    </div>
  );
}
