import { getCustomerDetail } from "@/server/queries/customer";
import { listPlans } from "@/server/queries/plan";
import { listStaffSelectOptions } from "@/server/queries/staff";
import { getCurrentUser } from "@/lib/session";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AssignPlanForm } from "./assign-plan-form";
import { TransferCustomerForm } from "./transfer-customer-form";
import { CreateBookingForm } from "./create-booking-form";
import { AdjustWalletForm } from "./adjust-wallet-form";
import { updateCustomerStage } from "@/server/actions/customer";

const STAGE_LABEL: Record<string, string> = {
  LEAD: "名單", TRIAL: "體驗", ACTIVE: "已購課", INACTIVE: "已停用",
};
const STAGE_COLOR: Record<string, string> = {
  LEAD: "bg-gray-100 text-gray-700", TRIAL: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700", INACTIVE: "bg-yellow-100 text-yellow-700",
};
const WALLET_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "有效", USED_UP: "已用完", EXPIRED: "已過期", CANCELLED: "已取消",
};
const TX_TYPE_LABEL: Record<string, string> = {
  TRIAL_PURCHASE: "體驗購買", SINGLE_PURCHASE: "單次消費", PACKAGE_PURCHASE: "套餐購買",
  SESSION_DEDUCTION: "堂數扣抵", SUPPLEMENT: "補差額", REFUND: "退款", ADJUSTMENT: "手動調整",
};
const BOOKING_STATUS_LABEL: Record<string, string> = {
  PENDING: "待確認", CONFIRMED: "已確認", COMPLETED: "已完成",
  CANCELLED: "已取消", NO_SHOW: "未到",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const [customer, plans, staffOptions] = await Promise.all([
    getCustomerDetail(id),
    listPlans(),
    // listStaffSelectOptions uses requireStaffSession, safe for all staff roles
    listStaffSelectOptions(),
  ]);

  // For transfer form, only pass staff list to Owner
  const staffList =
    user.role === "OWNER"
      ? staffOptions.map((s) => ({ id: s.id, displayName: s.displayName }))
      : [];

  const activeWallets = customer.planWallets.filter((w) => w.status === "ACTIVE");
  const totalRemaining = activeWallets.reduce((s, w) => s + w.remainingSessions, 0);

  const upcomingBookings = customer.bookings.filter(
    (b) => b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED"
  );
  const historyBookings = customer.bookings.filter(
    (b) => b.bookingStatus !== "PENDING" && b.bookingStatus !== "CONFIRMED"
  );

  // Inline Server Action: update stage
  async function handleStageChange(formData: FormData) {
    "use server";
    const stage = formData.get("stage") as "LEAD" | "TRIAL" | "ACTIVE" | "INACTIVE";
    await updateCustomerStage(id, stage);
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/customers" className="text-sm text-gray-500 hover:text-gray-700">
          ← 顧客列表
        </Link>
      </div>

      {/* Basic Info */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{customer.name}</h1>
            <p className="mt-0.5 text-sm text-gray-500">{customer.phone}</p>
            {customer.lineName && <p className="text-xs text-gray-400">LINE: {customer.lineName}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded px-2 py-1 text-xs font-medium ${STAGE_COLOR[customer.customerStage] ?? "bg-gray-100 text-gray-700"}`}>
              {STAGE_LABEL[customer.customerStage] ?? customer.customerStage}
            </span>
            {customer.selfBookingEnabled && (
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                自助預約開啟
              </span>
            )}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-gray-500">直屬店長</dt>
            <dd className="font-medium">{customer.assignedStaff.displayName}</dd>
          </div>
          <div>
            <dt className="text-gray-500">剩餘堂數</dt>
            <dd className="text-lg font-bold text-indigo-700">{totalRemaining} 堂</dd>
          </div>
          <div>
            <dt className="text-gray-500">首次到店</dt>
            <dd>{customer.firstVisitAt ? new Date(customer.firstVisitAt).toLocaleDateString("zh-TW") : "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">首次購課</dt>
            <dd>{customer.convertedAt ? new Date(customer.convertedAt).toLocaleDateString("zh-TW") : "—"}</dd>
          </div>
          {customer.notes && (
            <div className="col-span-3">
              <dt className="text-gray-500">備註</dt>
              <dd className="text-gray-700">{customer.notes}</dd>
            </div>
          )}
        </dl>

        {/* Stage change */}
        <form action={handleStageChange} className="mt-4 flex items-center gap-2 border-t pt-4">
          <label className="text-sm text-gray-600">更新狀態：</label>
          <select
            name="stage"
            defaultValue={customer.customerStage}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {Object.entries(STAGE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button type="submit" className="rounded bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200">
            更新
          </button>
        </form>

        {/* Transfer (Owner only) */}
        {user.role === "OWNER" && staffList.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <TransferCustomerForm
              customerId={id}
              currentStaffId={customer.assignedStaffId}
              staffList={staffList}
            />
          </div>
        )}
      </div>

      {/* Wallets */}
      <div id="plan" className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">課程方案</h2>
          <AssignPlanForm customerId={id} plans={plans.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            price: Number(p.price),
            sessionCount: p.sessionCount,
          }))} />
        </div>
        {customer.planWallets.length === 0 ? (
          <p className="text-sm text-gray-400">尚未購買課程</p>
        ) : (
          <div className="space-y-3">
            {customer.planWallets.map((w) => (
              <div key={w.id} className={`rounded-lg border p-3 ${w.status !== "ACTIVE" ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-medium">{w.plan.name}</span>
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
                      w.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {WALLET_STATUS_LABEL[w.status] ?? w.status}
                    </span>
                  </div>
                  <div className="text-right text-sm">
                    <span className="text-lg font-bold text-indigo-700">{w.remainingSessions}</span>
                    <span className="text-gray-500"> / {w.totalSessions} 堂</span>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-4 text-xs text-gray-400">
                  <span>購入 NT$ {Number(w.purchasedPrice).toLocaleString()}</span>
                  <span>開始 {new Date(w.startDate).toLocaleDateString("zh-TW")}</span>
                  {w.expiryDate && <span>到期 {new Date(w.expiryDate).toLocaleDateString("zh-TW")}</span>}
                </div>
                {/* Adjust sessions (Owner only) */}
                {user.role === "OWNER" && w.status === "ACTIVE" && (
                  <div className="mt-2 border-t pt-2">
                    <AdjustWalletForm walletId={w.id} currentRemaining={w.remainingSessions} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Booking */}
      <div id="booking" className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-800">建立新預約</h2>
        {activeWallets.length === 0 ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            <p className="font-medium">此顧客尚無有效課程方案</p>
            <p className="mt-1 text-xs text-yellow-700">
              體驗或單次預約請直接建立；套餐堂數預約需先在上方「課程方案」區塊指派方案。
            </p>
            <div className="mt-3">
              <CreateBookingForm
                customerId={id}
                activeWallets={[]}
              />
            </div>
          </div>
        ) : (
          <CreateBookingForm
            customerId={id}
            activeWallets={activeWallets.map((w) => ({
              id: w.id,
              planName: w.plan.name,
              remainingSessions: w.remainingSessions,
            }))}
          />
        )}
      </div>

      {/* Upcoming bookings */}
      {upcomingBookings.length > 0 && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-gray-800">
            未來預約（{upcomingBookings.length}）
          </h2>
          <div className="space-y-2">
            {upcomingBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm">
                <span>{new Date(b.bookingDate).toLocaleDateString("zh-TW")} {b.slotTime}</span>
                <span className="text-xs text-blue-700">
                  {BOOKING_STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
                </span>
                <Link href={`/dashboard/bookings/${b.id}`} className="text-indigo-600 hover:underline">
                  操作
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Booking history */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-800">
          預約紀錄（最近 {historyBookings.length} 筆）
        </h2>
        {historyBookings.length === 0 ? (
          <p className="text-sm text-gray-400">尚無歷史預約</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="pb-2 text-left">日期</th>
                <th className="pb-2 text-left">時段</th>
                <th className="pb-2 text-left">類型</th>
                <th className="pb-2 text-left">狀態</th>
                <th className="pb-2 text-left">詳情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {historyBookings.map((b) => (
                <tr key={b.id}>
                  <td className="py-2">{new Date(b.bookingDate).toLocaleDateString("zh-TW")}</td>
                  <td className="py-2 text-gray-600">{b.slotTime}</td>
                  <td className="py-2 text-gray-600">{b.bookingType}</td>
                  <td className="py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${
                      b.bookingStatus === "COMPLETED" ? "bg-green-100 text-green-700" :
                      b.bookingStatus === "CANCELLED" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {BOOKING_STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
                    </span>
                  </td>
                  <td className="py-2">
                    <Link href={`/dashboard/bookings/${b.id}`} className="text-indigo-600 hover:underline">
                      →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Transactions */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">
            消費紀錄（最近 {customer.transactions.length} 筆）
          </h2>
          <Link
            href={`/dashboard/transactions?customerId=${id}`}
            className="text-xs text-indigo-600 hover:underline"
          >
            查看全部
          </Link>
        </div>
        {customer.transactions.length === 0 ? (
          <p className="text-sm text-gray-400">尚無消費紀錄</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="pb-2 text-left">日期</th>
                <th className="pb-2 text-left">類型</th>
                <th className="pb-2 text-right">金額</th>
                <th className="pb-2 text-left">付款方式</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customer.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 text-gray-600">
                    {new Date(t.createdAt).toLocaleDateString("zh-TW")}
                  </td>
                  <td className="py-2">{TX_TYPE_LABEL[t.transactionType] ?? t.transactionType}</td>
                  <td className={`py-2 text-right font-medium ${Number(t.amount) < 0 ? "text-red-600" : "text-gray-900"}`}>
                    NT$ {Number(t.amount).toLocaleString()}
                  </td>
                  <td className="py-2 text-gray-500">{t.paymentMethod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
