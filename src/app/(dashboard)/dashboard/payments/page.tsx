import { getPendingPaymentTransactions, type PendingRowStatus } from "@/server/queries/transaction";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
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

const STATUS_BADGE: Record<PendingRowStatus, { label: string; className: string }> = {
  complete: { label: "可確認", className: "bg-green-100 text-green-700" },
  review: { label: "待核對", className: "bg-amber-100 text-amber-700" },
  unpaid: { label: "未付款", className: "bg-red-100 text-red-700" },
  anomaly: { label: "資料異常", className: "bg-earth-200 text-earth-600" },
};

function StatusBadge({ status }: { status: PendingRowStatus }) {
  const cfg = STATUS_BADGE[status];
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function ActionCell({
  status,
  customerId,
  confirmProps,
}: {
  status: PendingRowStatus;
  customerId: string | null;
  confirmProps: React.ComponentProps<typeof ConfirmPaymentButton>;
}) {
  if (status === "complete") {
    return <ConfirmPaymentButton {...confirmProps} />;
  }
  if (status === "review") {
    return customerId ? (
      <Link
        href={`/dashboard/customers/${customerId}`}
        className="inline-block rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
      >
        查看資料
      </Link>
    ) : (
      <span className="inline-block rounded-lg bg-earth-100 px-3 py-1.5 text-xs text-earth-400">
        待核對
      </span>
    );
  }
  if (status === "unpaid") {
    return (
      <span className="inline-block cursor-not-allowed rounded-lg bg-earth-100 px-3 py-1.5 text-xs text-earth-400">
        尚未付款
      </span>
    );
  }
  return (
    <span className="inline-block cursor-not-allowed rounded-lg bg-earth-100 px-3 py-1.5 text-xs text-earth-400">
      不可處理
    </span>
  );
}

export default async function PendingPaymentsPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "transaction.create"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const { transactions, total, totalAmount, confirmableCount } =
    await getPendingPaymentTransactions({
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
        <h1 className="text-xl font-bold text-earth-900">付款確認工作台</h1>
      </div>

      <p className="mb-4 text-sm text-earth-500">
        確認已收到款項後，系統會自動開通顧客方案與堂數。
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="待確認筆數" value={total} unit="筆" color="amber" />
        <KpiCard
          label="待確認金額"
          value={`NT$ ${totalAmount.toLocaleString()}`}
          color="primary"
        />
        <KpiCard
          label="可直接確認筆數"
          value={confirmableCount}
          unit="筆"
          color="green"
        />
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          icon="empty"
          title="目前沒有待確認付款"
          description="顧客完成購買或填寫匯款資料後，會出現在這裡。"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-earth-200 bg-earth-50">
                  <th className="px-4 py-3 text-left font-medium text-earth-500">處理狀態</th>
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
                  const planName =
                    tx.customerPlanWallet?.plan?.name ?? tx.planNameSnapshot ?? "—";
                  const transferLast5 = tx.bankLast5 || tx.transferLastFour || "";
                  return (
                    <tr key={tx.id} className="transition-colors hover:bg-earth-50">
                      <td className="px-4 py-3">
                        <StatusBadge status={tx.rowStatus} />
                      </td>
                      <td className="px-4 py-3">
                        {tx.customer ? (
                          <>
                            <Link
                              href={`/dashboard/customers/${tx.customer.id}`}
                              className="font-medium text-earth-900 hover:text-primary-600 hover:underline"
                            >
                              {tx.customer.name}
                            </Link>
                            {tx.customer.phone && (
                              <div className="text-xs text-earth-400">{tx.customer.phone}</div>
                            )}
                          </>
                        ) : (
                          <span className="text-earth-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-earth-700">{planName}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-primary-700">
                        NT$ {amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            tx.paymentMethod === "UNPAID"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {PAYMENT_METHOD_LABEL[tx.paymentMethod] ?? tx.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-earth-500">
                        {tx.referenceNo || tx.bankLast5 || tx.transferLastFour || tx.customerNote ? (
                          <div className="space-y-0.5">
                            {tx.transferLastFour && (
                              <div>
                                顧客末四碼：
                                <span className="font-mono font-semibold text-earth-800">
                                  {tx.transferLastFour}
                                </span>
                              </div>
                            )}
                            {tx.customerNote && (
                              <div className="whitespace-pre-wrap break-words text-earth-600">
                                備註：{tx.customerNote}
                              </div>
                            )}
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
                        <ActionCell
                          status={tx.rowStatus}
                          customerId={tx.customer?.id ?? null}
                          confirmProps={{
                            transactionId: tx.id,
                            customerName: tx.customer?.name ?? "—",
                            planName,
                            amount,
                            paymentMethodLabel:
                              PAYMENT_METHOD_LABEL[tx.paymentMethod] ?? tx.paymentMethod,
                            transferLast5,
                            initialReferenceNo: tx.referenceNo ?? "",
                            initialBankLast5: tx.bankLast5 ?? "",
                            customerTransferLastFour: tx.transferLastFour,
                            customerNote: tx.customerNote,
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="divide-y divide-earth-100 md:hidden">
            {transactions.map((tx) => {
              const amount = Number(tx.amount);
              const planName =
                tx.customerPlanWallet?.plan?.name ?? tx.planNameSnapshot ?? "—";
              const transferLast5 = tx.bankLast5 || tx.transferLastFour || "";
              return (
                <div key={tx.id} className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <StatusBadge status={tx.rowStatus} />
                    <span className="font-semibold text-primary-700">
                      NT$ {amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      {tx.customer ? (
                        <Link
                          href={`/dashboard/customers/${tx.customer.id}`}
                          className="font-medium text-earth-900 hover:text-primary-600"
                        >
                          {tx.customer.name}
                        </Link>
                      ) : (
                        <span className="text-earth-400">—</span>
                      )}
                      <div className="mt-0.5 text-xs text-earth-400">{planName}</div>
                    </div>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded px-2 py-0.5 font-medium ${
                        tx.paymentMethod === "UNPAID"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {PAYMENT_METHOD_LABEL[tx.paymentMethod] ?? tx.paymentMethod}
                    </span>
                    <span className="text-earth-400">
                      {formatTWTime(tx.createdAt, { style: "short" })}
                    </span>
                  </div>
                  {(tx.referenceNo || tx.bankLast5 || tx.transferLastFour || tx.customerNote) && (
                    <div className="mb-2 space-y-0.5 text-xs text-earth-500">
                      {tx.transferLastFour && (
                        <div>
                          顧客末四碼：
                          <span className="font-mono font-semibold text-earth-800">
                            {tx.transferLastFour}
                          </span>
                        </div>
                      )}
                      {tx.customerNote && (
                        <div className="whitespace-pre-wrap break-words text-earth-600">
                          備註：{tx.customerNote}
                        </div>
                      )}
                      {tx.referenceNo && <div>參考：{tx.referenceNo}</div>}
                      {tx.bankLast5 && <div>末五：{tx.bankLast5}</div>}
                    </div>
                  )}
                  <ActionCell
                    status={tx.rowStatus}
                    customerId={tx.customer?.id ?? null}
                    confirmProps={{
                      transactionId: tx.id,
                      customerName: tx.customer?.name ?? "—",
                      planName,
                      amount,
                      paymentMethodLabel:
                        PAYMENT_METHOD_LABEL[tx.paymentMethod] ?? tx.paymentMethod,
                      transferLast5,
                      initialReferenceNo: tx.referenceNo ?? "",
                      initialBankLast5: tx.bankLast5 ?? "",
                      customerTransferLastFour: tx.transferLastFour,
                      customerNote: tx.customerNote,
                    }}
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
