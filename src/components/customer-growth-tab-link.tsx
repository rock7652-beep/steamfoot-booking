"use client";

import { usePathname } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";

export function CustomerGrowthTabLink({ id, href, label, active }: { id: string; href: string; label: string; active: string }) {
  const pathname = usePathname();
  const selected = pathname.includes("/dashboard/growth/consumption") ? id === "consumption" : active === id;
  return <DashboardLink href={href} aria-current={selected ? "page" : undefined}
    className={`flex min-h-11 items-center border-b-2 px-3 text-sm ${selected ? "border-primary-600 font-semibold text-primary-900" : "border-transparent text-earth-600 hover:text-primary-800"}`}>
    {label}
  </DashboardLink>;
}
