import { notFound } from 'next/navigation';
import { AppError } from '@/lib/app-error';
import { readCourseAgreementReceipt } from '@/server/services/course-agreement-public';
import { CourseAgreementReceiptView } from '@/components/course-agreements/receipt';
export const dynamic = 'force-dynamic';
export const metadata = { title: '已簽署約定書副本', robots: { index: false, follow: false } };
export default async function CourseAgreementReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const value = await readCourseAgreementReceipt(token).catch(error => { if (error instanceof AppError && error.code === 'NOT_FOUND') notFound(); throw error; });
  return <CourseAgreementReceiptView value={value} />;
}
