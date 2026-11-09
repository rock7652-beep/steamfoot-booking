import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { checkPermission } from '@/lib/permissions';
import { readCourseAgreementSettings } from '@/server/services/course-agreement-settings';
import { saveBeautyAgreementAction, publishBeautyAgreementAction, pauseBeautyAgreementAction, shareBeautyAgreementAction } from '@/server/actions/beauty-agreement-settings';
import { PageShell } from '@/components/desktop';
import { CourseAgreementWorkspace } from '@/app/(dashboard)/dashboard/courses/agreements/agreement-workspace';

export default async function CourseAgreementsPage() {
  const user = await getCurrentUser();
  if (!user || !await checkPermission(user.role, user.staffId, 'business_hours.manage')) notFound();
  if (process.env.BEAUTY_AGREEMENTS_ENABLED !== '1') notFound();
  const initial = await readCourseAgreementSettings(undefined,'BEAUTY');
  return <PageShell className="mx-auto w-full min-w-0 max-w-[1440px] px-4 py-6 sm:px-6">
    <CourseAgreementWorkspace key={initial.storeId} initial={initial} recordsHref={await checkPermission(user.role,user.staffId,'customer.read') && await checkPermission(user.role,user.staffId,'business_hours.view') ? `/dashboard/beauty/agreements/records?storeId=${encodeURIComponent(initial.storeId)}` : undefined} save={saveBeautyAgreementAction} publish={publishBeautyAgreementAction} pause={pauseBeautyAgreementAction} share={process.env.BEAUTY_AGREEMENTS_PUBLIC_ENABLED === '1' ? shareBeautyAgreementAction : undefined} />
  </PageShell>;
}
