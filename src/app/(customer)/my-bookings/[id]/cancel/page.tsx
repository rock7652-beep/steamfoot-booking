import { getCurrentUser } from "@/lib/session";
import { cancelBooking } from "@/server/actions/booking";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { getStoreContext } from "@/lib/store-context";
import { FormErrorToast } from "@/components/form-error-toast";
import { getCanonicalCustomerIdForSession } from "@/lib/customer-identity";

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
  const ctx = await getStoreContext();
  const slug = ctx?.storeSlug ?? "zhubei";
  const prefix = `/s/${slug}`;
  if (!user) {
    redirect(`${prefix}/`);
  }

  // 走 customer-identity contract — session.customerId 可能 stale
  const canonicalCustomerId = await getCanonicalCustomerIdForSession({
    id: user.id,
    customerId: user.customerId ?? null,
    email: user.email ?? null,
    storeId: user.storeId ?? ctx?.storeId ?? null,
  });
  if (!canonicalCustomerId) {
    redirect(`${prefix}/`);
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

  if (!booking || booking.customerId !== canonicalCustomerId) notFound();

  if (booking.bookingStatus !== "PENDING" && booking.bookingStatus !== "CONFIRMED") {
    redirect(`${prefix}/my-bookings`);
  }

  // 計算距離開課的時間
  const bookingDateTime = getBookingDateTime(booking.bookingDate, booking.slotTime);
  const hoursUntilBooking = (bookingDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
  const canCancel = hoursUntilBooking >= 12;

  async function doCancelAction() {
    "use server";
    const result = await cancelBooking(id, "顧客自行取消");
    if (!result.success) {
      redirect(`${prefix}/my-bookings/${id}/cancel?error=${encodeURIComponent(result.error || "取消失敗")}`);
    }
    redirect(`${prefix}/my-bookings`);
  }

  return (
    <div className="py-6">
      <FormErrorToast />
      <div className="rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
        <h1 className="mb-5 text-2xl font-bold text-earth-900">取消預約確認</h1>
        <div className="mb-6 rounded-xl bg-earth-50 p-5 text-base">
          <p className="text-earth-800">
            <strong>日期：</strong>
            {new Date(booking.bookingDate).toLocaleDateString("zh-TW", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "short",
            })}
          </p>
          <p className="mt-2 text-earth-800">
            <strong>時段：</strong>{booking.slotTime}
          </p>
        </div>

        {canCancel ? (
          <>
            <p className="mb-6 text-base leading-relaxed text-earth-800">
              取消後課程堂數不會扣除，但請盡量提早通知以便安排其他顧客。
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <form action={doCancelAction}>
                <SubmitButton label="確認取消" pendingLabel="取消中..." className="w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto" />
              </form>
              <Link
                href={`${prefix}/my-bookings`}
                className="flex min-h-[48px] items-center justify-center rounded-xl border border-earth-300 px-6 text-base font-semibold text-earth-800 hover:bg-earth-50"
              >
                返回
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 rounded-xl bg-yellow-50 border border-yellow-200 p-5">
              <p className="text-base font-semibold text-yellow-900">
                開課前 12 小時內無法自行取消
              </p>
              <p className="mt-2 text-base text-yellow-900">
                如需取消，請直接聯繫店家處理。造成不便敬請見諒。
              </p>
            </div>
            <Link
              href={`${prefix}/my-bookings`}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-earth-300 px-6 text-base font-semibold text-earth-800 hover:bg-earth-50"
            >
              返回我的預約
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
