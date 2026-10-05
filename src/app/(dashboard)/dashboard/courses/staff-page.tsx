import {canMusicFinance,readMusicFinanceScope} from "@/server/services/music-finance-access";
import {readCourseOrders} from "@/server/services/course-display-order";
import {orderCourseRows} from "@/lib/course-display-order";
import {readSettlementSettings} from "@/server/services/course-monthly-settlement";
import {
  COURSE_PERMISSIONS,
  COURSE_PERMISSION_LABELS,
} from "@/lib/course-permissions";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  checkPermission,
  ALL_PERMISSIONS,
  getDefaultPermissionsForRole,
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
export async function CourseStaffPage({teachers=false}:{teachers?:boolean}={}) {
  const user = await getCurrentUser();
  if (
    !user ||
    !(await checkPermission(user.role, user.staffId, "staff.view"))
  )
    notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  const isChildStoreView = !!user.storeId && storeId !== user.storeId;
  await requireCourseStore(storeId);
  const [staff, canManage, templates, handover, limits, musicEntitlement, personLinks] = await Promise.all([
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
    isChildStoreView ? Promise.resolve(false) : checkPermission(user.role, user.staffId, "staff.manage"),
    coursePrisma.courseTemplate.findMany({where:{storeId},select:{id:true,name:true,musicSubjectId:true,musicTeacherShare:true,musicSubject:{select:{name:true}}},orderBy:[{musicSubjectId:"asc"},{name:"asc"}]}),
    coursePrisma.courseSession.findMany({where:{storeId,cancelledAt:null,endsAt:{gt:new Date()}},select:{id:true,coachId:true,nameSnapshot:true,startsAt:true,endsAt:true,capacity:true,_count:{select:{bookings:{where:{status:{not:"CANCELLED"}}}}}},orderBy:{startsAt:"asc"}}),
    getStoreLimitsByStoreId(storeId),
    prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}),
    prisma.courseStaffPersonLink.findMany({where:{storeId},select:{managerStaffId:true,instructorStaffId:true}}),
  ]);
  const canReadFees=!isChildStoreView&&await canMusicFinance(user,storeId,"teacher.compensation.read");
  const financeScope=isChildStoreView?[]:await readMusicFinanceScope(user,storeId);
  const financeRows=musicEntitlement&&canManage?await prisma.$queryRaw<Array<{staffId:string;teacherIds:string[]|null}>>`SELECT "staffId","teacherIds" FROM "CourseTeacherFinanceScope" WHERE "storeId"=${storeId}`:[];
  const displayOrders=await readCourseOrders(storeId);
  staff.splice(0,staff.length,...orderCourseRows(staff,displayOrders.staff?.ids??[]));
  const linkedUserIds=staff.flatMap(s=>s.memberLink ? [s.memberLink.userId]:[]);
  const customers=await prisma.customer.findMany({where:{storeId,mergedIntoCustomerId:null,OR:[{userId:{in:linkedUserIds}},{identityLinks:{some:{userId:{in:linkedUserIds}}}}]},select:{id:true,name:true,userId:true,identityLinks:{select:{userId:true}}}});
  return (
    <PageShell className="course-workspace mx-auto flex max-w-[1440px] flex-col gap-1 px-6 py-1">
      <PageHeader title={teachers?(musicEntitlement?"教師管理":"教練管理"):"人員管理"} />

      <CourseStaffWorkspace previewStoreId={storeId} key={storeId} displayOrder={displayOrders.staff} feeEnabled={(await readSettlementSettings(coursePrisma,storeId)).feeEnabled && canReadFees} canEditFees={!isChildStoreView&&await canMusicFinance(user,storeId,"teacher.compensation.manage")}
        financeScope={financeScope}
        teacherChoices={staff.filter(s=>s.courseCoachEnabled && (financeScope===null||financeScope.includes(s.id))).map(s=>({id:s.id,name:s.displayName}))}
        music={!!musicEntitlement}
        accountKind={teachers?"coach":"manager"}
        counterpartChoices={staff.filter(s=>teachers?s.user.role!=="CUSTOMER":s.user.role==="CUSTOMER").map(s=>({id:s.id,name:s.displayName,phone:s.phone,birthday:s.courseBirthday?.toISOString().slice(0,10)??"",emergencyContactName:s.emergencyContactName,emergencyContactPhone:s.emergencyContactPhone,emergencyContactRelation:s.emergencyContactRelation,linked:personLinks.some(l=>l.managerStaffId===s.id||l.instructorStaffId===s.id)}))}

        maxStaff={limits.maxStaff}
        templates={templates.map(t=>({...t,musicTeacherShare:canReadFees?t.musicTeacherShare:null,subjectName:t.musicSubject?.name}))}
        canManage={canManage}
        canAssignRoles={user.role === "OWNER" || user.role === "ADMIN"}
        rolePresets={Object.fromEntries((["OWNER", "MANAGER", "STAFF"] as const).map(role => [role, getDefaultPermissionsForRole(role).filter(code => COURSE_PERMISSIONS.includes(code))]))}
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
        staff={staff.filter(s=>teachers?s.user.role==="CUSTOMER":s.user.role!=="CUSTOMER").map((s) => ({
          id: s.id,
          canEdit: canManage && (user.role !== "MANAGER" || ["STAFF", "PARTNER"].includes(s.user.role)),
          role: s.user.role,
          linkedStaffId:teachers?personLinks.find(l=>l.instructorStaffId===s.id)?.managerStaffId??"":personLinks.find(l=>l.managerStaffId===s.id)?.instructorStaffId??"",
          linkedStaffName:teachers?staff.find(other=>other.id===personLinks.find(l=>l.instructorStaffId===s.id)?.managerStaffId)?.displayName??"":staff.find(other=>other.id===personLinks.find(l=>l.managerStaffId===s.id)?.instructorStaffId)?.displayName??"",
          financeTeacherIds:financeRows.find(f=>f.staffId===s.id)?.teacherIds??null,
          name: s.displayName,
          phone: s.phone,
          defaultClassFee:s.courseDefaultClassFee?.toString()??"",
          contactEmail:s.user.email ?? "",
          notificationsEnabled:!!s.memberLink && !s.memberLink.revokedAt,
          coachEnabled:s.courseCoachEnabled,
          qualificationsConfirmed:s.courseQualificationsConfirmed,
          qualificationIds:s.courseQualifiedTemplateIds,
          updatedAt:s.updatedAt.toISOString(),
          birthday:s.courseBirthday?.toISOString().slice(0,10) ?? "",
          emergencyContactRelation:s.emergencyContactRelation,
          assignments:handover.filter(h=>h.coachId===s.id).map(h=>({id:h.id,name:h.nameSnapshot,startsAt:h.startsAt.toISOString(),endsAt:h.endsAt.toISOString(),capacity:h.capacity,bookedCount:h._count.bookings})),
          emergencyContactName: s.emergencyContactName,
          emergencyContactPhone: s.emergencyContactPhone,
          kind: s.user.role === "CUSTOMER" ? "coach" : "manager",
          email: s.user.email ?? "",
          active: s.status === "ACTIVE",
          coachLoginReady: !!s.memberLink && !s.memberLink.revokedAt && s.memberLink.user.status === "ACTIVE" && s.status === "ACTIVE" && s.courseCoachEnabled,
          memberEnabled: s.memberLink?.courseMemberEnabled ?? true,
          permissions: (s.user.role === "OWNER" ? [...ALL_PERMISSIONS] : s.permissions.map((p) => p.permission))
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
