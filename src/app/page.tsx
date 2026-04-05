import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GoogleSignInButton } from "./google-sign-in-button";

export default async function HomePage() {
  const session = await auth();

  // 已登入 → 自動導向對應頁面
  if (session?.user) {
    const role = (session.user as { role?: string }).role;
    if (role === "CUSTOMER") redirect("/book");
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-primary-50 to-earth-50 px-4">
      <div className="w-full max-w-sm text-center">
        {/* Logo / Brand */}
        <div className="mb-10">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 text-2xl text-white shadow-lg">
            ♨
          </div>
          <h1 className="text-2xl font-bold text-earth-900">蒸足健康站</h1>
          <p className="mt-2 text-sm text-earth-500">線上預約・課程管理</p>
        </div>

        {/* 主要入口：Google 登入 */}
        <GoogleSignInButton />

        {/* 預留：手機登入（未來擴充） */}
        <button
          disabled
          className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-earth-200 bg-white px-4 py-3.5 text-sm font-medium text-earth-400 opacity-60"
        >
          <span className="text-lg">📱</span>
          <span>手機號碼登入（即將推出）</span>
        </button>

        {/* 功能快捷入口 */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center gap-2 rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-lg">📅</span>
            <span className="text-xs font-medium text-earth-700">線上預約</span>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-lg">💳</span>
            <span className="text-xs font-medium text-earth-700">我的課程</span>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-lg">📋</span>
            <span className="text-xs font-medium text-earth-700">預約紀錄</span>
          </div>
        </div>

        {/* 員工登入（弱化） */}
        <div className="mt-10 border-t border-earth-200 pt-4">
          <Link
            href="/login"
            className="text-xs text-earth-400 hover:text-earth-600"
          >
            員工登入
          </Link>
        </div>
      </div>
    </main>
  );
}
