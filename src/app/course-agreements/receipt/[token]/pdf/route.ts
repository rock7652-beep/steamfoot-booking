import { readCourseAgreementReceipt } from '@/server/services/course-agreement-public';
import { courseAgreementPdfResponse } from '@/server/services/course-agreement-pdf-response';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  return courseAgreementPdfResponse(async () => readCourseAgreementReceipt((await params).token));
}
