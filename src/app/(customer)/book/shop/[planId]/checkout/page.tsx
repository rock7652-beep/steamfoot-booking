import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { getShopConfig } from "@/lib/shop-config";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
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

type UnavailableReason =
  | "store-context"
  | "customer-not-found"
  | "plan-not-found"
  | "cross-store"
  | "plan-inactive"
  | "plan-not-public";

const REASON_COPY: Record<UnavailableReason, { title: string; message: string }> = {
  "store-context": {
    title: "無法確認店別",
    message: "系統無法辨識您目前所在的店舖。請從店舖專屬連結重新進入。",
  },
  "customer-not-found": {
    title: "找不到您的顧客資料",
    message: "登入 session 對應的顧客資料不存在。請登出後重新登入。",
  },
  "plan-not-found": {
    title: "找不到此方案",
    message: "這個方案可能已被移除，或連結已失效。",
  },
  "cross-store": {
    title: "方案不屬於您的店別",
    message: "您無法購買其他店的方案。請回到方案列表選擇其他方案。",
  },
  "plan-inactive": {
    title: "方案已下架",
    message: "此方案目前不開放購買。若您已購買過，既有錢包不受影響。",
  },
  "plan-not-public": {
    title: "方案未開放給顧客",
    message: "此方案目前僅限店長後台指派，沒有開放線上購買。",
  },
};

export default async function CheckoutPage({ params }: PageProps) {
  const { planId } = await params;

  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  const storeCtx = await getStoreContext();
  const storeId = storeCtx?.storeId;
  const storeSlug = storeCtx?.storeSlug ?? "zhubei";
  const prefix = `/s/${storeSlug}`;

  if (!storeId) {
    console.warn("[CheckoutPage] missing store context", {
      customerId: user.customerId,
      planId,
      storeSlug,
    });
    return <UnavailableState reason="store-context" prefix={prefix} />;
  }

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

  // ── Diagnostic guards — log specific reason to Vercel logs, render inline error page
  //    (replaces raw notFound() so the tester can see the root cause + a back link)
  if (!customer) {
    console.warn("[CheckoutPage] customer not found", {
      customerId: user.customerId,
    });
    return <UnavailableState reason="customer-not-found" prefix={prefix} />;
  }
  if (!plan) {
    console.warn("[CheckoutPage] plan not found", { planId, storeId });
    return <UnavailableState reason="plan-not-found" prefix={prefix} />;
  }
  if (customer.storeId !== plan.storeId) {
    console.warn("[CheckoutPage] cross-store access blocked", {
      customerId: user.customerId,
      customerStoreId: customer.storeId,
      planId: plan.id,
      planStoreId: plan.storeId,
    });
    return <UnavailableState reason="cross-store" prefix={prefix} />;
  }
  if (!plan.isActive) {
    console.warn("[CheckoutPage] plan inactive", { planId: plan.id });
    return <UnavailableState reason="plan-inactive" prefix={prefix} />;
  }
  if (!plan.publicVisible) {
    console.warn("[CheckoutPage] plan not publicVisible", { planId: plan.id });
    return <UnavailableState reason="plan-not-public" prefix={prefix} />;
  }

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

// ============================================================
// UnavailableState — 取代 notFound()，讓使用者看得到具體原因 + 回上頁入口
// ============================================================

function UnavailableState({
  reason,
  prefix,
}: {
  reason: UnavailableReason;
  prefix: string;
}) {
  const copy = REASON_COPY[reason];
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="rounded-xl border border-earth-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.333 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285zm0 13.036h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="mb-2 text-lg font-bold text-earth-900">{copy.title}</h1>
        <p className="mb-5 text-sm text-earth-600">{copy.message}</p>
        <div className="flex flex-col gap-2">
          <Link
            href={`${prefix}/book/shop`}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            返回方案列表
          </Link>
          <Link
            href={`${prefix}/book`}
            className="text-xs text-earth-500 hover:text-earth-700"
          >
            返回首頁
          </Link>
        </div>
        <p className="mt-4 text-[11px] text-earth-400">
          原因代碼：<code className="rounded bg-earth-100 px-1">{reason}</code>
        </p>
      </div>
    </div>
  );
}
