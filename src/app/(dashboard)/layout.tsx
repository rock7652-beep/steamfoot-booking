import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/server/actions/auth";
import { getUserPermissions } from "@/lib/permissions";
import DashboardShell from "@/components/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "CUSTOMER") redirect("/book");

  const roleLabel =
    user.role === "OWNER" ? "店主" : user.role === "MANAGER" ? "店長" : "";
  const isOwner = user.role === "OWNER";
  const permissions = await getUserPermissions(user.role, user.staffId);

  return (
    <DashboardShell
      isOwner={isOwner}
      permissions={permissions}
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
    >
      {children}
    </DashboardShell>
  );
}
