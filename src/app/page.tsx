import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { OAuthButtons } from "./oauth-buttons";
import { CustomerLoginForm } from "./customer-login-form";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  OAuthCallbackError: "登入失敗，請重試。若持續失敗請改用手機登入。",
  OAuthAccountNotLinked: "此帳號尚未綁定，請先使用手機登入後再綁定。",
  AccessDenied: "登入被拒絕，請重試。",
  StaffEmailBlocked:
    "此 Email 為員工帳號，無法用於顧客登入。請使用其他帳號，或從員工登入頁登入。",
  default: "登入時發生錯誤，請重試。",
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await auth();

  if (session?.user) {
    const role = (session.user as { role?: string }).role;
    if (role === "CUSTOMER") redirect("/book");
    redirect("/dashboard");
  }

  const errorMessage = params.error
    ? ERROR_MESSAGES[params.error] ?? ERROR_MESSAGES.default
    : null;

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
          {errorMessage && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          <OAuthButtons />

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-earth-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-earth-400">
                或使用手機登入
              </span>
            </div>
          </div>

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

        {/* 後台入口 */}
        <div className="mt-8 text-center">
          <Link
            href="/login"
            className="text-xs text-gray-400 hover:text-gray-500"
          >
            後台登入
          </Link>
        </div>
      </div>
    </main>
  );
}
