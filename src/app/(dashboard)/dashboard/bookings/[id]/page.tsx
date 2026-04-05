import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { markCompleted, cancelBooking, markNoShow } from "@/server/actions/booking";
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

  // Manager isolation: only restrict if customer is assigned to a different staff
  if (user.role === "MANAGER" && user.staffId) {
    const assignedTo = booking.customer.assignedStaffId;
    if (assignedTo && assignedTo !== user.staffId) {
      redirect("/dashboard/bookings");
    }
  }

  const canComplete =
    booking.bookingStatus === "CONFIRMED" || booking.bookingStatus === "PENDING";
  const canCancel = canComplete;
  const canNoShow = canComplete;

  // Server action wrappers for form submission
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

  // Suppress unused variable warnings
  void canCancel;
  void canNoShow;

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={`/dashboard/bookings?view=day&date=${new Date(booking.bookingDate).toISOString().slice(0, 10)}`}
          className="text-sm text-earth-500 hover:text-earth-700"
        >
          ← 返回時段頁
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between">
          <h1 className="text-lg font-bold text-earth-900">預約詳情</h1>
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
            <dd>{BOOKING_TYPE_LABEL[booking.bookingType] ?? booking.bookingType}</dd>
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
          {booking.notes && (
            <div className="col-span-2">
              <dt className="text-earth-500">備註</dt>
              <dd className="text-earth-700">{booking.notes}</dd>
            </div>
          )}
        </dl>

        {/* Actions */}
        {canComplete && (
          <div className="mt-6 flex flex-wrap gap-3 border-t pt-4">
            <form action={completeAction}>
              <button
                type="submit"
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                ✓ 標記完成（扣堂）
              </button>
            </form>
            <form action={noShowAction}>
              <button
                type="submit"
                className="rounded-lg bg-earth-200 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-gray-300"
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
              >
                取消預約
              </button>
            </form>
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
