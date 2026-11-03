'use server';
import { ZodError } from 'zod';
import { AppError } from '@/lib/app-error';
import type { CourseAgreementPreview, CourseAgreementResult, CourseAgreementState } from '@/lib/course-agreement';
import { saveCourseAgreementDraft, publishCourseAgreement } from '@/server/services/course-agreement-settings';

function message(error: unknown) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? '請確認填寫內容';
  if (error instanceof AppError) return error.message;
  // Validation errors produced by the publish compiler contain no database details.
  if (error instanceof Error && (error.message.startsWith('請填寫') || error.message.startsWith('目前範本限'))) return error.message;
  console.error('[course-agreement-settings] operation failed');
  return '暫時無法確認儲存結果；請保留畫面，重試相同操作以查回結果。';
}
export async function saveCourseAgreementDraftAction(input: unknown): Promise<CourseAgreementResult<CourseAgreementPreview>> {
  try { return { success: true, data: await saveCourseAgreementDraft(input) }; }
  catch (error) { return { success: false, error: message(error) }; }
}
export async function publishCourseAgreementAction(input: unknown): Promise<CourseAgreementResult<CourseAgreementState>> {
  try { return { success: true, data: await publishCourseAgreement(input) }; }
  catch (error) { return { success: false, error: message(error) }; }
}
