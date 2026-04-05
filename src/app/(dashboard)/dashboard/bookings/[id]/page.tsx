import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { markCompleted, cancelBooking, markNoShow, checkInBooking } from "@/server/actions/booking";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

// Status/type labels
const STATUS_LABEL: Record<string, string> = {
  PENDING: "待確認", CONFIRMED: "已確認", COMPLETED: "已完成",
  CANCELLED: "已取消", NO_SHOW: "未到",
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700", CONFIRMED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700", CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-earth-100 text-earth-600",
};
const BOOKING_TYPE_LABEL: Record<string, string> = {
  FIRST_TRIAL: "體驗", SINGLE: "單次", PACKAGE_SESSION: "套餐堂數",
};

async function getBooking(id: string) {
  return prisma.booking.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true, assignedStaffId: true } },
      revenueStaff: { select: { id: true, displayName: true } },
      serviceStaff: { select: { id: true, displayName: true } },
      customerPlanWallet: { include: { plan: { select: { name: true } } } },
      makeupCredit: {
        include: {
          originalBooking: { select: { bookingDate: true, slotTime: true } },
        },
      },
      generatedCredit: true,
      transactions: { orderBy: { createdAt: "desc" } },
    },
  });
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BookingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireStaffSession();
  if (!(await checkPermission(user.role, user.staffId, "booking.read"))) {
    redirect("/dashboard");
  }
  const booking = await getBooking(id);
  if (!booking) notFound();

  // Manager isolation
  if (user.role === "MANAGER" && user.staffId) {
    const assignedTo = booking.customer.assignedStaffId;
    if (assignedTo && assignedTo !== user.staffId) {
      redirect("/dashboard/bookings");
    }
  }

  const isActive =
    booking.bookingStatus === "CONFIRMED" || booking.bookingStatus === "PENDING";
  const canCheckIn = isActive && !booking.isCheckedIn;

  // Server action wrappers
  async function checkInAction() {
    "use server";
    await checkInBooking(id);
    redirect(`/dashboard/bookings/${id}`);
  }
  async function completeAction() {
    "use server";
    await markCompleted(id);
    redirect(`/dashboard/bookings/${id}`);
  }
  async function cancelAction(formData: FormData) {
    "use server";
    const note = formData.get("note") as string | undefined;
    await cancelBooking(id, note ?? undefined);
    redirect(`/dashboard/bookings/${id}`);
  }
  async function noShowAction() {
    "use server";
    await markNoShow(id);
    redirect(`/dashboard/bookings/${id}`);
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={`/dashboard/bookings?view=day&date=${new Date(booking.bookingDate).toISOString().slice(0, 10)}`}
          className="text-sm text-earth-500 hover:text-earth-700"
        >
          &larr; 返回時段頁
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-earth-900">預約詳情</h1>
            {booking.isMakeup && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                補課
              </span>
            )}
            {booking.isCheckedIn && booking.bookingStatus === "CONFIRMED" && (
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                已報到
              </span>
            )}
          </div>
          <span className={`rounded px-2 py-1 text-xs font-medium ${STATUS_COLOR[booking.bookingStatus] ?? "bg-earth-100 text-earth-600"}`}>
            {STATUS_LABEL[booking.bookingStatus] ?? booking.bookingStatus}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-earth-500">顧客</dt>
            <dd className="font-medium">
              <Link href={`/dashboard/customers/${booking.customer.id}`} className="text-primary-600 hover:underline">
                {booking.customer.name}
              </Link>
              <span className="ml-2 text-earth-400">{booking.customer.phone}</span>
            </dd>
          </div>
          <div>
            <dt className="text-earth-500">預約日期</dt>
            <dd className="font-medium">
              {new Date(booking.bookingDate).toLocaleDateString("zh-TW")} {booking.slotTime}
            </dd>
          </div>
          <div>
            <dt className="text-earth-500">預約類型</dt>
            <dd>
              {BOOKING_TYPE_LABEL[booking.bookingType] ?? booking.bookingType}
              {booking.isMakeup && (
                <span className="ml-2 text-amber-600">（補課，不扣堂）</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-earth-500">預約人數</dt>
            <dd className="font-medium">{booking.people} 人</dd>
          </div>
          <div>
            <dt className="text-earth-500">歸屬店長</dt>
            <dd>{booking.revenueStaff?.displayName ?? "未指派"}</dd>
          </div>
          <div>
            <dt className="text-earth-500">服務店長</dt>
            <dd>{booking.serviceStaff?.displayName ?? "—"}</dd>
          </div>
          {booking.customerPlanWallet && (
            <div>
              <dt className="text-earth-500">使用課程</dt>
              <dd>
                {booking.customerPlanWallet.plan.name}（剩 {booking.customerPlanWallet.remainingSessions} 堂）
              </dd>
            </div>
          )}
          {/* 補課來源資訊 */}
          {booking.isMakeup && booking.makeupCredit && (
            <div className="col-span-2">
              <dt className="text-earth-500">補課來源</dt>
              <dd className="text-amber-700">
                原 {new Date(booking.makeupCredit.originalBooking.bookingDate).toLocaleDateString("zh-TW")} {booking.makeupCredit.originalBooking.slotTime} 未到
              </dd>
            </div>
          )}
          {/* 此預約產生的補課資格 */}
          {booking.bookingStatus === "NO_SHOW" && booking.generatedCredit && (
            <div className="col-span-2">
              <dt className="text-earth-500">補課資格</dt>
              <dd className={booking.generatedCredit.isUsed ? "text-earth-400" : "text-amber-600 font-medium"}>
                {booking.generatedCredit.isUsed ? "已使用" : "未使用"}
                {booking.generatedCredit.expiredAt && (
                  <span className="ml-2 text-xs text-earth-400">
                    期限：{new Date(booking.generatedCredit.expiredAt).toLocaleDateString("zh-TW")}
                  </span>
                )}
              </dd>
            </div>
          )}
          {booking.notes && (
            <div className="col-span-2">
              <dt className="text-earth-500">備註</dt>
              <dd className="text-earth-700">{booking.notes}</dd>
            </div>
          )}
        </dl>

        {/* Actions */}
        {isActive && (
          <div className="mt-6 space-y-3 border-t pt-4">
            {/* 第一行：報到 + 完成 */}
            <div className="flex flex-wrap gap-3">
              {canCheckIn && (
                <form action={checkInAction}>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    報到
                  </button>
                </form>
              )}
              <form action={completeAction}>
                <button
                  type="submit"
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  {booking.isMakeup ? "標記完成" : "標記完成（已預扣堂數）"}
                </button>
              </form>
            </div>
            {/* 第二行：未到 + 取消 */}
            <div className="flex flex-wrap items-center gap-3">
              <form action={noShowAction}>
                <button
                  type="submit"
                  className="rounded-lg bg-earth-200 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-gray-300"
                  onClick={(e) => {
                    const msg = booking.isMakeup
                      ? "確定標記未到？補課的未到不會再產生新的補課資格。"
                      : "確定標記未到？已預扣堂數不會退回，但會自動產生一次補課資格。";
                    if (!confirm(msg)) e.preventDefault();
                  }}
                >
                  未到
                </button>
              </form>
              <form action={cancelAction} className="flex items-center gap-2">
                <input
                  name="note"
                  placeholder="取消原因（選填）"
                  className="rounded-lg border border-earth-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
                  onClick={(e) => {
                    const msg = booking.isMakeup
                      ? "確定取消？補課資格將退回。"
                      : "確定取消？已預扣堂數將退回。";
                    if (!confirm(msg)) e.preventDefault();
                  }}
                >
                  取消預約
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Linked transactions */}
      {booking.transactions.length > 0 && (
        <div className="mt-4 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-earth-700">相關交易</h2>
          <div className="space-y-2">
            {booking.transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="text-earth-600">{t.transactionType}</span>
                <span className={Number(t.amount) < 0 ? "text-red-600" : "text-earth-900"}>
                  NT$ {Number(t.amount).toLocaleString()}
                </span>
                <span className="text-xs text-earth-400">
                  {new Date(t.createdAt).toLocaleDateString("zh-TW")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
