import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '../../../generated/course-client';
import { coursePrisma } from '@/lib/course-db';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/app-error';
import { buildCourseAgreement, courseAgreementDraftSchema, emptyCourseAgreement, emptyFitnessCourseAgreement, emptyBeautyAgreement, validateCourseAgreementForPublish } from '@/lib/course-agreement';
import type { CourseAgreementDraft, CourseAgreementPreview, CourseAgreementState } from '@/lib/course-agreement';
import { requireCourseAgreementAccess } from './course-agreement-access';
import { lockAgreementStore } from './agreement-store-lock';
import { courseAgreementSigningToken } from './course-agreement-signing-token';

const scopeSchema = z.object({ storeId: z.string().min(1).max(200), revision: z.number().int().nonnegative() });
const saveSchema = scopeSchema.extend({ draft: courseAgreementDraftSchema }).strict();
const publishSchema = scopeSchema.extend({ documentHash: z.string().regex(/^[a-f0-9]{64}$/), acknowledged: z.literal(true) }).strict();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function assertCourseAgreementsEnabled(module: 'COURSE' | 'BEAUTY' = 'COURSE') {
  if (module === 'BEAUTY') { if (process.env.BEAUTY_AGREEMENTS_ENABLED !== '1') throw new AppError('FORBIDDEN','美業服務約定尚未開放'); return; }
  if (process.env.COURSE_AGREEMENTS_ENABLED !== '1') throw new AppError('FORBIDDEN', '課程約定書尚未開放');
}
const includeActive = { activeVersion: { select: { id: true, version: true, documentHash: true } } } as const;

export async function readCourseAgreementSettings(expectedStoreId?: string, module: 'COURSE' | 'BEAUTY' = 'COURSE'): Promise<CourseAgreementState> {
  assertCourseAgreementsEnabled(module);
  const actor = await (module === 'BEAUTY' ? requireCourseAgreementAccess('manage', expectedStoreId, module) : requireCourseAgreementAccess('manage', expectedStoreId));
  const [setting, store, config, bookingRule] = await Promise.all([
    coursePrisma.courseAgreementSetting.findUnique({ where: { storeId: actor.storeId }, include: includeActive }),
    prisma.store.findUnique({ where: { id: actor.storeId }, select: { name: true } }),
    prisma.shopConfig.findUnique({ where: { storeId: actor.storeId }, select: { shopPhone: true, address: true } }),
    module === 'BEAUTY' ? import('@/lib/beauty-db').then(({beautyPrisma})=>beautyPrisma.beautySetting.findUnique({where:{storeId:actor.storeId},select:{cancelLeadMinutes:true}})).then(rule=>({cancellationLeadMinutes:rule?.cancelLeadMinutes??240})) : coursePrisma.courseBookingRule.findUnique({ where: { storeId: actor.storeId }, select: { cancellationLeadMinutes: true } }),
  ]);
  const draft = setting?.draft ? courseAgreementDraftSchema.parse(setting.draft) : (actor.agreementProfile === 'BEAUTY' ? emptyBeautyAgreement : actor.agreementProfile === 'FITNESS' ? emptyFitnessCourseAgreement : emptyCourseAgreement)(store?.name, config?.shopPhone ?? '', config?.address ?? '', bookingRule?.cancellationLeadMinutes ?? 0);
  assertProfile(draft, actor.agreementProfile);
  return { storeId: actor.storeId, revision: setting?.revision ?? 0, draft,
    active: setting?.activeVersion ?? null };
}

function assertProfile(draft: CourseAgreementDraft, profile?: 'MUSIC' | 'FITNESS' | 'BEAUTY') {
  if ((draft.profile ?? 'MUSIC') !== (profile ?? 'MUSIC')) throw new AppError('CONFLICT', '約定書範本與本店模組不符，請重新開啟設定');
}

function preview(storeId: string, revision: number, draft: CourseAgreementDraft, active: CourseAgreementState['active']): CourseAgreementPreview {
  const document = buildCourseAgreement(draft);
  return { storeId, revision, draft, active, document, documentHash: hash(document) };
}

export async function saveCourseAgreementDraft(raw: unknown, module: 'COURSE' | 'BEAUTY' = 'COURSE'): Promise<CourseAgreementPreview> {
  assertCourseAgreementsEnabled(module);
  const input = saveSchema.parse(raw);
  const actor = await (module === 'BEAUTY' ? requireCourseAgreementAccess('manage', input.storeId, module) : requireCourseAgreementAccess('manage', input.storeId));
  assertProfile(input.draft, actor.agreementProfile);
  return coursePrisma.$transaction(async tx => {
    await lockAgreementStore(tx, actor.storeId, actor.agreementProfile);
    const current = await tx.courseAgreementSetting.findUnique({ where: { storeId: actor.storeId }, include: includeActive });
    // Identical retries are safe, including a lost response after a successful save.
    if (current?.draft && hash(courseAgreementDraftSchema.parse(current.draft)) === hash(input.draft)) {
      return preview(actor.storeId, current.revision, input.draft, current.activeVersion);
    }
    if ((current?.revision ?? 0) !== input.revision) throw new AppError('CONFLICT', '其他操作已更新約定書；輸入已保留，請重新載入最新版本後核對');
    const next = await tx.courseAgreementSetting.upsert({ where: { storeId: actor.storeId },
      create: { storeId: actor.storeId, revision: 1, draft: input.draft as Prisma.InputJsonValue },
      update: { revision: { increment: 1 }, draft: input.draft as Prisma.InputJsonValue }, include: includeActive });
    return preview(actor.storeId, next.revision, input.draft, next.activeVersion);
  });
}

export async function publishCourseAgreement(raw: unknown, module: 'COURSE' | 'BEAUTY' = 'COURSE'): Promise<CourseAgreementState> {
  assertCourseAgreementsEnabled(module);
  const input = publishSchema.parse(raw);
  const actor = await (module === 'BEAUTY' ? requireCourseAgreementAccess('manage', input.storeId, module) : requireCourseAgreementAccess('manage', input.storeId));
  return coursePrisma.$transaction(async tx => {
    await lockAgreementStore(tx, actor.storeId, actor.agreementProfile);
    const current = await tx.courseAgreementSetting.findUnique({ where: { storeId: actor.storeId }, include: includeActive });
    if (!current?.draft) throw new AppError('VALIDATION', '請先保存並預覽約定書');
    const draft = courseAgreementDraftSchema.parse(current.draft);
    assertProfile(draft, actor.agreementProfile);
    validateCourseAgreementForPublish(draft);
    const document = buildCourseAgreement(draft);
    if (hash(document) !== input.documentHash) throw new AppError('CONFLICT', '草稿已變更，請重新預覽後啟用');
    // Repeated requests return the same publication rather than creating a new version.
    if (current.activeVersion?.documentHash === input.documentHash) {
      return { storeId: actor.storeId, revision: current.revision, draft, active: current.activeVersion };
    }
    if (current.revision !== input.revision) throw new AppError('CONFLICT', '其他操作已更新約定書，請重新預覽');
    const latest = await tx.courseAgreementVersion.aggregate({ where: { storeId: actor.storeId }, _max: { version: true } });
    const versionId = randomUUID();
    const signingToken = courseAgreementSigningToken(actor.storeId, versionId);
    const active = await tx.courseAgreementVersion.create({ data: {
      id: versionId, storeId: actor.storeId, version: (latest._max.version ?? 0) + 1,
      settingsSnapshot: draft as Prisma.InputJsonValue, document: document as unknown as Prisma.InputJsonValue,
      documentHash: input.documentHash,
      // Public sharing is a separate phase. Store only the hash; the dedicated key
      // allows the authorized sharing endpoint to recover this version's token.
      signingTokenHash: createHash('sha256').update(signingToken).digest('hex'), createdById: actor.user.id,
    }, select: { id: true, version: true, documentHash: true } });
    const next = await tx.courseAgreementSetting.update({ where: { storeId: actor.storeId }, data: { activeVersionId: active.id, revision: { increment: 1 } } });
    return { storeId: actor.storeId, revision: next.revision, draft, active };
  });
}

/** Optional feature: pausing new signatures never changes bookings or purchases. */
export async function pauseCourseAgreement(raw: unknown, module: 'COURSE' | 'BEAUTY' = 'COURSE'): Promise<CourseAgreementState> {
  assertCourseAgreementsEnabled(module);
  const input = scopeSchema.extend({ activeVersionId: z.string().min(1) }).strict().parse(raw);
  const actor = await (module === 'BEAUTY' ? requireCourseAgreementAccess('manage', input.storeId, module) : requireCourseAgreementAccess('manage', input.storeId));
  return coursePrisma.$transaction(async tx => {
    await lockAgreementStore(tx, actor.storeId, actor.agreementProfile);
    const current = await tx.courseAgreementSetting.findUnique({ where: { storeId: actor.storeId }, include: includeActive });
    if (!current?.draft) throw new AppError('VALIDATION', '尚無已保存的約定書');
    const draft = courseAgreementDraftSchema.parse(current.draft);
    if (!current.activeVersionId) return { storeId: actor.storeId, revision: current.revision, draft, active: null };
    if (current.revision !== input.revision || current.activeVersionId !== input.activeVersionId) throw new AppError('CONFLICT', '約定書已更新，請重新載入後核對');
    const next = await tx.courseAgreementSetting.update({ where: { storeId: actor.storeId }, data: { activeVersionId: null, revision: { increment: 1 } } });
    return { storeId: actor.storeId, revision: next.revision, draft, active: null };
  });
}
