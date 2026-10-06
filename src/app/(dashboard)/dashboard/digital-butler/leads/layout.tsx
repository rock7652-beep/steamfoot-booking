import type { ReactNode } from "react";
import { CustomerGrowthNavigation } from "@/components/customer-growth-navigation";

export default function LeadsLayout({ children }: { children: ReactNode }) {
  return <><CustomerGrowthNavigation active="leads" />{children}</>;
}
