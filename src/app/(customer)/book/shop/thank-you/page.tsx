import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
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
        <p className="mt-1 text-sm text-earth-500">店長確認入帳後，方案就會啟用</p>
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
          您的購買申請已送出，店長確認入帳後，方案就會啟用。
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
              <p className="font-medium text-earth-900">等待店長確認入帳</p>
              <p className="mt-0.5 text-xs text-earth-500">
                店長會依您填寫的轉帳末四碼與備註進行確認。
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
              2
            </span>
            <div>
              <p className="font-medium text-earth-900">確認完成後，方案會啟用</p>
              <p className="mt-0.5 text-xs text-earth-500">
                您可以到「我的方案」查看狀態。
              </p>
            </div>
          </li>
        </ol>
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
