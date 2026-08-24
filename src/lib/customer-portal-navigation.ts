export type CustomerPortalNavItem = {
  href: string;
  label: string;
  icon: string;
  requiresHealthAssessment?: boolean;
};

const CUSTOMER_PORTAL_NAV_ITEMS: CustomerPortalNavItem[] = [
  { href: "/book", label: "首頁", icon: "home" },
  { href: "/my-bookings", label: "預約與方案", icon: "calendar" },
  { href: "/my-referrals", label: "我的好康", icon: "trophy" },
  {
    href: "/health",
    label: "健康評估",
    icon: "heart",
    requiresHealthAssessment: true,
  },
  { href: "/profile", label: "我的資料", icon: "user" },
];

/**
 * 顧客入口必須與單店健康功能開關一致。
 *
 * Server layout 先解析店家最終 entitlement，再把單純 boolean 傳給
 * MobileNav；Client Component 不直接碰方案、DB 或 server-only helper。
 */
export function getCustomerPortalNavItems(input: {
  healthAssessmentEnabled: boolean;
}): CustomerPortalNavItem[] {
  return CUSTOMER_PORTAL_NAV_ITEMS.filter(
    (item) =>
      !item.requiresHealthAssessment || input.healthAssessmentEnabled,
  );
}
