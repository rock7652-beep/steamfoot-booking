import 'server-only';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import type { Prisma } from '../../../generated/course-client';
import { z } from 'zod';
import { coursePrisma } from '@/lib/course-db';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/app-error';
import { courseAgreementDraftSchema } from '@/lib/course-agreement';
import { courseAgreementSignerSchema, courseAgreementSignSchema, signatureSvg } from '@/lib/course-agreement-signing';
import type { CourseAgreementCompletion, CourseAgreementPublicDocument, CourseAgreementReceipt, CourseAgreementReviewView } from '@/lib/course-agreement-signing';
import { isMusicCourseStoreFromEntitlements } from './course-business-profile';
import { lockCourseStore } from './course-store-lock';
import { courseAgreementReceiptToken } from './course-agreement-signing-token';

export const agreementTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const clausesSchema = z.array(z.object({ title: z.string(), body: z.string() })).min(1);
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const invalid = () => new AppError('NOT_FOUND', '此約定書連結已失效，請向店家取得最新連結');
export function assertPublicCourseAgreementsEnabled() {
  if (process.env.COURSE_AGREEMENTS_ENABLED !== '1' || process.env.COURSE_AGREEMENTS_PUBLIC_ENABLED !== '1') throw invalid();
}
async function versionForToken(token: string) {
  assertPublicCourseAgreementsEnabled();
  if (!agreementTokenSchema.safeParse(token).success) throw invalid();
  const version = await coursePrisma.courseAgreementVersion.findUnique({ where: { signingTokenHash: digest(token) } });
  if (!version) throw invalid();
  const store = await prisma.store.findUnique({ where: { id: version.storeId }, select: { industryModule: true, operatingStatus: true } });
  if (!store || store.industryModule !== 'COURSE' || !['ACTIVE', 'TRIAL'].includes(store.operatingStatus) || !await isMusicCourseStoreFromEntitlements(prisma, version.storeId)) throw invalid();
  return version;
}
function publicDocument(version: { settingsSnapshot: unknown; document: unknown; documentHash: string; version: number }): CourseAgreementPublicDocument {
  const document = clausesSchema.parse(version.document);
  if (digest(JSON.stringify(document)) !== version.documentHash) throw new AppError('CONFLICT', '約定書內容驗證失敗，請聯絡店家');
  return { brand: courseAgreementDraftSchema.parse(version.settingsSnapshot).brand, version: version.version, documentHash: version.documentHash, document };
}
export async function readPublicCourseAgreement(token: string): Promise<CourseAgreementPublicDocument> {
  const version = await versionForToken(token);
  const setting = await coursePrisma.courseAgreementSetting.findUnique({ where: { storeId: version.storeId }, select: { activeVersionId: true } });
  if (setting?.activeVersionId !== version.id) throw invalid();
  return publicDocument(version);
}
const reviewInclude = { signatures: { select: { id: true, storeId: true, requestKey: true, requestHash: true, receiptTokenHash: true } } } as const;
function completion(signature: { id: string; storeId: string; receiptTokenHash: string }): CourseAgreementCompletion {
  const token = courseAgreementReceiptToken(signature.storeId, signature.id);
  const stored = Buffer.from(signature.receiptTokenHash, 'hex'), computed = Buffer.from(digest(token), 'hex');
  if (stored.length !== computed.length || !timingSafeEqual(stored, computed)) throw new AppError('CONFLICT', '簽署憑證設定已變更，請聯絡店家取得副本');
  return { receiptPath: `/course-agreements/receipt/${token}` };
}

export async function beginPublicCourseAgreement(token: string, existingReviewToken?: string, fresh = false): Promise<{
  reviewToken: string; data: CourseAgreementReviewView | CourseAgreementCompletion;
}> {
  const version = await versionForToken(token), now = new Date();
  return coursePrisma.$transaction(async tx => {
    await lockCourseStore(tx, version.storeId);
    const setting = await tx.courseAgreementSetting.findUnique({ where: { storeId: version.storeId }, select: { activeVersionId: true } });
    if (setting?.activeVersionId !== version.id) throw invalid();
    if (!fresh && existingReviewToken && agreementTokenSchema.safeParse(existingReviewToken).success) {
      const review = await tx.courseAgreementReview.findUnique({ where: { tokenHash: digest(existingReviewToken) }, include: reviewInclude });
      if (review?.storeId === version.storeId && review.versionId === version.id && review.expiresAt > now) {
        if (review.signatures[0]) return { reviewToken: existingReviewToken, data: completion(review.signatures[0]) };
        if (!review.consumedAt) return { reviewToken: existingReviewToken, data: { ...publicDocument(version), deliveredAt: review.deliveredAt.toISOString(), expiresAt: review.expiresAt.toISOString() } };
      }
    }
    // Persistent, store-scoped issuance cap applies across server instances.
    const count = await tx.courseAgreementReview.count({ where: { storeId: version.storeId, deliveredAt: { gte: new Date(now.getTime() - 60_000) } } });
    if (count >= 100) throw new AppError('BUSINESS_RULE', '目前開啟人數較多，請稍後再試');
    const reviewToken = randomBytes(32).toString('base64url');
    const review = await tx.courseAgreementReview.create({ data: {
      storeId: version.storeId, versionId: version.id, tokenHash: digest(reviewToken), deliveredAt: now,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    } });
    return { reviewToken, data: { ...publicDocument(version), deliveredAt: review.deliveredAt.toISOString(), expiresAt: review.expiresAt.toISOString() } };
  });
}

export async function signPublicCourseAgreement(token: string, reviewToken: string, raw: unknown): Promise<CourseAgreementCompletion> {
  const input = courseAgreementSignSchema.parse(raw);
  if (!agreementTokenSchema.safeParse(reviewToken).success) throw new AppError('UNAUTHORIZED', '請先取得並閱讀約定書');
  const version = await versionForToken(token);
  const requestHash = digest(JSON.stringify(input));
  return coursePrisma.$transaction(async tx => {
    await lockCourseStore(tx, version.storeId);
    const review = await tx.courseAgreementReview.findUnique({ where: { tokenHash: digest(reviewToken) }, include: reviewInclude });
    if (!review || review.storeId !== version.storeId || review.versionId !== version.id) throw new AppError('UNAUTHORIZED', '請重新取得約定書後簽署');
    const previous = review.signatures[0];
    if (previous) {
      if (previous.requestKey !== input.requestKey || previous.requestHash !== requestHash) throw new AppError('CONFLICT', '本次已完成簽署；請重新開啟約定書查看結果，勿重送不同資料');
      return completion(previous);
    }
    const now = new Date();
    if (review.consumedAt || review.expiresAt <= now || review.deliveredAt > now) throw new AppError('CONFLICT', '本次閱讀連結已逾期，請重新取得約定書');
    const setting = await tx.courseAgreementSetting.findUnique({ where: { storeId: version.storeId }, select: { activeVersionId: true } });
    if (setting?.activeVersionId !== version.id) throw invalid();
    publicDocument(version); // Validate the stored immutable snapshot before signing.
    if (input.documentHash !== version.documentHash) throw new AppError('CONFLICT', '約定書版本不符，請重新閱讀');
    const signatureId = randomUUID(), receiptToken = courseAgreementReceiptToken(version.storeId, signatureId);
    const png = await sharp(Buffer.from(signatureSvg(input.strokes))).resize(1000, 300).png().toBuffer();
    if (png.byteLength > 131072) throw new AppError('VALIDATION', '簽名內容過大，請清除重簽');
    const objectKey = `${version.storeId}/agreements/${signatureId}.png`;
    const signature = await tx.courseAgreementSignature.create({ data: {
      id: signatureId, storeId: version.storeId, versionId: version.id, reviewId: review.id,
      // Self-entered name/phone are not proof of ownership of an existing Customer.
      customerId: null, signerSnapshot: input.signer as Prisma.InputJsonValue,
      signatureObjectKey: objectKey, signatureHash: digest(png),
      receiptTokenHash: digest(receiptToken), requestKey: input.requestKey, requestHash,
      reviewAcknowledgedAt: now, electronicConsentAt: now, signedAt: now,
    } });
    // Small evidence bytes and signature metadata commit or roll back together.
    await tx.courseAgreementSignatureAsset.create({ data: { objectKey, storeId: version.storeId, signatureId, content: new Uint8Array(png) } });
    const consumed = await tx.courseAgreementReview.updateMany({ where: { id: review.id, storeId: version.storeId, versionId: version.id, consumedAt: null }, data: { consumedAt: now } });
    if (consumed.count !== 1) throw new AppError('CONFLICT', '本次簽署已處理，請重試查回結果');
    return completion(signature);
  });
}

export async function readCourseAgreementReceipt(token: string): Promise<CourseAgreementReceipt> {
  assertPublicCourseAgreementsEnabled();
  if (!agreementTokenSchema.safeParse(token).success) throw invalid();
  const record = await coursePrisma.courseAgreementSignature.findUnique({ where: { receiptTokenHash: digest(token) }, include: { version: true, review: true, asset: true } });
  if (!record?.asset || record.asset.storeId !== record.storeId || record.asset.objectKey !== record.signatureObjectKey) throw invalid();
  const png = Buffer.from(record.asset.content);
  if (digest(png) !== record.signatureHash) throw new AppError('CONFLICT', '簽署副本驗證失敗，請聯絡店家');
  return { ...publicDocument(record.version), id: record.id, signer: courseAgreementSignerSchema.parse(record.signerSnapshot),
    deliveredAt: record.review.deliveredAt.toISOString(), signedAt: record.signedAt.toISOString(), signatureDataUrl: `data:image/png;base64,${png.toString('base64')}` };
}
