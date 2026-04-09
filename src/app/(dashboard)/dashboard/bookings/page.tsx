import { getMonthBookingSummary } from "@/server/queries/booking";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { toLocalDateStr } from "@/lib/date-utils";
import { redirect } from "next/navigation";
import { BookingsManager } from "./bookings-manager";

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function BookingsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) {
    redirect("/dashboard");
  }
  const params = await searchParams;

  const todayStr = toLocalDateStr();
  const [todayY, todayM] = todayStr.split("-").map(Number);
  const year = params.year ? parseInt(params.year) : todayY;
  const month = params.month ? parseInt(params.month) : todayM;

  const monthData = await getMonthBookingSummary(year, month);

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <BookingsManager year={year} month={month} monthData={monthData} />
    </div>
  );
}
