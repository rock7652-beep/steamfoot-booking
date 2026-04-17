import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/server/actions/auth";
import Link from "next/link";
import { MobileNav } from "./mobile-nav";
import { NavProgress } from "./nav-progress";
import BuildFooter from "@/components/build-footer";
import { LogoutButton } from "@/components/logout-button";

// SVG icon paths (Heroicons outline, 24x24 viewBox) — 拆成多段 path 確保正確渲染
const ICON_PATHS: Record<string, string[]> = {
  home: [
    "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12",
    "M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75",
  ],
  plus: ["M12 4.5v15m7.5-7.5h-15"],
  calendar: [
    "M6.75 3v2.25M17.25 3v2.25",
    "M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  ],
  wallet: [
    "M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v6z",
    "M21 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6",
  ],
  trophy: [
    "M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172",
    "M5.25 4.236c-.996.178-1.768.621-2.134 1.1a1.097 1.097 0 00.058 1.37c.588.694 2.09.851 3.143.338m12.433-.738c.996.178 1.768.621 2.134 1.1a1.097 1.097 0 01-.058 1.37c-.588.694-2.09.851-3.143.338M12 2.25c2.386 0 4.5 2.015 4.5 4.5s-2.114 4.5-4.5 4.5-4.5-2.015-4.5-4.5 2.114-4.5 4.5-4.5z",
  ],
  user: [
    "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z",
    "M4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  ],
  external: [
    "M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5",
    "M7.5 16.5L21 3m0 0h-5.25M21 3v5.25",
  ],
  logout: [
    "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15",
    "M18.75 12l3-3m0 0l-3-3m3 3H9",
  ],
};

function NavIcon({ name, className = "" }: { name: string; className?: string }) {
  const paths = ICON_PATHS[name] ?? ICON_PATHS.home;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-shrink-0 ${className}`}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

const NAV_ITEMS_BASE = [
  { href: "/book", label: "首頁", icon: "home" },
  { href: "/book/new", label: "新增預約", icon: "plus" },
  { href: "/my-bookings", label: "我的預約", icon: "calendar" },
  { href: "/my-plans", label: "我的方案", icon: "wallet" },
  { href: "/profile", label: "我的資料", icon: "user" },
];

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const storeSlug = cookieStore.get("store-slug")?.value ?? "zhubei";
  const prefix = `/s/${storeSlug}`;

  if (!user) {
    redirect(`${prefix}/`);
  }
  if (user.role !== "CUSTOMER") {
    redirect(`${prefix}/admin/dashboard`);
  }

  // 取得目前路徑用於高亮（proxy.ts 會注入原始 pathname）
  const headerList = await headers();
  const rawPathname = headerList.get("x-next-pathname") || `${prefix}/book`;
  // 去掉 /s/[slug] 前綴，還原成 /book、/my-bookings 等格式供比對
  const pathname = rawPathname.replace(/^\/s\/[^/]+/, "") || "/book";

  const NAV_ITEMS = NAV_ITEMS_BASE.map((item) => ({
    ...item,
    fullHref: `${prefix}${item.href}`,
  }));

  return (
    <div className="min-h-screen bg-earth-50">
      {/* Navigation progress bar */}
      <NavProgress />

      {/* Mobile hamburger menu */}
      <MobileNav userName={user.name ?? "顧客"} pathname={pathname} customerId={user.customerId} storeSlug={storeSlug} />

      <div className="lg:flex">
        {/* Desktop sidebar — fixed narrow design */}
        <aside className="hidden lg:flex lg:w-[200px] lg:flex-shrink-0 lg:flex-col lg:border-r lg:border-earth-100 lg:bg-white lg:min-h-screen">
          {/* Brand */}
          <div className="px-4 pb-3 pt-5">
            <Link href={`${prefix}/book`} className="text-sm font-bold tracking-tight text-earth-900">
              蒸足健康站
            </Link>
            <p className="mt-0.5 text-[11px] text-earth-400 truncate">{user.name}</p>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2.5 py-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/book"
                  ? pathname === "/book"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.fullHref}
                  className={`relative mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                    isActive
                      ? "bg-primary-50 font-semibold text-primary-700"
                      : "text-earth-500 hover:bg-earth-100/60 hover:text-earth-800"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary-600" />
                  )}
                  <NavIcon name={item.icon} className={isActive ? "text-primary-600" : "text-earth-400"} />
                  {item.label}
                </Link>
              );
            })}

            <a
              href={`https://www.healthflow-ai.com/liff${user.customerId ? `?customerId=${user.customerId}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-earth-500 hover:bg-earth-50 hover:text-earth-800 transition"
            >
              <NavIcon name="external" className="text-earth-400" />
              AI健康評估
            </a>
          </nav>

          {/* Logout */}
          <div className="border-t border-earth-100 px-2.5 py-3">
            <form action={logoutAction}>
              <input type="hidden" name="storeSlug" value={storeSlug} />
              <LogoutButton
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-earth-400 hover:bg-earth-50 hover:text-earth-600 transition"
                iconClassName="text-earth-300"
                iconSize={18}
              />
            </form>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-2xl">{children}</div>
        </main>
      </div>

      <BuildFooter />
    </div>
  );
}
