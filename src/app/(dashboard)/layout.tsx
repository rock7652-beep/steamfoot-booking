import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/server/actions/auth";
import Link from "next/link";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "CUSTOMER") redirect("/book");

  const roleLabel =
    user.role === "OWNER" ? "店主" : user.role === "MANAGER" ? "店長" : "";
  const isOwner = user.role === "OWNER";

  return (
    <div className="min-h-dvh bg-gray-50 pb-16 sm:pb-0">
      {/* 頂部導覽列 - 精簡手機版 */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white px-4 py-2.5 sm:px-6 sm:py-3">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-base font-bold text-gray-900 sm:text-lg">
            蒸足管理
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-xs text-gray-600 sm:text-sm">
              {user.name}
              <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700 sm:text-xs">
                {roleLabel}
              </span>
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-xs text-gray-400 hover:text-gray-700 sm:text-sm"
              >
                登出
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* 主內容區 */}
      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">{children}</main>

      {/* 手機版底部導覽列 */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white sm:hidden">
        <div className="flex items-stretch">
          <Link
            href="/dashboard"
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-gray-500 active:text-indigo-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-[10px]">首頁</span>
          </Link>
          <Link
            href="/dashboard/bookings"
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-gray-500 active:text-indigo-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px]">月曆</span>
          </Link>
          <Link
            href="/dashboard/customers"
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-gray-500 active:text-indigo-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px]">顧客</span>
          </Link>
          <Link
            href="/dashboard/transactions"
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-gray-500 active:text-indigo-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-[10px]">紀錄</span>
          </Link>
          {isOwner && (
            <Link
              href="/dashboard/reports"
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-gray-500 active:text-indigo-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="text-[10px]">報表</span>
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
