import { notFound } from 'next/navigation';
import { AppError } from '@/lib/app-error';
import { readPublicCourseAgreement } from '@/server/services/course-agreement-public';
import { beginCourseAgreementAction, signCourseAgreementAction } from '@/server/actions/course-agreement-public';
import { PublicCourseAgreementSigning } from '@/components/course-agreements/public-signing';
export const dynamic = 'force-dynamic';
export const metadata = { title: '課程服務約定書', robots: { index: false, follow: false } };
export default async function PublicCourseAgreementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const initial = await readPublicCourseAgreement(token).catch(error => { if (error instanceof AppError && error.code === 'NOT_FOUND') notFound(); throw error; });
  return <PublicCourseAgreementSigning key={token} initial={initial} begin={beginCourseAgreementAction.bind(null, token)} sign={signCourseAgreementAction.bind(null, token)} />;
}
