'use server';
import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import { ZodError } from 'zod';
import { AppError } from '@/lib/app-error';
import type { CourseAgreementResult } from '@/lib/course-agreement';
import type { CourseAgreementCompletion, CourseAgreementReviewView } from '@/lib/course-agreement-signing';
import { agreementTokenSchema, beginPublicCourseAgreement, signPublicCourseAgreement } from '@/server/services/course-agreement-public';
const cookieName = (token: string) => `ca-review-${createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
function message(error: unknown) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? '請確認填寫內容';
  if (error instanceof AppError) return error.message;
  console.error('[course-agreement-public] operation failed');
  return '暫時無法確認結果，資料已保留；請重試相同操作。';
}
// Deliberately public: opaque published-version capability + HttpOnly review
// capability replace staff authorization. These actions never access Customer.
export async function beginCourseAgreementAction(token: string, fresh = false): Promise<CourseAgreementResult<CourseAgreementReviewView | CourseAgreementCompletion>> {
  try {
    agreementTokenSchema.parse(token);
    if (typeof fresh !== 'boolean') throw new AppError('VALIDATION', '請重新開啟約定書');
    const jar = await cookies();
    const result = await beginPublicCourseAgreement(token, jar.get(cookieName(token))?.value, fresh);
    jar.set(cookieName(token), result.reviewToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: `/course-agreements/${token}`, maxAge: 7 * 24 * 60 * 60 });
    return { success: true, data: result.data };
  } catch (error) { return { success: false, error: message(error) }; }
}
export async function signCourseAgreementAction(token: string, input: unknown): Promise<CourseAgreementResult<CourseAgreementCompletion> & { retrySame?: boolean }> {
  try {
    agreementTokenSchema.parse(token);
    const jar = await cookies();
    return { success: true, data: await signPublicCourseAgreement(token, jar.get(cookieName(token))?.value ?? '', input) };
  } catch (error) { return { success: false, error: message(error), retrySame: !(error instanceof AppError || error instanceof ZodError) }; }
}
