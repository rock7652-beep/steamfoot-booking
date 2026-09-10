import { redirect } from "next/navigation";
import { PageShell } from "@/components/desktop";
import { toLocalDateStr } from "@/lib/date-utils";
import { requireSpaStore } from "@/lib/industry-module-server";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { getSpaScheduleForDay } from "@/server/queries/spa-schedule";

type PageProps = { searchParams: Promise<{ date?: string }> };

/** SPA schedule is intentionally backed only by SpaBooking. */
export default async function SpaSchedulePage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) redirect("/dashboard");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) redirect("/dashboard");
  await requireSpaStore(storeId).catch(() => redirect("/dashboard/bookings"));

  const { date: requestedDate } = await searchParams;
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : toLocalDateStr();
  const bookings = await getSpaScheduleForDay(storeId, date);

  return (
    <PageShell className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold text-earth-900">SPA 人員排程</h1>
      <p className="mt-1 text-sm text-earth-500">{date} · 此頁僅讀取 SPA 預約資料</p>
      <div className="mt-6 overflow-hidden rounded-xl border border-earth-200 bg-white">
        {bookings.length === 0 ? <p className="p-8 text-sm text-earth-500">尚無 SPA 預約</p> : (
          <table className="w-full text-sm"><thead className="bg-earth-50 text-left text-earth-600"><tr><th className="px-4 py-3">時間</th><th className="px-4 py-3">療程</th><th className="px-4 py-3">狀態</th><th className="px-4 py-3 text-right">金額</th></tr></thead>
            <tbody>{bookings.map((booking) => <tr key={booking.id} className="border-t border-earth-100"><td className="px-4 py-3">{booking.startTime}–{booking.endTime}</td><td className="px-4 py-3">{booking.serviceName}</td><td className="px-4 py-3">{booking.status}</td><td className="px-4 py-3 text-right">NT${booking.totalPrice.toLocaleString()}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}
