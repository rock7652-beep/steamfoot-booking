"use client";

import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/components/sidebar";

interface BreadcrumbProps {
  /** Mobile mode: compact layout without group icon */
  mobile?: boolean;
}

export function DashboardBreadcrumb({ mobile }: BreadcrumbProps) {
  const pathname = usePathname();

  // Find the group and item matching the current pathname
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const isMatch =
        item.href === "/dashboard"
          ? pathname === "/dashboard"
          : pathname.startsWith(item.href);

      if (isMatch) {
        if (mobile) {
          return (
            <span className="text-sm font-bold text-earth-800 truncate max-w-[200px]">
              {item.label}
            </span>
          );
        }

        return (
          <div className="flex items-center gap-1.5 text-sm text-earth-500">
            <span className="text-earth-400">{group.icon}</span>
            <span>{group.label}</span>
            <span className="text-earth-300">/</span>
            <span className="font-medium text-earth-700">{item.label}</span>
          </div>
        );
      }
    }
  }

  // Fallback for mobile
  if (mobile) {
    return <span className="text-sm font-bold text-earth-800">蒸足管理</span>;
  }

  return null;
}
