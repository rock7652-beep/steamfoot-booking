"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BuildFooter from "@/components/build-footer";
import UpdateBanner from "@/components/update-banner";
import { PlanBadge, LockedNavItem, TrialProgressBar } from "@/components/feature-gate";
import { DashboardBreadcrumb } from "@/components/breadcrumb";
import type { TrialStatus } from "@/lib/shop-config";
import { hasFeature, type Feature, FEATURES } from "@/lib/shop-plan";

import { APP_VERSION } from "@/lib/version";
import type { ShopPlan, PricingPlan } from "@prisma/client";
import StoreSwitcher from "@/components/store-switcher";

// ============================================================
// Types
// ============================================================

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  ownerOnly?: boolean;
  permission?: string;
  requiredFeature?: Feature;
  upgradeTo?: "BASIC" | "PRO";
}

export interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
  defaultOpen?: boolean;
}

// ============================================================
// Navigation Groups
// ============================================================
// 【Design System 規範】固定六大分組，所有新功能必須歸類至以下六組：
//   1. ops-core   — 營運核心
//   2. customer   — 顧客經營
//   3. finance    — 金流管理
//   4. analytics  — 數據分析
//   5. settings   — 系統設定
//   6. support    — 支援系統
// 不可新增第七組。所有設定類功能一律集中在 settings。
// ============================================================

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "ops-core",
    label: "營運核心",
    defaultOpen: true,
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72" />
      </svg>
    ),
    items: [
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
        href: "/dashboard/duty",
        label: "值班安排",
        permission: "duty.read",
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        ),
      },
    ],
  },
  {
    id: "customer",
    label: "顧客經營",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    items: [
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
        href: "/dashboard/talent",
        label: "人才管道",
        permission: "talent.read",
        ownerOnly: true,
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
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
    ],
  },
  {
    id: "finance",
    label: "金流管理",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    items: [
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
    ],
  },
  {
    id: "analytics",
    label: "數據分析",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    items: [
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
        href: "/dashboard/store-revenue",
        label: "店營收報表",
        permission: "report.read",
        requiredFeature: FEATURES.ADVANCED_REPORTS,
        upgradeTo: "PRO",
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
          </svg>
        ),
      },
      {
        href: "/dashboard/coach-revenue",
        label: "教練營收報表",
        permission: "report.read",
        requiredFeature: FEATURES.ADVANCED_REPORTS,
        upgradeTo: "PRO",
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
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
    ],
  },
  {
    id: "settings",
    label: "系統設定",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    items: [
      {
        href: "/dashboard/staff",
        label: "人員管理",
        permission: "staff.view",
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
        href: "/dashboard/settings/plan",
        label: "方案設定",
        ownerOnly: true,
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
          </svg>
        ),
      },
      {
        href: "/dashboard/settings/hours",
        label: "預約開放設定",
        permission: "business_hours.view",
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        href: "/dashboard/settings/duty",
        label: "值班排班設定",
        ownerOnly: true,
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
        ),
      },
      {
        href: "/dashboard/upgrade-requests",
        label: "升級申請",
        ownerOnly: true,
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21l3.75-3.75" />
          </svg>
        ),
      },
      {
        href: "/dashboard/system-status",
        label: "營運健康中心",
        ownerOnly: true,
        icon: (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        ),
      },
    ],
  },
  {
    id: "support",
    label: "支援系統",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
    items: [
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
    ],
  },
];

// ============================================================
// Component
// ============================================================

interface StoreOption {
  id: string;
  name: string;
  isDefault: boolean;
}

interface DashboardShellProps {
  isOwner: boolean;
  permissions: string[];
  shopPlan: ShopPlan;
  pricingPlan?: PricingPlan;
  userName: string;
  roleLabel: string;
  logoutButton: React.ReactNode;
  children: React.ReactNode;
  trialStatus?: TrialStatus;
  /** ADMIN only — store options for switcher */
  storeOptions?: StoreOption[];
  /** Current active store cookie value (null = all stores) */
  activeStoreId?: string | null;
}

export default function DashboardShell({
  isOwner,
  permissions,
  shopPlan,
  pricingPlan,
  userName,
  roleLabel,
  logoutButton,
  children,
  trialStatus,
  storeOptions,
  activeStoreId,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // 左上角顯示目前店名（ADMIN 切店時動態更新）
  const headerTitle = (() => {
    if (isOwner && storeOptions && storeOptions.length > 1) {
      if (activeStoreId === null || activeStoreId === undefined) return "全部分店";
      const current = storeOptions.find((s) => s.id === activeStoreId);
      return current?.name ?? "蒸足管理";
    }
    return "蒸足管理";
  })();

  // Determine which groups have visible items and which group contains the active item
  const { visibleGroups, activeGroupId } = useMemo(() => {
    const groups = NAV_GROUPS.map((group) => {
      const categorizedItems = group.items.map((item) => {
        if (item.ownerOnly && !isOwner) return { item, visible: false, locked: false };
        if (item.permission && !isOwner && !permissions.includes(item.permission))
          return { item, visible: false, locked: false };
        if (item.requiredFeature && !hasFeature(shopPlan, item.requiredFeature))
          return { item, visible: true, locked: true };
        return { item, visible: true, locked: false };
      });

      const visibleItems = categorizedItems.filter((c) => c.visible);

      // Check if any item in this group is active
      const hasActive = group.items.some((item) => {
        if (item.href === "/dashboard") return pathname === "/dashboard";
        return pathname.startsWith(item.href);
      });

      return { group, categorizedItems: visibleItems, hasVisibleItems: visibleItems.length > 0, hasActive };
    }).filter((g) => g.hasVisibleItems);

    const activeGid = groups.find((g) => g.hasActive)?.group.id ?? null;

    return { visibleGroups: groups, activeGroupId: activeGid };
  }, [pathname, isOwner, permissions, shopPlan]);

  // Group expand/collapse state — default open: ops-core + group containing active item
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>(["ops-core"]);
    if (activeGroupId) initial.add(activeGroupId);
    return initial;
  });

  // Auto-open group when navigating to a page in a collapsed group
  useEffect(() => {
    if (activeGroupId && !openGroups.has(activeGroupId)) {
      setOpenGroups((prev) => new Set(prev).add(activeGroupId)); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [activeGroupId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false); // eslint-disable-line react-hooks/set-state-in-effect
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

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  function toggleGroup(groupId: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  const renderNavGroups = () => (
    <nav className="sidebar-scroll flex flex-1 flex-col overflow-y-auto px-2 py-2">
      <div className="space-y-1">
        {visibleGroups.map(({ group, categorizedItems }) => {
          const isOpen = openGroups.has(group.id);

          return (
            <div key={group.id}>
              {/* Group header */}
              {collapsed ? (
                <div
                  className="mx-auto my-1 flex h-8 w-8 items-center justify-center rounded-lg text-earth-400 hover:bg-earth-100 hover:text-earth-600 cursor-pointer"
                  title={group.label}
                  onClick={() => toggleGroup(group.id)}
                >
                  {group.icon}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-earth-400 hover:bg-earth-50 hover:text-earth-600 transition-colors"
                >
                  <span className="shrink-0">{group.icon}</span>
                  <span className="flex-1 text-left">{group.label}</span>
                  <svg
                    className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {/* Group items with animation */}
              {!collapsed && (
                <div className={`nav-group-items ${isOpen ? "open" : ""}`}>
                  <ul className="overflow-hidden space-y-0.5">
                    {categorizedItems.map((c) => {
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
                            className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                              active
                                ? "bg-primary-100 text-primary-800"
                                : "text-earth-700 hover:bg-earth-100 hover:text-earth-900"
                            } pl-9`}
                          >
                            <span className={`shrink-0 ${active ? "text-primary-600" : "text-earth-500 group-hover:text-earth-700"}`}>
                              {item.icon}
                            </span>
                            <span>{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Collapsed mode: show items as icon-only when group is expanded */}
              {collapsed && isOpen && (
                <ul className="space-y-0.5">
                  {categorizedItems.map((c) => {
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
                          className={`group flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            active
                              ? "bg-primary-100 text-primary-800"
                              : "text-earth-700 hover:bg-earth-100 hover:text-earth-900"
                          }`}
                          title={item.label}
                        >
                          <span className={`shrink-0 ${active ? "text-primary-600" : "text-earth-500 group-hover:text-earth-700"}`}>
                            {item.icon}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
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
            <div className="flex items-center gap-2 min-w-0">
              <Link href="/dashboard" className="text-sm font-bold text-earth-800 truncate" title={headerTitle}>
                {headerTitle}
              </Link>
              <PlanBadge plan={shopPlan} />
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={`rounded-lg p-1.5 text-earth-400 hover:bg-earth-100 hover:text-earth-600 shrink-0 ${collapsed ? "mx-auto" : ""}`}
            aria-label={collapsed ? "展開側邊欄" : "收合側邊欄"}
          >
            <svg className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
        {/* Store Switcher — ADMIN only, multi-store */}
        {isOwner && storeOptions && storeOptions.length > 1 && (
          <div className="border-b border-earth-200">
            <StoreSwitcher
              stores={storeOptions}
              activeStoreId={activeStoreId ?? null}
              collapsed={collapsed}
            />
          </div>
        )}
        {renderNavGroups()}
        {/* Sidebar version footer */}
        <div className="border-t border-earth-100 px-3 py-2 text-center">
          {collapsed ? (
            <span className="text-[9px] text-earth-300">v{APP_VERSION}</span>
          ) : (
            <span className="text-[10px] text-earth-300">v{APP_VERSION} · {process.env.NEXT_PUBLIC_BUILD_ENV || "dev"}</span>
          )}
        </div>
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
              <div className="flex items-center gap-2 min-w-0">
                <Link href="/dashboard" className="text-sm font-bold text-earth-800 truncate" title={headerTitle}>
                  {headerTitle}
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
            {/* Store Switcher — mobile ADMIN only */}
            {isOwner && storeOptions && storeOptions.length > 1 && (
              <div className="border-b border-earth-200">
                <StoreSwitcher
                  stores={storeOptions}
                  activeStoreId={activeStoreId ?? null}
                />
              </div>
            )}
            {renderNavGroups()}
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
            {/* Mobile: show breadcrumb instead of plain title */}
            <div className="lg:hidden">
              <DashboardBreadcrumb mobile />
            </div>
            {/* Desktop: full breadcrumb */}
            <div className="hidden lg:block">
              <DashboardBreadcrumb />
            </div>
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
          <UpdateBanner />
          {trialStatus && trialStatus.isFree && trialStatus.stage !== "normal" && (
            <div className="mb-4 mt-3">
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
