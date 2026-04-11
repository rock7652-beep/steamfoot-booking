import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/server/actions/auth";
import { getUserPermissions, ROLE_LABELS, isStaffRole } from "@/lib/permissions";
import { getCachedShopPlan, getCachedTrialStatus } from "@/lib/query-cache";
import DashboardShell from "@/components/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "CUSTOMER") redirect("/book");

  const roleLabel = ROLE_LABELS[user.role] ?? "";
  const isOwner = user.role === "ADMIN";
  const [permissions, shopPlan, trialStatus] = await Promise.all([
    getUserPermissions(user.role, user.staffId),
    getCachedShopPlan(),
    getCachedTrialStatus(),
  ]);

  return (
    <DashboardShell
      isOwner={isOwner}
      permissions={permissions}
      shopPlan={shopPlan}
      userName={user.name ?? ""}
      roleLabel={roleLabel}
      logoutButton={
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-xs text-earth-400 hover:text-earth-700 sm:text-sm"
          >
            登出
          </button>
        </form>
      }
      trialStatus={trialStatus}
    >
      {children}
    </DashboardShell>
  );
}
