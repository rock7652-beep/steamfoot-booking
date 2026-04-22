import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/server/actions/auth";
import Link from "next/link";
import { MobileNav } from "./mobile-nav";
import { NavProgress } from "./nav-progress";
import BuildFooter from "@/components/build-footer";
import { LogoutButton } from "@/components/logout-button";
import { getStoreContext } from "@/lib/store-context";
import { resolveCustomerCompletionStatus } from "@/server/queries/customer-completion";
import { getHealthAssessmentUrl } from "@/lib/health-assessment";

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
  gift: [
    "M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H4.5a1.5 1.5 0 01-1.5-1.5v-8.25",
    "M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  ],
  heart: [
    "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
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

// 主選單 5 項：首頁 / 預約與方案 / 我的好康 / 健康評估 / 我的資料
// 健康評估為外部連結 (HealthFlow LIFF)，於 render 時特殊處理。
const NAV_ITEMS_BASE = [
  { href: "/book", label: "首頁", icon: "home" },
  { href: "/my-bookings", label: "預約與方案", icon: "calendar" },
  { href: "/my-referrals", label: "我的好康", icon: "gift" },
  { href: "__health__", label: "健康評估", icon: "heart", external: true },
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

  const storeCtx = await getStoreContext();

  // ── Store context gate ──────────────────────────────────
  // 若 store context 解析失敗（cookie 遺失 / slug 在 DB 找不到對應店），
  // 不可繼續渲染顧客頁面 — 否則上方 `storeSlug ?? "zhubei"` fallback 會讓
  // 使用者看到「錯店的資料」，而且畫面看起來完全正常（silent data corruption）。
  // 顯示明確保底訊息，請使用者從正確入口重入。
  if (!storeCtx) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-earth-50 px-4 py-12">
        <div className="w-full max-w-sm rounded-xl border border-earth-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <h1 className="mb-3 text-xl font-bold text-earth-900">無法確認店舖資訊</h1>
          <p className="mb-6 text-sm leading-relaxed text-earth-600">
            請從店舖專屬連結重新進入，或重新登入後再試一次。
          </p>
          <a
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary-600 px-6 text-sm font-semibold text-white hover:bg-primary-700"
          >
            回首頁
          </a>
        </div>
      </div>
    );
  }

  // ── 完成註冊 gate ──────────────────────────────────────
  // 顧客若尚未完成基本資料（姓名/電話/Email/生日/性別），強制導至 /profile 補齊
  // 白名單：/profile 本身允許進入；其餘顧客頁皆受控
  const completion = await resolveCustomerCompletionStatus({
    userId: user.id,
    sessionCustomerId: user.customerId ?? null,
    sessionEmail: user.email ?? null,
    storeId: user.storeId ?? storeCtx?.storeId ?? null,
    storeSlug,
  });
  const isOnProfile = pathname === "/profile" || pathname.startsWith("/profile/");
  if (!completion.isComplete && !isOnProfile) {
    const nextPath = rawPathname; // 保留原始 /s/{slug}/... 供儲存後跳回
    const params = new URLSearchParams({ complete: "1" });
    if (nextPath && nextPath !== `${prefix}/book`) params.set("next", nextPath);
    redirect(`${prefix}/profile?${params.toString()}`);
  }

  const aiHealthUrl = getHealthAssessmentUrl(user.customerId);

  const NAV_ITEMS = NAV_ITEMS_BASE.map((item) => ({
    ...item,
    fullHref: item.external ? aiHealthUrl : `${prefix}${item.href}`,
  }));

  return (
    <div className="min-h-screen bg-earth-50 text-[17px] leading-[1.7] text-[color:var(--color-text-primary)]">
      {/* Navigation progress bar */}
      <NavProgress />

      {/* Mobile hamburger menu */}
      <MobileNav userName={user.name ?? "顧客"} pathname={pathname} customerId={user.customerId} storeSlug={storeSlug} />

      <div className="lg:flex">
        {/* Desktop sidebar — fixed narrow design */}
        <aside className="hidden lg:flex lg:w-[200px] lg:flex-shrink-0 lg:flex-col lg:border-r lg:border-earth-100 lg:bg-white lg:min-h-screen">
          {/* Brand */}
          <div className="px-4 pb-3 pt-5">
            <Link href={`${prefix}/book`} className="text-base font-bold tracking-tight text-earth-900">
              蒸足健康站
            </Link>
            <p className="mt-1 text-sm text-earth-700 truncate">{user.name}</p>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2.5 py-1">
            {NAV_ITEMS.map((item) => {
              if (item.external) {
                return (
                  <a
                    key={item.href}
                    href={item.fullHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] text-earth-700 hover:bg-earth-100/60 hover:text-earth-900 transition"
                  >
                    <NavIcon name={item.icon} className="text-earth-600" />
                    {item.label}
                  </a>
                );
              }
              const isActive =
                item.href === "/book"
                  ? pathname === "/book"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.fullHref}
                  className={`relative mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] transition-colors ${
                    isActive
                      ? "bg-primary-50 font-semibold text-primary-700"
                      : "text-earth-700 hover:bg-earth-100/60 hover:text-earth-900"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary-600" />
                  )}
                  <NavIcon name={item.icon} className={isActive ? "text-primary-600" : "text-earth-600"} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="border-t border-earth-100 px-2.5 py-3">
            <form action={logoutAction}>
              <input type="hidden" name="storeSlug" value={storeSlug} />
              <LogoutButton
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] text-earth-700 hover:bg-earth-50 hover:text-earth-900 transition"
                iconClassName="text-earth-600"
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
