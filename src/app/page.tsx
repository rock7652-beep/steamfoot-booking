import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CustomerLoginForm } from "./customer-login-form";

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    const role = (session.user as { role?: string }).role;
    if (role === "CUSTOMER") redirect("/book");
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-earth-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-earth-900">蒸足健康站</h1>
          <p className="mt-1 text-sm text-earth-500">會員預約系統</p>
        </div>

        {/* 登入表單 */}
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <CustomerLoginForm />

          <div className="mt-4 text-center">
            <Link
              href="/register"
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              註冊新帳號
            </Link>
          </div>
        </div>

        {/* 員工入口 */}
        <div className="mt-8 text-center">
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
