import type { ReactNode } from "react";
import { CustomerGrowthNavigation } from "@/components/customer-growth-navigation";

export default function GrowthLayout({ children }: { children: ReactNode }) {
  return <><CustomerGrowthNavigation active="care" />{children}</>;
}
