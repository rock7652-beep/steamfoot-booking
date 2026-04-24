import { getPendingPaymentTransactions } from "@/server/queries/transaction";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTWTime } from "@/lib/date-utils";
import { ConfirmPaymentButton } from "./confirm-button";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  TRANSFER: "匯款",
  UNPAID: "未付款",
  CASH: "現金",
  LINE_PAY: "LINE Pay",
  CREDIT_CARD: "信用卡",
  OTHER: "其他",
};

export default async function PendingPaymentsPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "transaction.create"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const { transactions, total, totalAmount } = await getPendingPaymentTransactions({
    activeStoreId,
    page: 1,
    pageSize: 50,
  });

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-earth-500 hover:text-earth-700">
          ← 首頁
        </Link>
        <h1 className="text-xl font-bold text-earth-900">待確認付款</h1>
      </div>

      <p className="mb-4 text-sm text-earth-500">
        此頁列出所有建單時為「匯款」或「未付款」的交易。確認後交易會進入營收並觸發顧客升等 / 首儲推薦獎勵。
      </p>

      {/* KPI */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-earth-500">待確認筆數</div>
          <div className="mt-1 text-2xl font-bold text-earth-900">{total}</div>
        </div>
        <div className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-earth-500">待確認金額總計</div>
          <div className="mt-1 text-2xl font-bold text-primary-700">
            NT$ {totalAmount.toLocaleString()}
          </div>
        </div>
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          icon="empty"
          title="目前沒有待確認付款"
          description="所有匯款 / 未付款交易皆已確認入帳"
        />
      ) : (
        <div className="rounded-xl border border-earth-200 bg-white shadow-sm overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-earth-200 bg-earth-50">
                  <th className="px-4 py-3 text-left font-medium text-earth-500">顧客</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-500">方案</th>
                  <th className="px-4 py-3 text-right font-medium text-earth-500">金額</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-500">付款方式</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-500">轉帳資訊</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-500">建立時間</th>
                  <th className="px-4 py-3 text-center font-medium text-earth-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-earth-100">
                {transactions.map((tx) => {
                  const amount = Number(tx.amount);
                  return (
                    <tr key={tx.id} className="transition-colors hover:bg-earth-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/customers/${tx.customer.id}`}
                          className="font-medium text-earth-900 hover:text-primary-600 hover:underline"
                        >
                          {tx.customer.name}
                        </Link>
                        {tx.customer.phone && (
                          <div className="text-xs text-earth-400">{tx.customer.phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-earth-700">
                          {tx.customerPlanWallet?.plan?.name ?? tx.planNameSnapshot ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-primary-700">
                        NT$ {amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {PAYMENT_METHOD_LABEL[tx.paymentMethod] ?? tx.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-earth-500">
                        {tx.referenceNo || tx.bankLast5 ? (
                          <div className="space-y-0.5">
                            {tx.referenceNo && <div>參考：{tx.referenceNo}</div>}
                            {tx.bankLast5 && <div>末五：{tx.bankLast5}</div>}
                          </div>
                        ) : (
                          <span className="text-earth-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-earth-500">
                        {formatTWTime(tx.createdAt, { style: "short" })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ConfirmPaymentButton
                          transactionId={tx.id}
                          customerName={tx.customer.name}
                          planName={tx.customerPlanWallet?.plan?.name ?? tx.planNameSnapshot ?? "—"}
                          amount={amount}
                          paymentMethodLabel={PAYMENT_METHOD_LABEL[tx.paymentMethod] ?? tx.paymentMethod}
                          initialReferenceNo={tx.referenceNo ?? ""}
                          initialBankLast5={tx.bankLast5 ?? ""}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="md:hidden divide-y divide-earth-100">
            {transactions.map((tx) => {
              const amount = Number(tx.amount);
              return (
                <div key={tx.id} className="p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <Link
                        href={`/dashboard/customers/${tx.customer.id}`}
                        className="font-medium text-earth-900 hover:text-primary-600"
                      >
                        {tx.customer.name}
                      </Link>
                      <div className="mt-0.5 text-xs text-earth-400">
                        {tx.customerPlanWallet?.plan?.name ?? tx.planNameSnapshot ?? "—"}
                      </div>
                    </div>
                    <span className="font-semibold text-primary-700">
                      NT$ {amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                      {PAYMENT_METHOD_LABEL[tx.paymentMethod] ?? tx.paymentMethod}
                    </span>
                    <span className="text-earth-400">
                      {formatTWTime(tx.createdAt, { style: "short" })}
                    </span>
                  </div>
                  {(tx.referenceNo || tx.bankLast5) && (
                    <div className="mb-2 space-y-0.5 text-xs text-earth-500">
                      {tx.referenceNo && <div>參考：{tx.referenceNo}</div>}
                      {tx.bankLast5 && <div>末五：{tx.bankLast5}</div>}
                    </div>
                  )}
                  <ConfirmPaymentButton
                    transactionId={tx.id}
                    customerName={tx.customer.name}
                    planName={tx.customerPlanWallet?.plan?.name ?? tx.planNameSnapshot ?? "—"}
                    amount={amount}
                    paymentMethodLabel={PAYMENT_METHOD_LABEL[tx.paymentMethod] ?? tx.paymentMethod}
                    initialReferenceNo={tx.referenceNo ?? ""}
                    initialBankLast5={tx.bankLast5 ?? ""}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
