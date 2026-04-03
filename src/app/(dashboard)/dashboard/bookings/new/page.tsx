import { listCustomers } from "@/server/queries/customer";
import { createBooking } from "@/server/actions/booking";
import Link from "next/link";
import { redirect } from "next/navigation";

const SLOT_TIMES = ["10:00", "11:00", "14:00", "15:00", "16:00", "17:30", "18:30", "19:30"];

function getNextDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function NewBookingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const defaultDate = params.date ?? today;

  const { customers } = await listCustomers({ pageSize: 200 });
  const days = getNextDays(14);

  async function handleCreate(formData: FormData) {
    "use server";
    const customerId = formData.get("customerId") as string;
    const bookingDate = formData.get("bookingDate") as string;
    const slotTime = formData.get("slotTime") as string;
    const bookingType = formData.get("bookingType") as "FIRST_TRIAL" | "SINGLE" | "PACKAGE_SESSION";
    const notes = (formData.get("notes") as string) || undefined;

    const result = await createBooking({
      customerId,
      bookingDate,
      slotTime,
      bookingType,
      notes,
    });

    if (!result.success) {
      throw new Error(result.error || "預約建立失敗");
    }

    redirect(`/dashboard/bookings?date=${bookingDate}`);
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-gray-700">首頁</Link>
        <span>/</span>
        <Link href={`/dashboard/bookings?date=${defaultDate}`} className="hover:text-gray-700">
          預約排程
        </Link>
        <span>/</span>
        <span className="text-gray-700">新增預約</span>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-gray-900">新增預約</h1>

        <form action={handleCreate} className="space-y-4">
          {/* Customer */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              顧客 <span className="text-red-500">*</span>
            </label>
            <select
              name="customerId"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">請選擇顧客...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.phone}）— {c.assignedStaff.displayName}
                  {c._count.planWallets > 0 ? ` · 有效方案 ${c._count.planWallets} 份` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              日期 <span className="text-red-500">*</span>
            </label>
            <select
              name="bookingDate"
              required
              defaultValue={days.includes(defaultDate) ? defaultDate : days[0]}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {days.map((d) => {
                const dateObj = new Date(d + "T12:00:00");
                const weekDay = ["日", "一", "二", "三", "四", "五", "六"][dateObj.getDay()];
                return (
                  <option key={d} value={d}>
                    {d}（{weekDay}）
                  </option>
                );
              })}
            </select>
          </div>

          {/* Slot Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              時段 <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {SLOT_TIMES.map((t, i) => (
                <label
                  key={t}
                  className="flex cursor-pointer items-center justify-center rounded-lg border border-gray-200 px-2 py-2 text-sm font-medium hover:border-indigo-400 hover:bg-indigo-50 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-600 has-[:checked]:text-white"
                >
                  <input
                    type="radio"
                    name="slotTime"
                    value={t}
                    defaultChecked={i === 0}
                    required
                    className="sr-only"
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>

          {/* Booking Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              預約類型 <span className="text-red-500">*</span>
            </label>
            <select
              name="bookingType"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="PACKAGE_SESSION">套餐堂數</option>
              <option value="FIRST_TRIAL">體驗</option>
              <option value="SINGLE">單次</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              套餐堂數需顧客有有效課程方案；體驗 / 單次無需方案。
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700">備註（選填）</label>
            <textarea
              name="notes"
              rows={2}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="特殊需求、備忘事項..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 border-t pt-5">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              確認建立
            </button>
            <Link
              href={`/dashboard/bookings?date=${defaultDate}`}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
