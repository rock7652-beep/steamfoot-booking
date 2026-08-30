import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  bookingMonthRange,
  formatDateWithWeekdayZh,
  parseTaiwanDateToDbDate,
  toLocalDateStr,
} from "@/lib/date-utils";
import { isSpaDemoStoreId } from "@/lib/spa-demo-store";
import { serviceStaffLogoutAction } from "@/server/actions/auth";
import { StaffScheduleDatePicker } from "./staff-schedule-date-picker";

type SearchParams = Promise<{ date?: string }>;

function validDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseTaiwanDateToDbDate(value).getTime());
}

function shiftDate(date: string, amount: number) {
  const value = parseTaiwanDateToDbDate(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function shiftMonth(date: string, amount: number) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + amount, 1)).toISOString().slice(0, 10);
}

function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function treatmentSummary(serviceName: string, variant: string | null | undefined, minutes: number) {
  const durationLabel = `${minutes} 分鐘`;
  return [serviceName, variant && variant !== durationLabel ? variant : null, durationLabel].filter(Boolean).join("・");
}

function maskPhone(phone: string | null) {
  if (!phone || phone.length < 7) return "手機已設定";
  return `${phone.slice(0, 4)}•••${phone.slice(-3)}`;
}

export default async function StaffSchedulePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  const requestHeaders = await headers();
  const storeSlug = requestHeaders.get("x-store-slug") ?? user?.storeSlug ?? "demo";
  if (!user) redirect(`/s/${storeSlug}/staff/login`);
  if (user.role !== "PARTNER" || !user.staffId || !user.storeId) notFound();
  if (!isSpaDemoStoreId(user.storeId)) notFound();

  const requested = (await searchParams).date;
  const selectedDate = validDate(requested) ? requested : toLocalDateStr();
  const [year, month] = selectedDate.split("-").map(Number);
  const monthBounds = bookingMonthRange(year, month);

  const [staff, bookings, monthBookings] = await Promise.all([
    prisma.staff.findFirst({
      where: { id: user.staffId, storeId: user.storeId, status: "ACTIVE" },
      select: { displayName: true, user: { select: { phone: true } } },
    }),
    prisma.booking.findMany({
      where: {
        storeId: user.storeId,
        serviceStaffId: user.staffId,
        bookingDate: parseTaiwanDateToDbDate(selectedDate),
        bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
      },
      select: {
        id: true,
        slotTime: true,
        bookingStatus: true,
        treatmentNameSnapshot: true,
        treatmentVariantSnapshot: true,
        treatmentServiceMinutesSnapshot: true,
        customer: { select: { name: true } },
        treatment: { select: { name: true, variantLabel: true, serviceMinutes: true } },
      },
      orderBy: { slotTime: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        storeId: user.storeId,
        serviceStaffId: user.staffId,
        bookingDate: { gte: monthBounds.start, lte: monthBounds.end },
        bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
      },
      select: { bookingDate: true },
    }),
  ]);
  if (!staff) redirect(`/s/${storeSlug}/staff/login`);

  const counts = new Map<string, number>();
  for (const booking of monthBookings) {
    const key = booking.bookingDate.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<string | null> = Array(firstDay.getUTCDay()).fill(null);
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  return (
    <main className="min-h-screen bg-earth-50">
      <header className="border-b border-earth-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs text-earth-500">蒸管家 SPA・我的預約</p>
            <h1 className="font-semibold text-earth-900">{staff.displayName}</h1>
            <p className="text-xs text-earth-500">{maskPhone(staff.user.phone)}</p>
          </div>
          <form action={serviceStaffLogoutAction}>
            <input type="hidden" name="storeSlug" value={storeSlug} />
            <button className="rounded-lg border border-earth-300 px-3 py-2 text-sm text-earth-700">登出</button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <section className="rounded-2xl border border-earth-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary-700">{selectedDate === toLocalDateStr() ? "今日工作" : "當日預約"}</p>
              <h2 className="text-xl font-bold text-earth-900">{formatDateWithWeekdayZh(selectedDate)}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/s/${storeSlug}/staff/my-bookings?date=${shiftDate(selectedDate, -1)}`} className="rounded-lg border border-earth-300 px-3 py-2 text-sm">‹</Link>
              <StaffScheduleDatePicker storeSlug={storeSlug} selectedDate={selectedDate} />
              <Link href={`/s/${storeSlug}/staff/my-bookings?date=${shiftDate(selectedDate, 1)}`} className="rounded-lg border border-earth-300 px-3 py-2 text-sm">›</Link>
            </div>
          </div>

          <div className={bookings.length ? "mt-4 space-y-3" : "mt-3"}>
            {bookings.length ? bookings.map((booking) => {
              const minutes = booking.treatmentServiceMinutesSnapshot ?? booking.treatment?.serviceMinutes ?? 60;
              const serviceName = booking.treatmentNameSnapshot ?? booking.treatment?.name ?? "服務項目";
              const variant = booking.treatmentVariantSnapshot ?? booking.treatment?.variantLabel;
              return (
                <article key={booking.id} className="rounded-xl bg-earth-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-earth-900">{booking.slotTime}–{addMinutes(booking.slotTime, minutes)}</p>
                      <p className="mt-1 font-medium text-earth-800">{booking.customer.name}</p>
                      <p className="mt-1 text-sm text-earth-600">{treatmentSummary(serviceName, variant, minutes)}</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-earth-600">{booking.bookingStatus === "COMPLETED" ? "已完成" : "已預約"}</span>
                  </div>
                </article>
              );
            }) : <p className="rounded-xl bg-earth-50 px-4 py-4 text-center text-sm text-earth-500">這一天沒有安排顧客</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-earth-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link aria-label="上個月" href={`/s/${storeSlug}/staff/my-bookings?date=${shiftMonth(selectedDate, -1)}`} className="flex h-10 w-10 items-center justify-center rounded-lg border border-earth-300 text-lg text-earth-700">‹</Link>
              <h2 className="min-w-28 text-center font-semibold text-earth-900">{year} 年 {month} 月</h2>
              <Link aria-label="下個月" href={`/s/${storeSlug}/staff/my-bookings?date=${shiftMonth(selectedDate, 1)}`} className="flex h-10 w-10 items-center justify-center rounded-lg border border-earth-300 text-lg text-earth-700">›</Link>
            </div>
            <Link href={`/s/${storeSlug}/staff/my-bookings?date=${toLocalDateStr()}`} className="text-sm text-primary-700">回到今天</Link>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-earth-500">
            {['日','一','二','三','四','五','六'].map((label) => <span key={label} className="py-1">{label}</span>)}
            {cells.map((date, index) => date ? (
              <Link key={date} href={`/s/${storeSlug}/staff/my-bookings?date=${date}`} className={`min-h-12 rounded-lg px-1 py-2 ${date === selectedDate ? "bg-primary-600 text-white" : "hover:bg-earth-100"}`}>
                <span className="block">{Number(date.slice(-2))}</span>
                {counts.get(date) ? <span className="mt-1 block text-[10px]">{counts.get(date)} 位</span> : null}
              </Link>
            ) : <span key={`empty-${index}`} />)}
          </div>
        </section>
      </div>
    </main>
  );
}