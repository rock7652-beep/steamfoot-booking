import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/server/actions/auth";
import Link from "next/link";

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "CUSTOMER") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-earth-50">
      {/* 頂部導覽 */}
      <header className="border-b border-earth-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <span className="text-base font-bold text-earth-900">蒸足健康站</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/book"
              className="text-earth-600 hover:text-primary-600"
            >
              預約
            </Link>
            <Link
              href="/my-bookings"
              className="text-earth-600 hover:text-primary-600"
            >
              我的預約
            </Link>
            <Link
              href="/my-plans"
              className="text-earth-600 hover:text-primary-600"
            >
              我的課程
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-xs text-earth-500">{user.name}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-xs text-earth-400 hover:text-earth-600"
              >
                登出
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
