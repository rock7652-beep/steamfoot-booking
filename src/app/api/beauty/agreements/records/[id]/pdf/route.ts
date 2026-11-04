import { z } from 'zod';
import { readStaffCourseAgreementReceipt } from '@/server/services/course-agreement-records';
import { courseAgreementPdfResponse } from '@/server/services/course-agreement-pdf-response';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return courseAgreementPdfResponse(async () => {
    const { id } = await params;
    const storeId = z.string().min(1).max(200).parse(new URL(request.url).searchParams.get('storeId'));
    return readStaffCourseAgreementReceipt(id, storeId, 'export', 'BEAUTY');
  });
}
