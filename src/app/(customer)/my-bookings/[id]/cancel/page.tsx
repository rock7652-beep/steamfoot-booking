import { getCurrentUser } from "@/lib/session";
import { cancelBooking } from "@/server/actions/booking";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CancelBookingPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/login");

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

  async function doCancelAction() {
    "use server";
    await cancelBooking(id, "顧客自行取消");
    redirect("/my-bookings");
  }

  return (
    <div className="py-8">
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
        <p className="mb-6 text-sm text-earth-500">
          取消後課程堂數不會扣除，但請盡量提早通知以便安排其他顧客。
        </p>
        <div className="flex gap-3">
          <form action={doCancelAction}>
            <button
              type="submit"
              className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              確認取消
            </button>
          </form>
          <Link
            href="/my-bookings"
            className="rounded-lg border border-earth-300 px-5 py-2 text-sm font-medium text-earth-600 hover:bg-earth-50"
          >
            返回
          </Link>
        </div>
      </div>
    </div>
  );
}
