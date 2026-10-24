import "server-only";
import { assertMusicOpeningPreviewEnvironment, MUSIC_OPENING_STORE } from "../../../scripts/music-opening-preview-scope.mjs";
import { AppError } from "@/lib/errors";
import { FEATURES } from "@/lib/feature-flags";
import {
  musicSourceTeacherSnapshotSchema, musicSourceTeacherIdentity, planMusicSourceTeacherDraft,
  MUSIC_SOURCE_TEACHER_TARGET, MUSIC_SOURCE_TEACHER_HOLD, isMusicSourceTeacherId,
} from "@/lib/music-source-teacher-draft";
import type { Prisma } from "@prisma/client";

/** Internal only. No action, route, CLI, upload or source-reader is exposed here.
 * A reviewed source-reader must supply independent proof before any real import.
 * Gate before dynamically importing anything which can construct a DB client. */
export async function stageMusicSourceTeacherDraft(raw: unknown, proof: unknown) {
  if (process.env.VERCEL !== "1") throw new AppError("FORBIDDEN", "來源草稿僅限核准的音樂 Preview");
  assertMusicOpeningPreviewEnvironment(process.env);
  const initial = planMusicSourceTeacherDraft(raw, proof, { staff: null, user: null, receipts: [], hasRelatedData: false });
  if (initial.status === "HOLD") return initial;
  const snapshot = musicSourceTeacherSnapshotSchema.parse(raw);
  const [{ prisma }, { courseManager }, { requireStoreFeature }] = await Promise.all([
    import("@/lib/db"), import("./course-access"), import("@/lib/feature-gate"),
  ]);
  const { user: actor, storeId } = await courseManager("staff.manage");
  if (storeId !== MUSIC_OPENING_STORE || !["OWNER", "MANAGER", "ADMIN"].includes(actor.role)) throw new AppError("FORBIDDEN", "來源教師不屬於本店授權範圍");
  await requireStoreFeature(storeId, FEATURES.STAFF_MANAGEMENT);
  const identity = musicSourceTeacherIdentity(snapshot);
  // Deliberately use the core transaction, never courseTransaction's notification kick.
  return prisma.$transaction(async tx => {
    const stores = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Store" WHERE id=${storeId} AND "industryModule"::text='COURSE' FOR UPDATE`;
    if (stores.length !== 1 || stores[0].id !== snapshot.targetStoreId) throw new AppError("FORBIDDEN", "來源教師門市核對失敗");
    const music = await tx.$queryRaw<Array<{ storeId: string }>>`SELECT "storeId" FROM "StoreFeatureEntitlement" WHERE "storeId"=${storeId} AND "featureKey"='business.music' AND status::text='ENABLED' AND ("startsAt" IS NULL OR "startsAt"<=CURRENT_TIMESTAMP) AND ("expiresAt" IS NULL OR "expiresAt">CURRENT_TIMESTAMP)`;
    if (music.length !== 1 || music[0].storeId !== storeId) throw new AppError("FORBIDDEN", "來源教師僅適用已開通的本店音樂教室");
    const [staff, user, receipts, related] = await Promise.all([
      tx.staff.findUnique({ where: { id: identity.staffId }, select: {
        id: true, userId: true, storeId: true, displayName: true, status: true, isOwner: true,
        phone: true, emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true, courseBirthday: true,
        courseCoachEnabled: true, courseQualificationsConfirmed: true, courseQualifiedTemplateIds: true,
        courseDefaultClassFee: true, monthlySpaceFee: true, spaceFeeEnabled: true,
      } }),
      tx.user.findUnique({ where: { id: identity.userId }, select: {
        id: true, name: true, role: true, status: true, email: true, phone: true, passwordHash: true, emailVerified: true, image: true,
      } }),
      tx.auditLog.findMany({ where: { OR: [{ id: identity.auditId }, { targetId: identity.staffId, source: "SOURCE_REPLICA" }] }, select: {
        id: true, source: true, storeId: true, module: true, targetType: true, targetId: true, action: true, afterJson: true,
      } }),
      tx.$queryRaw<Array<{ hasRelatedData: boolean }>>`SELECT (
        EXISTS(SELECT 1 FROM "Account" WHERE "userId"=${identity.userId}) OR
        EXISTS(SELECT 1 FROM "Session" WHERE "userId"=${identity.userId}) OR
        EXISTS(SELECT 1 FROM "Customer" WHERE "userId"=${identity.userId}) OR
        EXISTS(SELECT 1 FROM "CustomerIdentityLink" WHERE "userId"=${identity.userId}) OR
        EXISTS(SELECT 1 FROM "Staff" WHERE "userId"=${identity.userId} AND id<>${identity.staffId}) OR
        EXISTS(SELECT 1 FROM "StaffPermission" WHERE "staffId"=${identity.staffId}) OR
        EXISTS(SELECT 1 FROM "StaffMemberLink" WHERE "staffId"=${identity.staffId} OR "userId"=${identity.userId}) OR
        EXISTS(SELECT 1 FROM "CourseStaffPersonLink" WHERE "managerStaffId"=${identity.staffId} OR "instructorStaffId"=${identity.staffId}) OR
        EXISTS(SELECT 1 FROM "CourseCompensation" WHERE "staffId"=${identity.staffId}) OR
        EXISTS(SELECT 1 FROM "CourseTeacherCompensationSetting" WHERE "staffId"=${identity.staffId}) OR
        EXISTS(SELECT 1 FROM "CourseTeacherFinanceScope" WHERE "staffId"=${identity.staffId}) OR
        EXISTS(SELECT 1 FROM "CourseStaffAvailability" WHERE "staffId"=${identity.staffId}) OR
        EXISTS(SELECT 1 FROM "CourseStaffAvailabilityException" WHERE "staffId"=${identity.staffId}) OR
        EXISTS(SELECT 1 FROM "CourseSession" WHERE "coachId"=${identity.staffId})
      ) AS "hasRelatedData"`,
    ]);
    const plan = planMusicSourceTeacherDraft(snapshot, proof, {
      staff: staff ? { ...staff, monthlySpaceFee: staff.monthlySpaceFee.toString() } : null, user, receipts,
      hasRelatedData: related.length !== 1 || related[0].hasRelatedData !== false,
    });
    if (plan.status !== "READY") return plan;
    await tx.user.create({ data: plan.user });
    await tx.staff.create({ data: plan.staff });
    await tx.auditLog.create({ data: { ...plan.receipt, actorUserId: actor.id, afterJson: plan.receipt.afterJson as Prisma.InputJsonValue } });
    return { status: "STAGED" as const, staffId: plan.staffId, userId: plan.userId };
  }, { timeout: 20000 });
}

/** DRAFT is deliberately terminal for ordinary staff settings in this phase.
 * A future reviewed activation path must verify source state and run the complete
 * existing personnel/contact/qualification/fee checks, not just flip active=true.
 * Missing/corrupt receipts cannot turn a deterministic draft into ordinary staff. */
export async function assertMusicSourceTeacherDraftEditable(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  staff: { id: string; userId: string },
  storeId: string,
) {
  if (isMusicSourceTeacherId(staff.id) || isMusicSourceTeacherId(staff.userId)) throw new AppError("CONFLICT", MUSIC_SOURCE_TEACHER_HOLD);
  if (storeId !== MUSIC_OPENING_STORE) return;
  const receipts = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "AuditLog" WHERE "targetId"=${staff.id} AND source='SOURCE_REPLICA' AND "targetType"=${MUSIC_SOURCE_TEACHER_TARGET} LIMIT 1`;
  if (receipts.length) throw new AppError("CONFLICT", MUSIC_SOURCE_TEACHER_HOLD);
}
