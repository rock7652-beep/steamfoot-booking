import "server-only";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";
import { musicOpeningMakeupBatchSchema, musicOpeningMakeupRecordSchema, musicOpeningMakeupHash, planMusicOpeningMakeupBatch, type MusicOpeningMakeupReceipt, type MusicOpeningMakeupVerification } from "@/lib/music-opening-makeup";
import { lockCourseStore } from "./course-store-lock";
import type { CourseActor } from "./course-booking";
import type { Prisma } from "../../../generated/course-client";

/** Server adapter only: no public action, file upload, source sync or browser-supplied verification. */
export async function importOpeningMakeupInTransaction(tx: Prisma.TransactionClient, actor: CourseActor, raw: unknown, verification: MusicOpeningMakeupVerification, sourceEnrollmentKeys?: readonly string[]) {
  const batch = musicOpeningMakeupBatchSchema.parse(raw);
  if (actor.customerId || batch.scope.targetStoreId !== actor.storeId) throw new AppError("FORBIDDEN", "期初來源不屬於本店");
  // Optional trusted server batch boundary, including enrollments with zero
  // current rights. Completeness is still required for every selected enrollment;
  // unrelated learners' immutable receipts are not replayed or discarded.
  const selected = sourceEnrollmentKeys ? new Set(sourceEnrollmentKeys) : null;
  if (selected && (!selected.size || selected.size > 100 || selected.size !== sourceEnrollmentKeys!.length ||
      [...selected].some(k => !k || k.length > 200 || k.trim() !== k) ||
      batch.records.some(r => !selected.has(r.sourceEnrollmentKey)) ||
      batch.manifest.cutoffCoverage.some(c => !selected.has(c.sourceEnrollmentKey)) ||
      [...selected].some(k => batch.manifest.cutoffCoverage.filter(c => c.sourceEnrollmentKey === k).length !== 1))) throw new AppError("VALIDATION", "來源批次範圍未通過核對");
  await lockCourseStore(tx, actor.storeId);
  const music = await tx.$queryRaw<Array<{ featureKey: string }>>`SELECT "featureKey" FROM "StoreFeatureEntitlement" WHERE "storeId"=${actor.storeId} AND "featureKey"='business.music' AND status::text='ENABLED' LIMIT 1`;
  if (!music.length) throw new AppError("FORBIDDEN", "此功能僅適用於音樂教室");
  const scopeKey = musicOpeningMakeupHash(batch.scope);
  const stored = await tx.courseMusicOpeningMakeupEntitlement.findMany({ where: { storeId: actor.storeId }, select: { id: true, sourceKey: true, sourceSlotKey: true, contentHash: true, snapshot: true, version: true } });
  const prior = await tx.$queryRaw<Array<{ afterJson: { receipt: MusicOpeningMakeupReceipt } }>>`SELECT "afterJson" FROM "AuditLog" WHERE "storeId"=${actor.storeId} AND "targetType"='MusicOpeningMakeupManifest' AND action='OPENING_MAKEUP_DISPOSITION'`;
  // Stable namespace deliberately excludes cutoff/revision. Never hide remembered
  // exclusions when an upstream extract changes cutoff or renames a source ID.
  const sameNamespace = (scope: typeof batch.scope) => scope.version === batch.scope.version && scope.targetStoreId === batch.scope.targetStoreId && scope.sourceSystem === batch.scope.sourceSystem && scope.sourceTenantKey === batch.scope.sourceTenantKey;
  const inScope = (snapshot: unknown) => {
    const record = musicOpeningMakeupRecordSchema.parse(snapshot);
    return sameNamespace(record.scope) && (!selected || selected.has(record.sourceEnrollmentKey));
  };
  const existing = stored.filter(row => inScope(row.snapshot));
  const receipts = prior.map(row => row.afterJson.receipt).filter(receipt => inScope(receipt.snapshot));
  if (selected) {
    // The completed lesson identity was already namespace-global in the pure
    // planner. A narrower validation batch must not weaken that uniqueness.
    const outsideCompleted = new Set(prior.map(row => row.afterJson.receipt).filter(receipt => {
      const record = musicOpeningMakeupRecordSchema.parse(receipt.snapshot);
      return sameNamespace(record.scope) && !selected.has(record.sourceEnrollmentKey) && receipt.kind === "EXCLUDE_COMPLETED";
    }).map(receipt => receipt.snapshot.completedPair!.sourceMakeupLessonKey));
    if (batch.records.some(record => record.completedPair && outsideCompleted.has(record.completedPair.sourceMakeupLessonKey))) throw new AppError("VALIDATION", "DUPLICATE_COMPLETED_PAIR");
  }
  const plan = planMusicOpeningMakeupBatch(batch, existing, receipts, verification);
  if (plan.status !== "READY") throw new AppError("VALIDATION", `期初補課仍須核對：${plan.issue}`);
  const priorKeys = new Set(receipts.map(receipt => receipt.sourceKey));
  // Independently confirm actual tenant/customer/course/native links inside the same lock.
  for (const record of batch.records) {
    const [customers, template] = await Promise.all([
      tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Customer" WHERE id=${record.mapping.customerId} AND "storeId"=${actor.storeId} AND "mergedIntoCustomerId" IS NULL`,
      tx.courseTemplate.findFirst({ where: { id: record.mapping.templateId, storeId: actor.storeId }, select: { classType: true } }),
    ]);
    if (!customers.length || !template || template.classType !== record.mapping.classType) throw new AppError("VALIDATION", "學員或課程來源映射未通過本店核對");
  }
  for (const record of plan.postCutoff) {
    const source = record.nativeSourceBooking!;
    const booking = await tx.courseBooking.findFirst({ where: { id: source.id, storeId: actor.storeId, customerId: source.customerId, cardId: source.cardId, status: "CANCELLED", absenceKind: "STUDENT_LEAVE", bookingKind: "CARD", makeupForBookingId: null, musicOpeningMakeupEntitlementId: null }, include: { card: true, session: true } });
    if (!booking || booking.card?.unit !== "SESSION" || booking.session.templateId !== source.templateId || toLocalDateStr(booking.session.startsAt) !== record.sourceDate.value) throw new AppError("VALIDATION", "切點後請假未對應實際原預約，不能另發權益");
    const receipt = plan.receipts.find(r => r.snapshot.nativeSourceBooking?.id === source.id)!;
    if (!priorKeys.has(receipt.sourceKey) && await tx.courseBooking.findFirst({ where: { storeId: actor.storeId, makeupForBookingId: source.id, OR: [{ status: { not: "CANCELLED" } }, { absenceKind: "STUDENT_LEAVE" }] } })) throw new AppError("VALIDATION", "原生請假已使用或保留，須先核對完整補課鏈");
  }
  const ids: string[] = [];
  for (const entry of plan.entries) {
    if (entry.action === "NO_OP") { ids.push(entry.targetEntityId!); continue; }
    const record = entry.snapshot;
    const row = await tx.courseMusicOpeningMakeupEntitlement.create({ data: {
      id: randomUUID(), storeId: actor.storeId, customerId: record.mapping.customerId, templateId: record.mapping.templateId,
      sourceKey: entry.sourceKey, sourceSlotKey: entry.sourceSlotKey, contentHash: entry.contentHash,
      snapshot: record as unknown as Prisma.InputJsonValue, appliedBatchId: batch.batchId,
    } });
    ids.push(row.id);
  }
  for (const receipt of plan.receipts) {
    if (priorKeys.has(receipt.sourceKey)) continue;
    const auditId = `opening-disposition:${musicOpeningMakeupHash(receipt.sourceKey)}`;
    const payload = JSON.stringify({ receipt, manifestHash: plan.manifestHash, batchId: batch.batchId, cutoffCoverage: plan.cutoffCoverage });
    await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,"targetType","targetId",action,summary,"afterJson","createdAt") VALUES (${auditId},${actor.userId},${actor.name},${actor.storeId},'MUSIC','MusicOpeningMakeupManifest',${scopeKey},'OPENING_MAKEUP_DISPOSITION','期初補課來源核對',${payload}::jsonb,NOW())`;
  }
  return { entitlementIds: ids, ...plan.counts,
    created: plan.entries.filter(entry => entry.action === "CREATE").length,
    skipped: plan.entries.filter(entry => entry.action === "NO_OP").length };
}
