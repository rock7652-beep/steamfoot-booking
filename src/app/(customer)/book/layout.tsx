import Link from "next/link";
import { getCurrentCustomer, getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { logoutAction } from "@/server/actions/auth";

export default async function CustomerBookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, customer, storeCtx] = await Promise.all([
    getCurrentUser(),
    getCurrentCustomer(),
    getStoreContext(),
  ]);

  if (user?.role === "CUSTOMER" && customer && storeCtx) {
    return children;
  }

  const storeSlug = storeCtx?.storeSlug ?? user?.storeSlug ?? "zhubei";
  const prefix = `/s/${storeSlug}`;

  return (
    <section className="flex min-h-[55vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-earth-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-earth-900">會員資料暫時無法載入</h1>
        <p className="mt-3 text-sm leading-6 text-earth-700">
          系統目前無法確認您的會員資料，沒有遺失方案或堂數。請先重新登入；若仍無法進入，請聯絡店家協助確認。
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <form action={logoutAction}>
            <input type="hidden" name="storeSlug" value={storeSlug} />
            <button
              type="submit"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary-600 px-5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              登出並重新登入
            </button>
          </form>
          <Link
            href={`${prefix}/profile`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-earth-200 px-5 text-sm font-semibold text-earth-700 hover:bg-earth-50"
          >
            查看會員資料
          </Link>
        </div>
      </div>
    </section>
  );
}
