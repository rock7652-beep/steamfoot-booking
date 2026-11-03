import 'server-only';
import { ZodError } from 'zod';
import { AppError } from '@/lib/app-error';
import type { CourseAgreementReceipt } from '@/lib/course-agreement-signing';
import { COURSE_AGREEMENT_PRIVATE_HEADERS } from '@/lib/course-agreement-public-path';
import { createCourseAgreementPdf } from './course-agreement-pdf';
export async function courseAgreementPdfResponse(load: () => Promise<CourseAgreementReceipt>) {
  try {
    const value = await load(); // Authorization and integrity verification precede all rendering.
    const bytes = await createCourseAgreementPdf(value);
    const fileId = value.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100) || 'signed';
    return new Response(new Uint8Array(bytes), { headers: { ...COURSE_AGREEMENT_PRIVATE_HEADERS,
      'Content-Type': 'application/pdf', 'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `attachment; filename="course-agreement-${fileId}.pdf"` } });
  } catch (error) {
    const status = error instanceof ZodError ? 400 : error instanceof AppError
      ? ({ UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, CONFLICT: 409, BUSINESS_RULE: 400 }[error.code]) : 500;
    return Response.json({ error: error instanceof AppError ? error.message : status === 400 ? '請確認下載資料' : '暫時無法產生 PDF，請稍後再試' }, { status, headers: COURSE_AGREEMENT_PRIVATE_HEADERS });
  }
}
