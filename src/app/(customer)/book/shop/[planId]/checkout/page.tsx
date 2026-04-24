import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { getShopConfig } from "@/lib/shop-config";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { PlanCategory } from "@prisma/client";
import { PurchaseButton } from "./purchase-button";
import { CopyButton } from "./copy-button";

const CATEGORY_LABEL: Record<PlanCategory, string> = {
  TRIAL: "體驗",
  SINGLE: "單次",
  PACKAGE: "課程",
};

interface PageProps {
  params: Promise<{ planId: string }>;
}

export default async function CheckoutPage({ params }: PageProps) {
  const { planId } = await params;

  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  const storeCtx = await getStoreContext();
  const storeId = storeCtx?.storeId;
  const storeSlug = storeCtx?.storeSlug ?? "zhubei";
  if (!storeId) notFound();

  // 驗證顧客 + 方案
  const [customer, plan, shopConfig] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: user.customerId },
      select: { id: true, storeId: true, name: true },
    }),
    prisma.servicePlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        storeId: true,
        name: true,
        category: true,
        price: true,
        sessionCount: true,
        validityDays: true,
        description: true,
        isActive: true,
        publicVisible: true,
      },
    }),
    getShopConfig(storeId),
  ]);

  if (!customer || !plan) notFound();
  if (customer.storeId !== plan.storeId) notFound();
  if (!plan.isActive || !plan.publicVisible) notFound();

  const prefix = `/s/${storeSlug}`;
  const price = Number(plan.price);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4">
        <Link
          href={`${prefix}/book/shop`}
          className="text-sm text-earth-500 hover:text-earth-700"
        >
          ← 返回方案列表
        </Link>
      </div>

      <h1 className="mb-4 text-xl font-bold text-earth-900">確認購買</h1>

      {/* Plan summary */}
      <section className="mb-4 rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-earth-700">方案內容</h2>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-earth-500">方案名稱</span>
            <span className="font-medium text-earth-900">
              [{CATEGORY_LABEL[plan.category]}] {plan.name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-earth-500">堂數</span>
            <span className="text-earth-800">{plan.sessionCount} 堂</span>
          </div>
          {plan.validityDays && (
            <div className="flex justify-between">
              <span className="text-sm text-earth-500">有效期限</span>
              <span className="text-earth-800">{plan.validityDays} 天</span>
            </div>
          )}
          {plan.description && (
            <div className="mt-2 border-t border-earth-100 pt-2 text-sm text-earth-500">
              {plan.description}
            </div>
          )}
          <div className="mt-3 flex justify-between border-t border-earth-100 pt-3">
            <span className="font-semibold text-earth-700">應付金額</span>
            <span className="text-2xl font-bold text-primary-700">
              NT$ {price.toLocaleString()}
            </span>
          </div>
        </div>
      </section>

      {/* Bank transfer info */}
      <section className="mb-4 rounded-xl border border-primary-200 bg-primary-50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-primary-800">付款方式：銀行轉帳</h2>

        {shopConfig.bankAccountNumber ? (
          <div className="space-y-2.5">
            {shopConfig.bankName && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-earth-500">銀行</span>
                <span className="font-medium text-earth-900">{shopConfig.bankName}</span>
              </div>
            )}
            {shopConfig.bankCode && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-earth-500">代號</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-earth-900">{shopConfig.bankCode}</span>
                  <CopyButton value={shopConfig.bankCode} />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-earth-500">帳號</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-semibold text-earth-900">
                  {shopConfig.bankAccountNumber}
                </span>
                <CopyButton value={shopConfig.bankAccountNumber} />
              </div>
            </div>
          </div>
        ) : (
          <p className="rounded bg-amber-100 p-3 text-sm text-amber-800">
            店家尚未設定轉帳資訊，請透過 LINE@ 聯繫店長。
          </p>
        )}
      </section>

      {/* Instructions */}
      <section className="mb-5 rounded-lg border border-earth-100 bg-white p-3 text-sm text-earth-600">
        <p className="font-medium text-earth-800">購買流程</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs">
          <li>按下方「送出購買申請」→ 系統建立待確認訂單</li>
          <li>轉帳至上方銀行帳號</li>
          <li>到 LINE@ 提供轉帳末五碼</li>
          <li>店長確認入帳後，方案立即啟用</li>
        </ol>
      </section>

      {/* Submit */}
      <PurchaseButton planId={plan.id} routePrefix={prefix} />

      <p className="mt-3 text-center text-xs text-earth-400">
        送出後可到「預約與方案」查看購買紀錄
      </p>
    </div>
  );
}
