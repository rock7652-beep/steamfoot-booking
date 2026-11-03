import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { checkPermission } from '@/lib/permissions';
import { AppError } from '@/lib/app-error';
import { PageShell } from '@/components/desktop';
import { CourseAgreementRecordsWorkspace } from '@/components/course-agreements/records';
import { listCourseAgreementRecords } from '@/server/services/course-agreement-records';
import { courseAgreementRecordsFilterSchema } from '@/lib/course-agreement-records';
export const dynamic = 'force-dynamic';
export default async function CourseAgreementRecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || !await checkPermission(user.role, user.staffId, 'customer.read') || !await checkPermission(user.role, user.staffId, 'business_hours.view')) notFound();
  if (process.env.COURSE_AGREEMENTS_ENABLED !== '1') notFound();
  const raw = await searchParams;
  const input = Object.fromEntries(['storeId', 'q', 'from', 'to', 'page'].filter(key => raw[key] !== undefined).map(key => [key, raw[key]]));
  const {data,error} = await listCourseAgreementRecords(input).then(data => ({data,error:undefined as string|undefined})).catch(reason => {
    if (reason instanceof AppError && reason.code === 'VALIDATION') return {data:null,error:reason.message};
    throw reason;
  });
  const parsed = courseAgreementRecordsFilterSchema.safeParse(input);
  const filters = data?.filters ?? (parsed.success ? parsed.data : { storeId: typeof raw.storeId === 'string' ? raw.storeId : undefined, q: typeof raw.q === 'string' ? raw.q.slice(0,100) : '', from: typeof raw.from === 'string' ? raw.from : '', to: typeof raw.to === 'string' ? raw.to : '', page: 1 });
  return <PageShell className="mx-auto w-full min-w-0 max-w-[1440px] px-4 py-6 sm:px-6"><CourseAgreementRecordsWorkspace key={JSON.stringify([data?.storeId,filters])} data={data} filters={filters} error={error} canExport={await checkPermission(user.role,user.staffId,'customer.export')} /></PageShell>;
}
