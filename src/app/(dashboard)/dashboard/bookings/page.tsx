import { getMonthBookingSummary, getDayBookings } from "@/server/queries/booking";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarMonth } from "./calendar-month";
import { DayView } from "./day-view";

interface PageProps {
  searchParams: Promise<{ view?: string; date?: string; year?: string; month?: string }>;
}

export default async function BookingsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) {
    redirect("/dashboard");
  }
  const params = await searchParams;
  const view = params.view || "month";
  const selectedDate = params.date;

  if (view === "day" && selectedDate) {
    const bookings = await getDayBookings(selectedDate);
    return (
      <div className="mx-auto max-w-5xl px-4 py-4">
        <DayView date={selectedDate} bookings={bookings} />
      </div>
    );
  }

  // Month view - use URL params for month navigation
  const today = new Date();
  const year = params.year ? parseInt(params.year) : today.getFullYear();
  const month = params.month ? parseInt(params.month) : today.getMonth() + 1;

  const monthData = await getMonthBookingSummary(year, month);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-earth-900">預約排程</h1>
        <Link
          href="/dashboard/bookings/new"
          className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 active:bg-primary-800"
        >
          + 新增預約
        </Link>
      </div>

      {/* Calendar */}
      <CalendarMonth year={year} month={month} monthData={monthData} />
    </div>
  );
}
