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
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white">
      <div className="w-full max-w-md px-6 text-center">
        {/* Logo / Brand */}
        <div className="mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white shadow-lg">
            ♨
          </div>
          <h1 className="text-3xl font-bold text-gray-900">蒸足預約管理系統</h1>
          <p className="mt-2 text-gray-500">輕鬆管理預約、課程方案與營收報表</p>
        </div>

        {/* CTA */}
        <Link
          href="/login"
          className="inline-block w-full rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          登入系統
        </Link>

        {/* Features */}
        <div className="mt-12 grid grid-cols-3 gap-4 text-center text-sm text-gray-600">
          <div>
            <div className="mb-1 text-2xl">📅</div>
            <p>線上預約</p>
          </div>
          <div>
            <div className="mb-1 text-2xl">💳</div>
            <p>課程管理</p>
          </div>
          <div>
            <div className="mb-1 text-2xl">📊</div>
            <p>營收報表</p>
          </div>
        </div>
      </div>
    </main>
  );
}
