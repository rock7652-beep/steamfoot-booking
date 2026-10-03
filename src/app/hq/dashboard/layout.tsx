import DashboardLayout from "@/components/dashboard-layout";

/** HQ-only pages share the same chrome without a selected store's module redirects. */
export default function HqLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout hqPlatform>{children}</DashboardLayout>;
}
