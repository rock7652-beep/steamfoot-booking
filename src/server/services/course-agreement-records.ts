import 'server-only';
import { z } from 'zod';
import type { Prisma } from '../../../generated/course-client';
import { coursePrisma } from '@/lib/course-db';
import { AppError } from '@/lib/app-error';
import { dayRange } from '@/lib/date-utils';
import { courseAgreementSignerSchema } from '@/lib/course-agreement-signing';
import { courseAgreementRecordsFilterSchema } from '@/lib/course-agreement-records';
import type { CourseAgreementRecords } from '@/lib/course-agreement-records';
import { requireCourseAgreementAccess } from './course-agreement-access';
import { assertCourseAgreementsEnabled } from './course-agreement-settings';
import { agreementEvidenceInclude, verifiedAgreementReceipt } from './course-agreement-evidence';

export async function listCourseAgreementRecords(raw: unknown): Promise<CourseAgreementRecords> {
  assertCourseAgreementsEnabled();
  const parsed = courseAgreementRecordsFilterSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? '請確認搜尋條件');
  const input = parsed.data;
  const actor = await requireCourseAgreementAccess('read', input.storeId);
  const where: Prisma.CourseAgreementSignatureWhereInput = { storeId: actor.storeId };
  if (input.from || input.to) where.signedAt = { ...(input.from ? { gte: dayRange(input.from).start } : {}), ...(input.to ? { lte: dayRange(input.to).end } : {}) };
  if (input.q) {
    const phoneQuery = /^[\d\s()-]+$/.test(input.q) ? input.q.replace(/[\s()-]/g, '') || input.q : input.q;
    where.OR = [['name'], ['phone'], ['guardian', 'name'], ['guardian', 'phone']].map(path => ({ signerSnapshot: { path, string_contains: path.at(-1) === 'phone' ? phoneQuery : input.q, mode: 'insensitive' } }));
  }
  // Snapshot consistency for count and page; no read lock or booking notifications.
  return coursePrisma.$transaction(async tx => {
    const total = await tx.courseAgreementSignature.count({ where });
    const pageSize = 25, pages = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(input.page, pages);
    const rows = await tx.courseAgreementSignature.findMany({ where, orderBy: [{ signedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, signerSnapshot: true, signedAt: true, version: { select: { version: true } } } });
    return { storeId: actor.storeId, total, page, pages, pageSize, filters: { ...input, page, storeId: actor.storeId }, rows: rows.map(row => {
      const signer = courseAgreementSignerSchema.parse(row.signerSnapshot);
      return { id: row.id, name: signer.name, phone: signer.phone, minor: signer.minor, service: '課程', version: row.version.version, signedAt: row.signedAt.toISOString() };
    }) };
  }, { isolationLevel: 'RepeatableRead' });
}

export async function readStaffCourseAgreementReceipt(id: string, expectedStoreId?: string, operation: 'read' | 'export' = 'read') {
  assertCourseAgreementsEnabled();
  const recordId = z.string().min(1).max(200).parse(id);
  const actor = await requireCourseAgreementAccess(operation, expectedStoreId);
  const record = await coursePrisma.courseAgreementSignature.findFirst({ where: { id: recordId, storeId: actor.storeId }, include: agreementEvidenceInclude });
  if (!record || record.storeId !== actor.storeId) throw new AppError('NOT_FOUND', '找不到這份簽署紀錄');
  return { ...verifiedAgreementReceipt(record), storeId: actor.storeId };
}
