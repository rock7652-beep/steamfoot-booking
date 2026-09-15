"use server";
import { z } from "zod";
import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import { courseManager } from "@/server/services/course-access";
import { COURSE_PERMISSIONS } from "@/lib/course-permissions";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
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
        kind: z.enum(["manager", "coach"]),
        email: z.string().email().optional(),
        password: z.string().min(8).max(100).optional(),
        customerId: id.optional(),
        active: z.boolean().default(true),
        permissions: z.array(z.enum(ALL_PERMISSIONS)).optional(),
        requestKey: z.string().uuid(),
      })
      .parse(input);
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
              data: { name: d.name, status: d.active ? "ACTIVE" : "SUSPENDED" },
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
                  displayName: d.name,
                  colorCode: colors[count % colors.length],
                  spaceFeeEnabled: false,
                  status: d.active ? "ACTIVE" : "INACTIVE",
                },
              },
            },
          });
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
        if (memberUserId && d.kind === "coach")
          await tx.staffMemberLink.upsert({
            where: { uq_staff_member_link_staff_store: { staffId, storeId } },
            create: {
              storeId,
              staffId,
              userId: memberUserId,
              linkedByUserId: user.id,
            },
            update: {
              userId: memberUserId,
              revokedAt: d.active ? null : new Date(),
              linkedByUserId: user.id,
            },
          });
        if (!d.active)
          await tx.staffMemberLink.updateMany({
            where: { staffId, storeId },
            data: { revokedAt: new Date() },
          });
        else if (d.kind === "coach")
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
    return handleActionError(e);
  }
}
