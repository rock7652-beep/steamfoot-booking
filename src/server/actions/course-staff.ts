"use server";
import { ResourceConflict, handleCourseActionError } from "@/server/services/course-resources";
import { parseTaipeiDateTime } from "@/lib/date-utils";
import { z } from "zod";
import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import { courseManager } from "@/server/services/course-access";
import { COURSE_PERMISSIONS } from "@/lib/course-permissions";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { compensationRule, type CompensationRule } from "@/lib/course-compensation";
import {
  getStoreLimitsByStoreId,
  requireStoreFeature,
} from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import {
  revalidateStaff,
  revalidateStaffPermissions,
} from "@/lib/revalidation";
import { revalidatePath } from "next/cache";
const id = z.string().min(1).max(180);
const teachingFee = z.object({
  templateId: id,
  value: compensationRule.refine(rule => rule.mode === "CLASS" || rule.mode === "SHARE", "僅支援每堂固定或音樂課按比例計酬"),
  revision: z.number().int().min(0),
});
export async function readCourseStaffTeaching(staffId: string) {
  try {
    const { user, storeId } = await courseManager("staff.manage");
    if (user.role !== "OWNER") throw new AppError("FORBIDDEN", "僅店長可管理人員");
    id.parse(staffId);
    const data = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      const staff = await tx.staff.findFirst({ where: { id: staffId, storeId } });
      if (!staff) throw new AppError("NOT_FOUND", "找不到本店人員");
      const fees = await tx.$queryRaw<Array<{templateId: string; rules: CompensationRule[]; revision: number}>>`SELECT "templateId", rules, revision FROM "CourseCompensation" WHERE "storeId"=${storeId} AND "staffId"=${staffId}`;
      return { version: staff.updatedAt.toISOString(), qualificationIds: staff.courseQualifiedTemplateIds, fees };
    });
    return { success: true as const, ...data };
  } catch (e) { const result = handleCourseActionError(e); return { success: false as const, error: result.error ?? "讀取失敗" }; }
}
const colors = [
  "#355b46",
  "#b28a3e",
  "#0d9488",
  "#7c3aed",
  "#2563eb",
  "#be185d",
];
export async function saveCourseStaff(input: unknown) {
  try {
    const { user, storeId } = await courseManager("staff.manage");
    if (user.role !== "OWNER")
      throw new AppError("FORBIDDEN", "僅店長可管理人員");
    await requireStoreFeature(storeId, FEATURES.STAFF_MANAGEMENT);
    const d = z
      .object({
        id: id.optional(),
        name: z.string().trim().min(1).max(80),
        phone: z.string().trim().max(30).default(""),
        emergencyContactName: z.string().trim().max(80).default(""),
        emergencyContactPhone: z.string().trim().max(30).default(""),
        kind: z.enum(["manager", "coach"]),
        coachEnabled: z.boolean().optional(),
        qualificationIds: z.array(id).max(500).optional(),
        qualificationsConfirmed: z.boolean().optional(),
        teachingVersion: z.string().datetime().optional(),
        teachingFees: z.array(teachingFee).max(500).optional(),
        birthday: z.string().optional(),
        emergencyContactRelation: z.string().trim().max(40).default(""),
        confirmDeactivate: z.boolean().default(false),
        email: z.string().email().optional(),
        password: z.string().min(8).max(100).optional(),
        customerId: id.optional(),
        active: z.boolean().default(true),
        memberEnabled: z.boolean().default(true),
        permissions: z.array(z.enum(ALL_PERMISSIONS)).optional(),
        requestKey: z.string().uuid(),
      })
      .parse(input);
    if (d.permissions?.some((p) => !COURSE_PERMISSIONS.includes(p)))
      throw new AppError("FORBIDDEN", "只能設定課程模組的店內權限");
    if (d.teachingFees?.some(f=>f.value.mode==="SHARE") && !await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}))
      throw new AppError("VALIDATION","只有音樂教室可設定老師拆帳比例");
    if (!d.id && (!d.emergencyContactName || !d.emergencyContactPhone || !d.emergencyContactRelation)) throw new AppError("VALIDATION","新建人員請填緊急聯絡姓名、關係與電話");
    if (d.birthday && !parseTaipeiDateTime(d.birthday,"00:00")) throw new AppError("VALIDATION","生日格式不正確");
    const contacts = { emergencyContactRelation:d.emergencyContactRelation, ...(d.birthday!==undefined?{courseBirthday:d.birthday?new Date(d.birthday+"T00:00:00Z"):null}:{}), phone: d.phone, emergencyContactName: d.emergencyContactName, emergencyContactPhone: d.emergencyContactPhone };
    const limits = await getStoreLimitsByStoreId(storeId);
    if (!d.id && d.kind === "manager" && (!d.email || !d.password))
      throw new AppError("VALIDATION", "建立店長必須填登入信箱與密碼");
    const passwordHash = d.password ? hashSync(d.password, 10) : null;
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`staff-capacity:${storeId}`}, 0))`;
        const staffId = d.id ?? `course-person:${storeId}:${d.requestKey}`;
        const existing = await tx.staff.findFirst({
          where: { id: staffId, storeId },
          include: { user: true },
        });
        if (d.id && !existing)
          throw new AppError("NOT_FOUND", "找不到本店人員");
        if (!d.id && existing) return;
        if (d.teachingFees && existing && d.teachingVersion !== existing.updatedAt.toISOString())
          throw new AppError("CONFLICT", "人員資料已更新，請重新開啟核對；本次修改尚未儲存");
        if (
          existing &&
          (existing.user.role !== "CUSTOMER") !== (d.kind === "manager")
        )
          throw new AppError(
            "CONFLICT",
            "不可用角色改名取代身分連結；請分別管理後台帳號與教練",
          );
        if (
          existing?.id === user.staffId &&
          (!d.active ||
            (d.permissions && !d.permissions.includes("staff.manage")))
        )
          throw new AppError("FORBIDDEN", "不能停用自己或移除自己的管理權限");
        const coachEnabled = d.coachEnabled ?? existing?.courseCoachEnabled ?? d.kind === "coach";
        const qualificationIds = [...new Set(d.qualificationIds ?? existing?.courseQualifiedTemplateIds ?? [])];
        const qualificationsConfirmed = d.qualificationsConfirmed ?? existing?.courseQualificationsConfirmed ?? false;
        if (qualificationIds.length) {
          const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "CourseTemplate" WHERE "storeId"=${storeId} AND id=ANY(${qualificationIds}::text[])`;
          if(rows.length!==qualificationIds.length) throw new AppError("FORBIDDEN","授課資格包含非本店課程");
        }
        if(existing?.status === "ACTIVE" && !d.active && !d.confirmDeactivate) throw new AppError("CONFLICT","請確認停用：所有工作存取立即撤銷，既有課次保留待交接");
        const removed=existing?.courseQualifiedTemplateIds?.filter(id=>!qualificationIds.includes(id)) ?? [];
        if(existing && d.active && ((existing.courseCoachEnabled && !coachEnabled) || removed.length)) {
          const rows=await tx.$queryRaw<Array<{id:string;name:string;startsAt:Date;capacity:number}>>`SELECT id,"nameSnapshot" AS name,"startsAt",capacity FROM "CourseSession" WHERE "storeId"=${storeId} AND "coachId"=${existing.id} AND "cancelledAt" IS NULL AND "endsAt">CURRENT_TIMESTAMP AND (${!coachEnabled} OR "templateId"=ANY(${removed}::text[])) ORDER BY "startsAt"`;
          if(rows.length) throw new ResourceConflict("尚有未結束課次（含進行中），請先交接再移除教練身分或資格",rows.map(r=>({...r,startsAt:r.startsAt.toISOString()})));
        }
        if(existing?.courseQualificationsConfirmed && !qualificationsConfirmed) throw new AppError("VALIDATION","已確認資格不可改回待補；請調整可教課程");
        const courseFields={courseCoachEnabled:coachEnabled,courseQualifiedTemplateIds:qualificationIds,courseQualificationsConfirmed:qualificationsConfirmed};
        if (d.teachingFees) {
          const feeIds = d.teachingFees.map(f => f.templateId);
          if (new Set(feeIds).size !== feeIds.length || feeIds.length !== qualificationIds.length || feeIds.some(id => !qualificationIds.includes(id)))
            throw new AppError("VALIDATION", "每個可教授課程都需有一筆授課費");
          const current = await tx.$queryRaw<Array<{templateId:string;revision:number}>>`SELECT "templateId", revision FROM "CourseCompensation" WHERE "storeId"=${storeId} AND "staffId"=${staffId} FOR UPDATE`;
          for (const fee of d.teachingFees) {
            if ((current.find(r => r.templateId === fee.templateId)?.revision ?? 0) !== fee.revision)
              throw new AppError("CONFLICT", "授課費已更新，請重新開啟核對；本次修改尚未儲存");
          }
        }
        const count = await tx.staff.count({
          where: { storeId, status: "ACTIVE" },
        });
        if (
          d.active &&
          (!existing || existing.status !== "ACTIVE") &&
          limits.maxStaff !== null &&
          count >= limits.maxStaff
        )
          throw new AppError("FORBIDDEN", "已達方案人員額度上限");
        let memberUserId: string | undefined;
        if (d.customerId) {
          const c = await tx.customer.findFirst({
            where: { id: d.customerId, storeId, mergedIntoCustomerId: null },
            include: { identityLinks: { select: { userId: true } } },
          });
          const userIds = [
            ...new Set(
              [
                c?.userId,
                ...(c?.identityLinks.map((l) => l.userId) ?? []),
              ].filter((v): v is string => !!v),
            ),
          ];
          if (!c || userIds.length !== 1)
            throw new AppError(
              "VALIDATION",
              "請先完成此顧客的固定帳號綁定，再加入教練",
            );
          const account = await tx.user.findFirst({
            where: { id: userIds[0], status: "ACTIVE", role: "CUSTOMER" },
          });
          if (!account)
            throw new AppError("FORBIDDEN", "請選擇已啟用的會員帳號");
          memberUserId = account.id;
          const link = await tx.staffMemberLink.findUnique({
            where: {
              uq_staff_member_link_user_store: {
                userId: memberUserId,
                storeId,
              },
            },
          });
          if (link && link.staffId !== staffId)
            throw new AppError(
              "CONFLICT",
              "此顧客已連結另一位教練，請編輯原人員",
            );
        }
        if (existing) {
          await tx.staff.update({
            where: { id: existing.id },
            data: {
              ...contacts,
              ...courseFields,
              displayName: d.name,
              status: d.active ? "ACTIVE" : "INACTIVE",
              spaceFeeEnabled: false,
            },
          });
          // Only operational synthetic accounts are edited for coaches. A real
          // member account remains untouched when work access is disabled.
          if (d.kind === "manager")
            await tx.user.update({
              where: { id: existing.userId },
              data: { name: d.name, ...(d.active?{status:"ACTIVE" as const}:{}), ...(d.email ? { email: d.email } : {}), ...(passwordHash ? { passwordHash } : {}) },
            });
        } else
          await tx.user.create({
            data: {
              id: `course-user:${storeId}:${d.requestKey}`,
              name: d.name,
              email: d.kind === "manager" ? d.email : null,
              passwordHash: d.kind === "manager" ? passwordHash : null,
              role: d.kind === "manager" ? "OWNER" : "CUSTOMER",
              status: d.kind === "manager" ? "ACTIVE" : "SUSPENDED",
              staff: {
                create: {
                  id: staffId,
                  storeId,
                  ...contacts,
              ...courseFields,
              displayName: d.name,
                  colorCode: colors[count % colors.length],
                  spaceFeeEnabled: false,
                  status: d.active ? "ACTIVE" : "INACTIVE",
                },
              },
            },
          });
        if (d.teachingFees) {
          for (const fee of d.teachingFees) {
            const rules = JSON.stringify([fee.value]);
            await tx.$executeRaw`INSERT INTO "CourseCompensation" ("storeId","templateId","staffId",rules,revision) VALUES (${storeId},${fee.templateId},${staffId},${rules}::jsonb,1) ON CONFLICT ("storeId","templateId","staffId") DO UPDATE SET rules=EXCLUDED.rules,revision="CourseCompensation".revision+1,"updatedAt"=NOW()`;
          }
        }
        if (d.kind === "manager") {
          const granted = d.permissions ?? [...COURSE_PERMISSIONS];
          for (const permission of ALL_PERMISSIONS)
            await tx.staffPermission.upsert({
              where: { staffId_permission: { staffId, permission } },
              create: {
                staffId,
                permission,
                granted: granted.includes(permission),
              },
              update: { granted: granted.includes(permission) },
            });
        }
        if (memberUserId) {
          const priorLink=await tx.staffMemberLink.findUnique({where:{uq_staff_member_link_staff_store:{staffId,storeId}}});
          if(priorLink && priorLink.userId!==memberUserId) throw new AppError("CONFLICT","已有固定會員連結，不可覆蓋；請先處理身分審查");
        }
        if (memberUserId && coachEnabled)
          await tx.staffMemberLink.upsert({
            where: { uq_staff_member_link_staff_store: { staffId, storeId } },
            create: {
              storeId,
              staffId,
              userId: memberUserId,
              linkedByUserId: user.id,
              courseMemberEnabled: d.memberEnabled,
            },
            update: {
              userId: memberUserId,
              courseMemberEnabled: d.memberEnabled,
              revokedAt: d.active && coachEnabled ? null : new Date(),
              linkedByUserId: user.id,
            },
          });
        if (!d.active || !coachEnabled)
          await tx.staffMemberLink.updateMany({
            where: { staffId, storeId },
            data: { revokedAt: new Date() },
          });
        else if (coachEnabled)
          await tx.staffMemberLink.updateMany({
            where: { staffId, storeId },
            data: { revokedAt: null },
          });
      },
      { timeout: 20000 },
    );
    revalidateStaff();
    revalidateStaffPermissions();
    revalidatePath("/dashboard/courses");
    revalidatePath("/book");
    return { success: true as const };
  } catch (e) {
    return handleCourseActionError(e);
  }
}
