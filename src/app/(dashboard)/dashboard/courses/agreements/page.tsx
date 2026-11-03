import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { checkPermission } from '@/lib/permissions';
import { readCourseAgreementSettings } from '@/server/services/course-agreement-settings';
import { saveCourseAgreementDraftAction, publishCourseAgreementAction, pauseCourseAgreementAction } from '@/server/actions/course-agreement-settings';
import { shareCourseAgreementAction } from '@/server/actions/course-agreement-sharing';
import { PageShell } from '@/components/desktop';
import { CourseAgreementWorkspace } from './agreement-workspace';

export default async function CourseAgreementsPage() {
  const user = await getCurrentUser();
  if (!user || !await checkPermission(user.role, user.staffId, 'business_hours.manage')) notFound();
  if (process.env.COURSE_AGREEMENTS_ENABLED !== '1') notFound();
  const initial = await readCourseAgreementSettings();
  return <PageShell className="mx-auto w-full min-w-0 max-w-[1440px] px-4 py-6 sm:px-6">
    <CourseAgreementWorkspace key={initial.storeId} initial={initial} recordsHref={await checkPermission(user.role,user.staffId,'customer.read') && await checkPermission(user.role,user.staffId,'business_hours.view') ? `/dashboard/courses/agreements/records?storeId=${encodeURIComponent(initial.storeId)}` : undefined} save={saveCourseAgreementDraftAction} publish={publishCourseAgreementAction} pause={pauseCourseAgreementAction} share={process.env.COURSE_AGREEMENTS_PUBLIC_ENABLED === '1' ? shareCourseAgreementAction : undefined} />
  </PageShell>;
}
