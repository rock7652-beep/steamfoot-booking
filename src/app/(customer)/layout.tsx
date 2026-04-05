import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/server/actions/auth";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/book", label: "首頁" },
  { href: "/book/new", label: "新增預約" },
  { href: "/my-bookings", label: "我的預約" },
  { href: "/my-plans", label: "我的方案" },
  { href: "/profile", label: "我的資料" },
];

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "CUSTOMER") redirect("/dashboard");

  // 取得目前路徑用於高亮
  const headerList = await headers();
  const pathname = headerList.get("x-next-pathname") || "/book";

  return (
    <div className="min-h-screen bg-earth-50">
      {/* Mobile header */}
      <header className="border-b border-earth-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between">
          <Link href="/book" className="text-base font-bold text-earth-900">
            蒸足健康站
          </Link>
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

      <div className="lg:flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-[220px] lg:flex-shrink-0 lg:flex-col lg:border-r lg:border-earth-200 lg:bg-white lg:min-h-screen">
          <div className="px-5 py-5">
            <Link href="/book" className="text-base font-bold text-earth-900">
              蒸足健康站
            </Link>
            <p className="mt-0.5 text-xs text-earth-400">{user.name}</p>
          </div>

          <nav className="flex-1 px-3">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/book"
                  ? pathname === "/book"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mb-1 flex items-center rounded-lg px-3 py-2.5 text-sm transition ${
                    isActive
                      ? "bg-primary-50 font-medium text-primary-700"
                      : "text-earth-600 hover:bg-earth-50 hover:text-earth-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            <a
              href="https://health-tracker-eight-rosy.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1 flex items-center rounded-lg px-3 py-2.5 text-sm text-earth-600 hover:bg-earth-50 hover:text-earth-900 transition"
            >
              身體指數
              <span className="ml-auto text-xs text-earth-300">&#8599;</span>
            </a>
          </nav>

          <div className="border-t border-earth-200 px-3 py-4">
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-earth-400 hover:bg-earth-50 hover:text-earth-600 transition"
              >
                登出
              </button>
            </form>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-2xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
