"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BuildFooter from "@/components/build-footer";
import { PlanBadge, LockedNavItem, TrialProgressBar } from "@/components/feature-gate";
import type { TrialStatus } from "@/lib/shop-config";
import { hasFeature, type Feature, FEATURES } from "@/lib/shop-plan";
import type { ShopPlan } from "@prisma/client";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  ownerOnly?: boolean;
  permission?: string;
  /** 需要此 feature 才能使用（無則鎖定顯示） */
  requiredFeature?: Feature;
  /** 鎖定時升級到哪個方案 */
  upgradeTo?: "BASIC" | "PRO";
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "首頁",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: "/dashboard/bookings",
    label: "預約管理",
    permission: "booking.read",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/customers",
    label: "顧客管理",
    permission: "customer.read",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/transactions",
    label: "交易紀錄",
    permission: "transaction.read",
    requiredFeature: FEATURES.TRANSACTION_MANAGEMENT,
    upgradeTo: "BASIC",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    href: "/dashboard/plans",
    label: "課程方案",
    permission: "wallet.read",
    requiredFeature: FEATURES.PLAN_MANAGEMENT,
    upgradeTo: "BASIC",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    href: "/dashboard/cashbook",
    label: "現金帳",
    permission: "cashbook.read",
    requiredFeature: FEATURES.CASHBOOK,
    upgradeTo: "BASIC",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/staff",
    label: "店長管理",
    ownerOnly: true,
    requiredFeature: FEATURES.STAFF_MANAGEMENT,
    upgradeTo: "BASIC",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/ops",
    label: "營運儀表板",
    ownerOnly: true,
    requiredFeature: FEATURES.OPS_DASHBOARD_BASIC,
    upgradeTo: "BASIC",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/reports",
    label: "報表",
    permission: "report.read",
    requiredFeature: FEATURES.BASIC_REPORTS,
    upgradeTo: "BASIC",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/reconciliation",
    label: "對帳中心",
    ownerOnly: true,
    requiredFeature: FEATURES.RECONCILIATION,
    upgradeTo: "BASIC",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/reminders",
    label: "提醒管理",
    ownerOnly: true,
    requiredFeature: FEATURES.AUTO_REMINDER,
    upgradeTo: "BASIC",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  // PRO 功能
  {
    href: "/dashboard/analytics",
    label: "聯盟數據",
    ownerOnly: true,
    requiredFeature: FEATURES.CROSS_BRANCH_ANALYTICS,
    upgradeTo: "PRO",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/ranking",
    label: "排行榜",
    ownerOnly: true,
    requiredFeature: FEATURES.RANKING,
    upgradeTo: "PRO",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.003 6.003 0 01-3.77 1.522m0 0a6.003 6.003 0 01-3.77-1.522" />
      </svg>
    ),
  },
  {
    href: "/dashboard/training",
    label: "學習中心",
    ownerOnly: true,
    requiredFeature: FEATURES.TRAINING_CONTENT,
    upgradeTo: "PRO",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
      </svg>
    ),
  },
  // 方案設定（所有方案都看得到）
  {
    href: "/dashboard/settings/plan",
    label: "方案設定",
    ownerOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
  },
  // 營業時間設定
  {
    href: "/dashboard/settings/hours",
    label: "營業時間",
    ownerOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

interface DashboardShellProps {
  isOwner: boolean;
  permissions: string[];
  shopPlan: ShopPlan;
  userName: string;
  roleLabel: string;
  logoutButton: React.ReactNode;
  children: React.ReactNode;
  trialStatus?: TrialStatus;
}


export default function DashboardShell({
  isOwner,
  permissions,
  shopPlan,
  userName,
  roleLabel,
  logoutButton,
  children,
  trialStatus,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // 分類 nav items：可見 vs 鎖定
  const categorizedItems = NAV_ITEMS.map((item) => {
    // 角色 / 權限檢查（與原邏輯相同）
    if (item.ownerOnly && !isOwner) return { item, visible: false, locked: false };
    if (item.permission && !isOwner && !permissions.includes(item.permission)) return { item, visible: false, locked: false };

    // 方案檢查
    if (item.requiredFeature && !hasFeature(shopPlan, item.requiredFeature)) {
      return { item, visible: true, locked: true }; // 可見但鎖定
    }

    return { item, visible: true, locked: false };
  });

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  const renderNavItems = () => (
    <nav className="sidebar-scroll flex flex-1 flex-col overflow-y-auto px-2 py-2">
      <ul className="space-y-0.5">
        {categorizedItems
          .filter((c) => c.visible)
          .map((c) => {
            const { item, locked } = c;

            if (locked) {
              return (
                <li key={item.href}>
                  <LockedNavItem
                    label={item.label}
                    icon={item.icon}
                    collapsed={collapsed}
                    targetPlan={item.upgradeTo ?? "BASIC"}
                  />
                </li>
              );
            }

            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary-100 text-primary-800"
                      : "text-earth-700 hover:bg-earth-100 hover:text-earth-900"
                  } ${collapsed ? "justify-center" : ""}`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={`shrink-0 ${active ? "text-primary-600" : "text-earth-500 group-hover:text-earth-700"}`}>
                    {item.icon}
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-earth-50">
      {/* Desktop sidebar — fixed left */}
      <aside
        className={`sidebar-transition hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:z-20 border-r border-earth-200 bg-white ${
          collapsed ? "lg:w-(--sidebar-collapsed-width)" : "lg:w-(--sidebar-width)"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-earth-200 px-3">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <Link href="/dashboard" className="text-base font-bold text-earth-800">
                蒸足管理
              </Link>
              <PlanBadge plan={shopPlan} />
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={`rounded-lg p-1.5 text-earth-400 hover:bg-earth-100 hover:text-earth-600 ${collapsed ? "mx-auto" : ""}`}
            aria-label={collapsed ? "展開側邊欄" : "收合側邊欄"}
          >
            <svg className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
        {renderNavItems()}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-earth-900/30 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-earth-200 px-4">
              <div className="flex items-center gap-2">
                <Link href="/dashboard" className="text-base font-bold text-earth-800">
                  蒸足管理
                </Link>
                <PlanBadge plan={shopPlan} />
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 text-earth-400 hover:bg-earth-100 hover:text-earth-600"
                aria-label="關閉選單"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {renderNavItems()}
          </aside>
        </div>
      )}

      {/* Main area — offset by sidebar on desktop */}
      <div
        className={`sidebar-transition ${
          collapsed ? "lg:pl-(--sidebar-collapsed-width)" : "lg:pl-(--sidebar-width)"
        }`}
      >
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-earth-200 bg-white/95 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-lg p-1.5 text-earth-600 hover:bg-earth-100 hover:text-earth-800"
              aria-label="開啟選單"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-base font-bold text-earth-800 lg:hidden">蒸足管理</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-xs text-earth-600 sm:text-sm">
              {userName}
              <span className="ml-1.5 rounded-md bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 sm:text-xs">
                {roleLabel}
              </span>
            </span>
            {logoutButton}
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
          {trialStatus && trialStatus.isFree && trialStatus.stage !== "normal" && (
            <div className="mb-4">
              <TrialProgressBar trial={trialStatus} />
            </div>
          )}
          {children}
        </main>

        <BuildFooter />
      </div>
    </div>
  );
}
