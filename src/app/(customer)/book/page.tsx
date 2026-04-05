import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function CustomerHomePage() {
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-earth-900">
        {user.name}，歡迎回來
      </h1>

      <div className="grid gap-4">
        <Link
          href="/book/new"
          className="flex items-center gap-4 rounded-xl border border-earth-200 bg-white p-5 shadow-sm transition hover:border-primary-300 hover:shadow-md"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100 text-xl">
            +
          </div>
          <div>
            <p className="font-semibold text-earth-900">新增預約</p>
            <p className="text-sm text-earth-500">選擇日期與時段</p>
          </div>
        </Link>

        <Link
          href="/my-bookings"
          className="flex items-center gap-4 rounded-xl border border-earth-200 bg-white p-5 shadow-sm transition hover:border-primary-300 hover:shadow-md"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100 text-xl">
            =
          </div>
          <div>
            <p className="font-semibold text-earth-900">我的預約</p>
            <p className="text-sm text-earth-500">查看即將到來與歷史紀錄</p>
          </div>
        </Link>

        <Link
          href="/my-plans"
          className="flex items-center gap-4 rounded-xl border border-earth-200 bg-white p-5 shadow-sm transition hover:border-primary-300 hover:shadow-md"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100 text-xl">
            #
          </div>
          <div>
            <p className="font-semibold text-earth-900">我的方案</p>
            <p className="text-sm text-earth-500">課程餘額與方案狀態</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
