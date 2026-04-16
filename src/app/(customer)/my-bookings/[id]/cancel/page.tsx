import { getCurrentUser } from "@/lib/session";
import { cancelBooking } from "@/server/actions/booking";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { getStoreContext } from "@/lib/store-context";
import { FormErrorToast } from "@/components/form-error-toast";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * 組合 bookingDate + slotTime 為完整 Date（台灣時間）
 */
function getBookingDateTime(bookingDate: Date, slotTime: string): Date {
  const dateStr = bookingDate.toISOString().slice(0, 10);
  const [hours, minutes] = slotTime.split(":").map(Number);
  return new Date(`${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+08:00`);
}

export default async function CancelBookingPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !user.customerId) {
    const ctx = await getStoreContext();
    const slug = ctx?.storeSlug ?? "zhubei";
    redirect(`/s/${slug}/`);
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true,
      customerId: true,
      bookingDate: true,
      slotTime: true,
      bookingStatus: true,
    },
  });

  if (!booking || booking.customerId !== user.customerId) notFound();

  if (booking.bookingStatus !== "PENDING" && booking.bookingStatus !== "CONFIRMED") {
    redirect("/my-bookings");
  }

  // 計算距離開課的時間
  const bookingDateTime = getBookingDateTime(booking.bookingDate, booking.slotTime);
  const hoursUntilBooking = (bookingDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
  const canCancel = hoursUntilBooking >= 12;

  async function doCancelAction() {
    "use server";
    const result = await cancelBooking(id, "顧客自行取消");
    if (!result.success) {
      redirect(`/my-bookings/${id}/cancel?error=${encodeURIComponent(result.error || "取消失敗")}`);
    }
    redirect("/my-bookings");
  }

  return (
    <div className="py-8">
      <FormErrorToast />
      <div className="rounded-xl border border-red-100 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-bold text-earth-900">取消預約確認</h1>
        <div className="mb-6 rounded-lg bg-earth-50 p-4 text-sm">
          <p className="text-earth-700">
            <strong>日期：</strong>
            {new Date(booking.bookingDate).toLocaleDateString("zh-TW", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "short",
            })}
          </p>
          <p className="mt-1 text-earth-700">
            <strong>時段：</strong>{booking.slotTime}
          </p>
        </div>

        {canCancel ? (
          <>
            <p className="mb-6 text-sm text-earth-500">
              取消後課程堂數不會扣除，但請盡量提早通知以便安排其他顧客。
            </p>
            <div className="flex gap-3">
              <form action={doCancelAction}>
                <SubmitButton label="確認取消" pendingLabel="取消中..." className="bg-red-600 text-white hover:bg-red-700" />
              </form>
              <Link
                href="/my-bookings"
                className="rounded-lg border border-earth-300 px-5 py-2 text-sm font-medium text-earth-600 hover:bg-earth-50"
              >
                返回
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4">
              <p className="text-sm font-medium text-yellow-800">
                開課前 12 小時內無法自行取消
              </p>
              <p className="mt-1 text-xs text-yellow-700">
                如需取消，請直接聯繫店家處理。造成不便敬請見諒。
              </p>
            </div>
            <Link
              href="/my-bookings"
              className="inline-block rounded-lg border border-earth-300 px-5 py-2 text-sm font-medium text-earth-600 hover:bg-earth-50"
            >
              返回我的預約
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
