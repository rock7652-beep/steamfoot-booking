import 'server-only';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import type { Prisma } from '../../../generated/course-client';
import { z } from 'zod';
import { coursePrisma } from '@/lib/course-db';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/app-error';
import { courseAgreementSignSchema, signatureSvg } from '@/lib/course-agreement-signing';
import type { CourseAgreementCompletion, CourseAgreementPublicDocument, CourseAgreementReceipt, CourseAgreementReviewView } from '@/lib/course-agreement-signing';
import { readBeautyAgreementProfile, readCourseAgreementProfile } from './course-agreement-profile';
import { courseAgreementDraftSchema } from '@/lib/course-agreement';
import { lockAgreementStore } from './agreement-store-lock';
import { courseAgreementReceiptToken } from './course-agreement-signing-token';
import { agreementEvidenceInclude, verifiedAgreementDocument as publicDocument, verifiedAgreementReceipt } from './course-agreement-evidence';

export const agreementTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const invalid = () => new AppError('NOT_FOUND', '此約定書連結已失效，請向店家取得最新連結');
export function assertPublicCourseAgreementsEnabled(profile?: string) {
  const course = process.env.COURSE_AGREEMENTS_ENABLED === '1' && process.env.COURSE_AGREEMENTS_PUBLIC_ENABLED === '1';
  const beauty = process.env.BEAUTY_MODULE_ENABLED === '1' && process.env.BEAUTY_AGREEMENTS_ENABLED === '1' && process.env.BEAUTY_AGREEMENTS_PUBLIC_ENABLED === '1';
  if (profile === 'BEAUTY' ? !beauty : profile ? !course : !course && !beauty) throw invalid();
}
async function versionForToken(token: string) {
  assertPublicCourseAgreementsEnabled();
  if (!agreementTokenSchema.safeParse(token).success) throw invalid();
  const version = await coursePrisma.courseAgreementVersion.findUnique({ where: { signingTokenHash: digest(token) } });
  if (!version) throw invalid();
  const store = await prisma.store.findUnique({ where: { id: version.storeId }, select: { industryModule: true, operatingStatus: true } });
  const storedProfile = courseAgreementDraftSchema.parse(version.settingsSnapshot).profile ?? 'MUSIC';
  assertPublicCourseAgreementsEnabled(storedProfile);
  const profile = storedProfile === 'BEAUTY' ? await readBeautyAgreementProfile(version.storeId) : await readCourseAgreementProfile(version.storeId);
  if (!profile || (courseAgreementDraftSchema.parse(version.settingsSnapshot).profile ?? 'MUSIC') !== profile) throw invalid();
  if (!store || store.industryModule !== (storedProfile === 'BEAUTY' ? 'BEAUTY' : 'COURSE') || !['ACTIVE', 'TRIAL'].includes(store.operatingStatus)) throw invalid();
  return version;
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
    await lockAgreementStore(tx, version.storeId, courseAgreementDraftSchema.parse(version.settingsSnapshot).profile);
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
  const profile = courseAgreementDraftSchema.parse(version.settingsSnapshot).profile;
  const beauty = profile === 'BEAUTY', fitness = profile === 'FITNESS';
  if ((fitness || beauty) && input.riskAcknowledged !== true) throw new AppError('VALIDATION', beauty ? '請分別確認服務共同約定及服務風險告知' : '請分別確認課程共同約定及運動健康與風險告知');
  const requestHash = digest(JSON.stringify(input));
  return coursePrisma.$transaction(async tx => {
    await lockAgreementStore(tx, version.storeId, courseAgreementDraftSchema.parse(version.settingsSnapshot).profile);
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
      customerId: null, signerSnapshot: (fitness || beauty ? { ...input.signer, [beauty ? 'beautyAcknowledgement' : 'fitnessAcknowledgement']: { course: true, risk: true, courseAcknowledgedAt: now.toISOString(), riskAcknowledgedAt: now.toISOString(), documentHash: version.documentHash } } : input.signer) as Prisma.InputJsonValue,
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
  const record = await coursePrisma.courseAgreementSignature.findUnique({ where: { receiptTokenHash: digest(token) }, include: agreementEvidenceInclude });
  if (!record) throw invalid();
  const receipt = verifiedAgreementReceipt(record);
  assertPublicCourseAgreementsEnabled(receipt.profile ?? 'MUSIC');
  return receipt;
}
