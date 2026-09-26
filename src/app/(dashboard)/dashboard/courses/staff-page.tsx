import {
  COURSE_PERMISSIONS,
  COURSE_PERMISSION_LABELS,
} from "@/lib/course-permissions";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  checkPermission,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
} from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { requireCourseStore } from "@/lib/industry-module-server";
import { coursePrisma } from "@/lib/course-db";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
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
  const [staff, canManage, templates, handover, limits, musicEntitlement] = await Promise.all([
    prisma.staff.findMany({
      where: { storeId },
      include: {
        user: { select: { role: true, email: true } },
        permissions: { where: { granted: true }, select: { permission: true } },
        memberLink: {
          select: { userId: true, revokedAt: true, courseMemberEnabled: true, user: { select: { status: true } } },
        },
      },
      orderBy: { displayName: "asc" },
    }),
    checkPermission(user.role, user.staffId, "staff.manage"),
    coursePrisma.courseTemplate.findMany({where:{storeId},select:{id:true,name:true},orderBy:{name:"asc"}}),
    coursePrisma.courseSession.findMany({where:{storeId,cancelledAt:null,endsAt:{gt:new Date()}},select:{id:true,coachId:true,nameSnapshot:true,startsAt:true,capacity:true},orderBy:{startsAt:"asc"}}),
    getStoreLimitsByStoreId(storeId),
    prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}),
  ]);
  const linkedUserIds=staff.flatMap(s=>s.memberLink ? [s.memberLink.userId]:[]);
  const customers=await prisma.customer.findMany({where:{storeId,mergedIntoCustomerId:null,OR:[{userId:{in:linkedUserIds}},{identityLinks:{some:{userId:{in:linkedUserIds}}}}]},select:{id:true,name:true,userId:true,identityLinks:{select:{userId:true}}}});
  return (
    <PageShell className="course-workspace mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6">
      <PageHeader title="人員管理" />
      <CourseStaffWorkspace
        music={!!musicEntitlement}
        maxStaff={limits.maxStaff}
        templates={templates}
        canManage={canManage}
        permissionGroups={Object.values(PERMISSION_GROUPS)
          .map((g) => ({
            label: g.label,
            codes: g.codes
              .filter((code) => COURSE_PERMISSIONS.includes(code))
              .map((code) => ({
                code,
                label:
                  COURSE_PERMISSION_LABELS[code] ?? PERMISSION_LABELS[code],
              })),
          }))
          .filter((g) => g.codes.length)}
        staff={staff.map((s) => ({
          id: s.id,
          name: s.displayName,
          phone: s.phone,
          coachEnabled:s.courseCoachEnabled,
          qualificationsConfirmed:s.courseQualificationsConfirmed,
          qualificationIds:s.courseQualifiedTemplateIds,
          updatedAt:s.updatedAt.toISOString(),
          birthday:s.courseBirthday?.toISOString().slice(0,10) ?? "",
          emergencyContactRelation:s.emergencyContactRelation,
          assignments:handover.filter(h=>h.coachId===s.id).map(h=>({id:h.id,name:h.nameSnapshot,startsAt:h.startsAt.toISOString(),capacity:h.capacity})),
          emergencyContactName: s.emergencyContactName,
          emergencyContactPhone: s.emergencyContactPhone,
          kind: s.user.role === "CUSTOMER" ? "coach" : "manager",
          email: s.user.email ?? "",
          active: s.status === "ACTIVE",
          coachLoginReady: !!s.memberLink && !s.memberLink.revokedAt && s.memberLink.user.status === "ACTIVE" && s.status === "ACTIVE" && s.courseCoachEnabled,
          memberEnabled: s.memberLink?.courseMemberEnabled ?? true,
          permissions: s.permissions
            .map((p) => p.permission)
            .filter((permission) => COURSE_PERMISSIONS.some((code) => code === permission)),
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
