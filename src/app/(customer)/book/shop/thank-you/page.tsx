import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { getShopConfig } from "@/lib/shop-config";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatTWTime } from "@/lib/date-utils";

interface PageProps {
  searchParams: Promise<{ txId?: string }>;
}

export default async function ThankYouPage({ searchParams }: PageProps) {
  const { txId } = await searchParams;

  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  const storeCtx = await getStoreContext();
  const storeId = storeCtx?.storeId;
  const storeSlug = storeCtx?.storeSlug ?? "zhubei";

  // 讀 transaction 作 summary 顯示（限自己的、本店的）
  const tx =
    txId && storeId
      ? await prisma.transaction.findFirst({
          where: {
            id: txId,
            customerId: user.customerId,
            storeId,
          },
          select: {
            id: true,
            amount: true,
            paymentStatus: true,
            createdAt: true,
            planNameSnapshot: true,
            servicePlan: { select: { name: true } },
            customer: { select: { name: true } },
          },
        })
      : null;

  const shopConfig = storeId ? await getShopConfig(storeId) : null;
  const prefix = `/s/${storeSlug}`;
  const planName = tx?.planNameSnapshot ?? tx?.servicePlan?.name ?? "—";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Hero */}
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-9 w-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-earth-900">已收到您的購買申請</h1>
        <p className="mt-1 text-sm text-earth-500">請按下列步驟完成付款</p>
      </div>

      {/* Tx summary */}
      {tx ? (
        <section className="mb-5 rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-earth-700">訂單摘要</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-earth-500">方案</span>
              <span className="font-medium text-earth-900">{planName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-earth-500">金額</span>
              <span className="font-semibold text-primary-700">
                NT$ {Number(tx.amount).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-earth-500">申請時間</span>
              <span className="text-earth-700">{formatTWTime(tx.createdAt, { style: "short" })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-earth-500">狀態</span>
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                待確認付款
              </span>
            </div>
          </div>
        </section>
      ) : (
        <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          找不到對應的訂單，但您的申請已送出。請透過 LINE@ 聯繫店長確認。
        </section>
      )}

      {/* Next steps */}
      <section className="mb-5 rounded-xl border border-primary-200 bg-primary-50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-primary-800">下一步</h2>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
              1
            </span>
            <div>
              <p className="font-medium text-earth-900">轉帳至店家帳戶</p>
              {shopConfig?.bankAccountNumber ? (
                <p className="mt-0.5 font-mono text-xs text-earth-600">
                  {shopConfig.bankName ?? ""}
                  {shopConfig.bankCode ? ` (${shopConfig.bankCode})` : ""}{" "}
                  {shopConfig.bankAccountNumber}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-earth-500">請聯繫店家取得帳戶資訊</p>
              )}
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
              2
            </span>
            <div>
              <p className="font-medium text-earth-900">到 LINE@ 提供轉帳末五碼</p>
              <p className="mt-0.5 text-xs text-earth-500">
                店長會幫您確認入帳，方案立即啟用
              </p>
            </div>
          </li>
        </ol>

        {shopConfig?.lineOfficialUrl ? (
          <a
            href={shopConfig.lineOfficialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#06C755] px-4 py-3 font-semibold text-white hover:bg-[#05b34c]"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.365 9.89c.50 0 .906.41.906.91s-.406.91-.906.91h-2.54v1.631h2.54c.5 0 .906.41.906.91 0 .5-.406.91-.906.91h-3.448a.91.91 0 01-.906-.91V8.235a.91.91 0 01.906-.91h3.448c.5 0 .906.41.906.91 0 .5-.406.91-.906.91h-2.54v1.631h2.54zm-5.777 4.412a.91.91 0 01-.906.91.903.903 0 01-.726-.362l-3.531-4.805v4.257a.91.91 0 01-.906.91.91.91 0 01-.906-.91V8.235a.91.91 0 01.906-.91c.287 0 .551.136.726.362l3.531 4.805V8.235a.91.91 0 01.906-.91.91.91 0 01.906.91v6.067zm-8.16 0a.91.91 0 01-.906.91.91.91 0 01-.906-.91V8.235a.91.91 0 01.906-.91.91.91 0 01.906.91v6.067zM12 0C5.373 0 0 4.975 0 11.111c0 5.497 4.263 10.098 10.022 10.969.39.084.921.258 1.055.593.121.305.079.783.039 1.097 0 0-.141.843-.171 1.024-.053.305-.243 1.193 1.045.651 1.288-.543 6.942-4.088 9.471-6.997C23.155 16.524 24 13.947 24 11.111 24 4.975 18.627 0 12 0" />
            </svg>
            <span>開啟 LINE@</span>
          </a>
        ) : (
          <p className="mt-4 rounded bg-white/60 p-2 text-center text-xs text-earth-600">
            店家尚未設定 LINE@ 連結
          </p>
        )}
      </section>

      {/* Secondary links */}
      <div className="flex flex-col gap-2 text-center">
        <Link
          href={`${prefix}/my-plans`}
          className="rounded-lg border border-earth-200 bg-white px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
        >
          查看我的方案
        </Link>
        <Link
          href={`${prefix}/book`}
          className="text-sm text-earth-500 hover:text-earth-700"
        >
          返回首頁
        </Link>
      </div>
    </div>
  );
}
