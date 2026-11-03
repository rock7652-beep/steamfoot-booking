'use server';
import { createHash, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { AppError } from '@/lib/app-error';
import { deriveBaseUrl } from '@/lib/base-url';
import { coursePrisma } from '@/lib/course-db';
import type { CourseAgreementResult } from '@/lib/course-agreement';
import { requireCourseAgreementAccess } from '@/server/services/course-agreement-access';
import { assertPublicCourseAgreementsEnabled } from '@/server/services/course-agreement-public';
import { courseAgreementSigningToken } from '@/server/services/course-agreement-signing-token';
export async function shareCourseAgreementAction(storeId: string): Promise<CourseAgreementResult<{ url: string; qrDataUrl: string }>> {
  try {
    assertPublicCourseAgreementsEnabled();
    const actor = await requireCourseAgreementAccess('manage', z.string().min(1).max(200).parse(storeId));
    const setting = await coursePrisma.courseAgreementSetting.findUnique({ where: { storeId: actor.storeId }, include: { activeVersion: true } });
    const version = setting?.activeVersion;
    if (!version) throw new AppError('VALIDATION', '目前未啟用課程共同約定');
    const token = courseAgreementSigningToken(actor.storeId, version.id);
    const computed = createHash('sha256').update(token).digest(), stored = Buffer.from(version.signingTokenHash, 'hex');
    if (stored.length !== computed.length || !timingSafeEqual(stored, computed)) throw new AppError('CONFLICT', '簽署金鑰已變更，請聯絡系統管理者');
    const origin = new URL(deriveBaseUrl());
    if (origin.username || origin.password || origin.pathname !== '/' || (origin.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && origin.protocol === 'http:' && origin.hostname === 'localhost'))) throw new AppError('VALIDATION', '簽署網址設定尚未完成');
    const url = new URL(`/course-agreements/${token}`, origin).href;
    return { success: true, data: { url, qrDataUrl: await QRCode.toDataURL(url, { width: 320, margin: 2 }) } };
  } catch (error) {
    return { success: false, error: error instanceof AppError ? error.message : '暫時無法產生簽署連結，請稍後再試' };
  }
}
