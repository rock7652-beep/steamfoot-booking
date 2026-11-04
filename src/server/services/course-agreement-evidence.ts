import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '../../../generated/course-client';
import { AppError } from '@/lib/app-error';
import { courseAgreementDraftSchema } from '@/lib/course-agreement';
import { parseCourseAgreementSignerSnapshot } from '@/lib/course-agreement-signing';
import type { CourseAgreementPublicDocument, CourseAgreementReceipt } from '@/lib/course-agreement-signing';
const clausesSchema = z.array(z.object({ title: z.string(), body: z.string(), emphasis: z.array(z.string().min(1).max(160)).max(20).optional() })).min(1);
export function verifiedAgreementDocument(version: { settingsSnapshot: unknown; document: unknown; documentHash: string; version: number }): CourseAgreementPublicDocument {
  const document = clausesSchema.parse(version.document);
  const hash = createHash('sha256').update(JSON.stringify(document)).digest('hex');
  if (hash !== version.documentHash) throw new AppError('CONFLICT', '約定書內容驗證失敗，請聯絡店家');
  const draft = courseAgreementDraftSchema.parse(version.settingsSnapshot);
  return { ...(draft.profile === 'FITNESS' ? { profile: 'FITNESS' as const } : {}), brand: draft.brand, version: version.version, documentHash: version.documentHash, document };
}
export const agreementEvidenceInclude = { version: true, review: true, asset: true } as const;
type Evidence = Prisma.CourseAgreementSignatureGetPayload<{ include: typeof agreementEvidenceInclude }>;
/** One verification path for learner, staff and PDF copies. Never rebuild old clauses from current settings. */
export function verifiedAgreementReceipt(record: Evidence): CourseAgreementReceipt {
  if (!record.asset || record.asset.storeId !== record.storeId || record.asset.objectKey !== record.signatureObjectKey || record.asset.signatureId !== record.id || record.version.storeId !== record.storeId || record.version.id !== record.versionId || record.review.storeId !== record.storeId || record.review.versionId !== record.versionId) {
    throw new AppError('CONFLICT', '簽署副本關聯驗證失敗，請聯絡店家');
  }
  const png = Buffer.from(record.asset.content);
  if (createHash('sha256').update(png).digest('hex') !== record.signatureHash) throw new AppError('CONFLICT', '簽署副本驗證失敗，請聯絡店家');
  const document = verifiedAgreementDocument(record.version);
  const snapshot = parseCourseAgreementSignerSnapshot(record.signerSnapshot);
  const ack = snapshot.fitnessAcknowledgement;
  if (document.profile === 'FITNESS' ? !ack || ack.documentHash !== record.version.documentHash || ack.courseAcknowledgedAt !== record.reviewAcknowledgedAt.toISOString() || ack.riskAcknowledgedAt !== record.signedAt.toISOString() : !!ack) {
    throw new AppError('CONFLICT', '分項確認紀錄驗證失敗，請聯絡店家');
  }
  return { ...document, ...snapshot, id: record.id,
    deliveredAt: record.review.deliveredAt.toISOString(), signedAt: record.signedAt.toISOString(), signatureDataUrl: `data:image/png;base64,${png.toString('base64')}` };
}
