import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission, PERMISSION_GROUPS, PERMISSION_LABELS } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { requireCourseStore } from "@/lib/industry-module-server";
import { prisma } from "@/lib/db";
import { PageShell, PageHeader } from "@/components/desktop";
import { CourseStaffWorkspace } from "./staff-workspace";
export async function CourseStaffPage() {
  const user = await getCurrentUser();
  if (
    !user ||
    user.role !== "OWNER" ||
    !(await checkPermission(user.role, user.staffId, "staff.view"))
  )
    notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  await requireCourseStore(storeId);
  const [staff, customers, canManage] = await Promise.all([
    prisma.staff.findMany({
      where: { storeId },
      include: {
        user: { select: { role: true, email: true } },
        permissions: { where: { granted: true }, select: { permission: true } },
        memberLink: { select: { userId: true, revokedAt: true } },
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.customer.findMany({
      where: { storeId, mergedIntoCustomerId: null },
      select: {
        id: true,
        name: true,
        userId: true,
        identityLinks: { select: { userId: true } },
      },
    }),
    checkPermission(user.role, user.staffId, "staff.manage"),
  ]);
  return (
    <PageShell>
      <PageHeader title="人員管理" />
      <CourseStaffWorkspace
        canManage={canManage}
        permissionGroups={Object.values(PERMISSION_GROUPS).map(g => ({ label: g.label, codes: g.codes.map(code => ({ code, label: PERMISSION_LABELS[code] })) }))}
        staff={staff.map((s) => ({
          id: s.id,
          name: s.displayName,
          kind: s.user.role === "CUSTOMER" ? "coach" : "manager",
          email: s.user.email ?? "",
          active: s.status === "ACTIVE",
          permissions: s.permissions.map((p) => p.permission),
          customerId:
            customers.find(
              (c) =>
                c.userId === s.memberLink?.userId ||
                c.identityLinks.some((l) => l.userId === s.memberLink?.userId),
            )?.id ?? "",
        }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      />
    </PageShell>
  );
}
