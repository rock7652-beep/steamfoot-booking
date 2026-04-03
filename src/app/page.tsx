import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();

  // 已登入 → 自動導向對應頁面
  if (session?.user) {
    const role = (session.user as { role?: string }).role;
    if (role === "CUSTOMER") redirect("/book");
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white px-4">
      <div className="w-full max-w-sm text-center">
        {/* Logo / Brand */}
        <div className="mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white shadow-lg">
            ♨
          </div>
          <h1 className="text-2xl font-bold text-gray-900">蒸足預約管理系統</h1>
          <p className="mt-2 text-sm text-gray-500">輕鬆管理預約、課程方案與營收報表</p>
        </div>

        {/* CTA - 登入系統 */}
        <Link
          href="/login"
          className="block w-full rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800"
        >
          登入系統
        </Link>

        {/* Feature Buttons - functional links */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          <Link
            href="/login?next=/book"
            className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md active:bg-gray-50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-lg">📅</span>
            <span className="text-xs font-medium text-gray-700">線上預約</span>
          </Link>
          <Link
            href="/login?next=/my-plans"
            className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md active:bg-gray-50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-lg">💳</span>
            <span className="text-xs font-medium text-gray-700">我的課程</span>
          </Link>
          <Link
            href="/login?next=/my-bookings"
            className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md active:bg-gray-50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-lg">📋</span>
            <span className="text-xs font-medium text-gray-700">預約紀錄</span>
          </Link>
        </div>

        <p className="mt-6 text-xs text-gray-400">客戶可使用 Google 帳號快速登入</p>
      </div>
    </main>
  );
}
