import "server-only";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import { musicOpeningImportHash, planVerifiedMusicOpeningImport, type MusicOpeningImportProof } from "@/lib/music-opening-import";
import { planMusicOpeningBatch, type MusicOpeningApplied } from "@/lib/music-opening-state";
import { musicOpeningMakeupHash, musicOpeningMakeupSourceKey, musicOpeningMakeupSourceSlotKey, musicOpeningMakeupContentHash } from "@/lib/music-opening-makeup";
import { assertMusicOpeningPreviewEnvironment, MUSIC_OPENING_STORE } from "../../../scripts/music-opening-preview-scope.mjs";
import { lockCourseStore } from "./course-store-lock";
import { importOpeningMakeupInTransaction } from "./music-opening-makeup-import";
import type { Prisma } from "../../../generated/course-client";
import type { CourseActor } from "./course-booking";

type ImportActor = CourseActor & { role: string };
const sourceTenant = "www.injiaoyun.com:store-lubymusic";
function reject(message: string): never { throw new AppError("VALIDATION", message); }

/** Local business-hour gate, independent of caller-supplied manifest timestamps. */
export function assertMusicOpeningImportWindow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map(p => [p.type, p.value]));
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const open = parts.weekday === "Sat" ? minute >= 510 && minute < 1290
    : ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) && minute >= 810 && minute < 1350;
  if (open) reject("BUSINESS_HOURS_IMPORT_PAUSED");
}
function assertScope(actor: ImportActor) {
  if (process.env.VERCEL !== "1") reject("MUSIC_PREVIEW_ONLY");
  assertMusicOpeningPreviewEnvironment(process.env);
  if (actor.storeId !== MUSIC_OPENING_STORE || actor.customerId || !["OWNER", "MANAGER", "ADMIN"].includes(actor.role)) reject("IMPORT_ACTOR_SCOPE_MISMATCH");
  assertMusicOpeningImportWindow();
  // A new batch needs room for the 30s transaction and commit overhead.
  assertMusicOpeningImportWindow(new Date(Date.now() + 60_000));
}
async function notificationCounts(tx: Prisma.TransactionClient, storeId: string) {
  return tx.$queryRaw<Array<{ kind: string; n: number }>>`
    SELECT 'message' AS kind, count(*)::int AS n FROM "MessageLog" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'coach', count(*)::int FROM "CourseCoachNotification" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'monthly', count(*)::int FROM "CourseMonthlyNotification" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'manager', count(*)::int FROM "ManagerNotificationLog" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'balance', count(*)::int FROM "SessionBalanceNotification" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'audit-outbox', count(*)::int FROM "OperationAuditOutbox" WHERE payload->>'storeId'=${storeId}
    ORDER BY kind`;
}

/** Internal transaction body, no route/CLI/upload. The wrapper below owns the
 * transaction; every validation/readback failure must escape and roll it back.
 * Never catch an uncertain commit and blindly retry. Read the same source keys. */
export async function importVerifiedMusicOpeningInTransaction(tx: Prisma.TransactionClient, actor: ImportActor, raw: unknown, proof: MusicOpeningImportProof) {
  assertScope(actor); // Must precede every query, including tests of wrong targets.
  const initial = planVerifiedMusicOpeningImport(raw, { ...proof, now: new Date().toISOString() });
  if (initial.status !== "READY") return initial;
  const { data, ordinary } = initial;
  if (ordinary.scope.targetStoreId !== actor.storeId || ordinary.scope.sourceTenantKey !== sourceTenant || ordinary.scope.cutoffBusinessDate !== "2026-10-01") reject("IMPORT_SOURCE_SCOPE_MISMATCH");
  await lockCourseStore(tx, actor.storeId);
  const notificationsBefore = await notificationCounts(tx, actor.storeId);
  if (notificationsBefore.length !== 6) reject("NOTIFICATION_GUARD_UNAVAILABLE");
  const stored = await tx.courseMusicOpeningState.findMany({ where: { storeId: actor.storeId, sourceKey: { in: ordinary.entries.map(e => e.key) } }, include: { card: { include: { members: true } } } });
  const ledger: MusicOpeningApplied[] = [];
  for (const row of stored) {
    const snapshot = row.snapshot as unknown as { scope: unknown; record: unknown };
    const old = planMusicOpeningBatch({ batchId: row.appliedBatchId, scope: snapshot.scope, records: [snapshot.record] }, []);
    if (old.status !== "READY" || old.entries.length !== 1 || old.entries[0].key !== row.sourceKey || old.entries[0].contentHash !== row.contentHash) reject("STORED_SOURCE_CORRUPT");
    const record = old.entries[0].record;
    ledger.push({ scope: old.scope, identity: { entityKind: record.entityKind, sourceRecordKey: record.sourceRecordKey }, contentHash: row.contentHash,
      targetEntityId: row.cardId, appliedBatchId: row.appliedBatchId, sourceRevision: record.sourceRevision });
  }
  const checked = planVerifiedMusicOpeningImport(data, { ...proof, now: new Date().toISOString() }, ledger);
  if (checked.status !== "READY") reject(checked.issue);
  const mappings = new Map<string, { planName: string }>();
  for (let i = 0; i < checked.ordinary.entries.length; i++) {
    const entry = checked.ordinary.entries[i], item = data.enrollments[i], row = stored.find(s => s.sourceKey === entry.key);
    // Concurrent identical ABSENT requests converge through the source unique
    // key and locked content comparison; a differing prevalue never overwrites.
    if (item.expected.kind === "EXISTING" && (!row || row.cardId !== item.expected.cardId || row.contentHash !== item.expected.contentHash)) reject("SOURCE_CAS_CONFLICT");
    if (row && (row.customerId !== item.mapping.customerId || !row.card.musicOpeningStateRequired || row.card.unit !== "SESSION" || row.card.planId !== item.mapping.planId || row.card.members.length !== 1 || row.card.members[0].customerId !== item.mapping.customerId || row.card.templateIds.length !== 1 || row.card.templateIds[0] !== item.mapping.templateId || row.card.expiresAt.toISOString() !== item.record.expiresAt || row.card.musicActivatedAt?.toISOString() !== item.record.activatedAt)) reject("EXISTING_TARGET_MAPPING_CONFLICT");
    const marker = `SOURCE_REPLICA|YINJIAOYUN|${sourceTenant}|STUDENT|${item.record.sourceStudentKey}`;
    const [customers, plan, template] = await Promise.all([
      tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Customer" WHERE id=${item.mapping.customerId} AND "storeId"=${actor.storeId} AND "serviceNote"=${marker} AND "mergedIntoCustomerId" IS NULL`,
      tx.coursePointPlan.findFirst({ where: { id: item.mapping.planId, storeId: actor.storeId, unit: "SESSION", allowShared: false }, select: { name: true, templateIds: true } }),
      tx.courseTemplate.findFirst({ where: { id: item.mapping.templateId, storeId: actor.storeId }, select: { classType: true } }),
    ]);
    if (customers.length !== 1 || !plan || !plan.templateIds.includes(item.mapping.templateId) || template?.classType !== item.mapping.classType) reject("VERIFIED_MAPPING_NOT_FOUND");
    mappings.set(entry.key, { planName: plan.name });
  }
  for (const record of checked.makeup.postCutoff) {
    const source = record.nativeSourceBooking!;
    const booking = await tx.courseBooking.findFirst({ where: { id: source.id, storeId: actor.storeId,
      customerId: source.customerId, cardId: source.cardId }, select: {
      musicOpeningSourceLessonKey: true, musicOpeningTermKey: true, musicOpeningLessonOrdinal: true,
    } });
    if (!booking || booking.musicOpeningSourceLessonKey !== record.sourceLessonKey || booking.musicOpeningTermKey !== record.sourceTermKey || booking.musicOpeningLessonOrdinal !== record.originalLessonOrdinal) reject("POST_CUTOFF_SOURCE_LINK_MISMATCH");
  }
  assertMusicOpeningImportWindow();
  // Existing dedicated importer validates complete source chains, and refuses
  // to create a post-cutoff right or fabricate its actual original booking.
  const makeup = await importOpeningMakeupInTransaction(tx, actor, data.makeup, checked.makeupVerification, data.enrollments.map(e => e.record.sourceRecordKey));
  let created = 0, skipped = 0;
  const cardIds: string[] = [];
  for (let i = 0; i < checked.ordinary.entries.length; i++) {
    assertMusicOpeningImportWindow();
    const entry = checked.ordinary.entries[i], item = data.enrollments[i], record = item.record;
    if (entry.action === "NO_OP") { skipped++; cardIds.push(entry.targetEntityId!); continue; }
    const id = randomUUID();
    await tx.coursePointCard.create({ data: {
      id, storeId: actor.storeId, planId: item.mapping.planId, nameSnapshot: mappings.get(entry.key)!.planName,
      unit: "SESSION", templateIds: [item.mapping.templateId], remaining: record.balance.remainingAtCutoff,
      expiresAt: new Date(record.expiresAt!), musicActivatedAt: new Date(record.activatedAt!),
      musicValidityDays: null, musicTermSizes: record.terms.map(t => t.totalLessons), musicBonusLessons: record.giftLessons,
      musicOpeningStateRequired: true, requestKey: `opening:${musicOpeningMakeupHash(entry.key)}`,
      members: { create: { customerId: item.mapping.customerId } },
    } });
    await tx.courseMusicOpeningState.create({ data: { storeId: actor.storeId, cardId: id, customerId: item.mapping.customerId,
      sourceKey: entry.key, contentHash: entry.contentHash, snapshot: { scope: ordinary.scope, record } as unknown as Prisma.InputJsonValue,
      appliedBatchId: ordinary.batchId, teacherFeePolicy: "UNVERIFIED" } });
    const auditId = `opening-import:${musicOpeningMakeupHash(entry.key)}`;
    const payload = JSON.stringify({ sourceKey: entry.key, contentHash: entry.contentHash, manifestHash: musicOpeningImportHash(data),
      sourceManifestKey: data.sourceManifestKey, sourceRevision: data.sourceRevision, observedAt: data.makeup.manifest.capturedAt,
      balanceAsOf: data.balanceAsOf, dates: item.dates, rules: item.rules });
    await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,"targetType","targetId",action,summary,"afterJson","createdAt") VALUES (${auditId},${actor.userId},${actor.name},${actor.storeId},'MUSIC','MusicOpeningImport',${id},'OPENING_IMPORT','已核實期初來源匯入',${payload}::jsonb,NOW())`;
    created++; cardIds.push(id);
  }
  // Read back actual persisted state; do not treat create() return values as proof.
  const readback = await tx.courseMusicOpeningState.findMany({ where: { storeId: actor.storeId, sourceKey: { in: checked.ordinary.entries.map(e => e.key) } }, include: { card: { include: { members: true } } } });
  for (let i = 0; i < checked.ordinary.entries.length; i++) {
    const entry = checked.ordinary.entries[i], item = data.enrollments[i], row = readback.find(r => r.sourceKey === entry.key);
    const expectedSnapshot = entry.action === "NO_OP" ? stored.find(s => s.sourceKey === entry.key)!.snapshot : { scope: ordinary.scope, record: entry.record };
    if (!row || row.cardId !== cardIds[i] || row.customerId !== item.mapping.customerId || row.contentHash !== entry.contentHash || musicOpeningMakeupHash(row.snapshot) !== musicOpeningMakeupHash(expectedSnapshot) || !row.card.musicOpeningStateRequired || row.card.members.length !== 1 || row.card.members[0].customerId !== item.mapping.customerId || row.card.storeId !== actor.storeId || row.card.planId !== item.mapping.planId || row.card.expiresAt.toISOString() !== item.record.expiresAt || row.card.musicActivatedAt?.toISOString() !== item.record.activatedAt || (entry.action === "CREATE" && row.card.remaining !== item.record.balance.remainingAtCutoff)) reject("IMPORT_READBACK_MISMATCH");
  }
  const rights = await tx.courseMusicOpeningMakeupEntitlement.findMany({ where: { storeId: actor.storeId, sourceKey: { in: checked.makeup.entries.map(e => e.sourceKey) } } });
  for (const entry of checked.makeup.entries) {
    const row = rights.find(r => r.sourceKey === entry.sourceKey);
    if (!row || row.customerId !== entry.snapshot.mapping.customerId || row.templateId !== entry.snapshot.mapping.templateId || row.sourceKey !== musicOpeningMakeupSourceKey(row.snapshot) || row.sourceSlotKey !== musicOpeningMakeupSourceSlotKey(row.snapshot) || row.contentHash !== musicOpeningMakeupContentHash(row.snapshot) || row.contentHash !== entry.contentHash) reject("MAKEUP_READBACK_MISMATCH");
  }
  if (musicOpeningMakeupHash(notificationsBefore) !== musicOpeningMakeupHash(await notificationCounts(tx, actor.storeId))) reject("NOTIFICATION_SIDE_EFFECT_ROLLBACK");
  assertMusicOpeningImportWindow();
  return { status: "IMPORTED" as const, created, skipped, updated: 0, conflicts: 0, cardIds, makeup, verifiedAt: new Date().toISOString() };
}

/** Authenticated internal entrypoint. No new permission, endpoint, scheduler or
 * credential. Import capability is not approval to import any real entitlement. */
export async function importVerifiedMusicOpening(raw: unknown, proof: MusicOpeningImportProof) {
  if (process.env.VERCEL !== "1") reject("MUSIC_PREVIEW_ONLY");
  assertMusicOpeningPreviewEnvironment(process.env);
  assertMusicOpeningImportWindow();
  const { courseManager } = await import("./course-access");
  const { user, storeId } = await courseManager("wallet.create");
  const actor = { storeId, userId: user.id, name: user.name ?? "", role: user.role };
  assertScope(actor);
  const makeupAccess = await courseManager("booking.update");
  if (makeupAccess.storeId !== storeId || makeupAccess.user.id !== user.id) reject("IMPORT_ACTOR_SCOPE_MISMATCH");
  const { coursePrisma } = await import("@/lib/course-db");
  // Never use courseTransaction: it kicks notifications after committing.
  return coursePrisma.$transaction(tx => importVerifiedMusicOpeningInTransaction(tx, actor, raw, proof), { isolationLevel: "Serializable", timeout: 30_000 });
}
