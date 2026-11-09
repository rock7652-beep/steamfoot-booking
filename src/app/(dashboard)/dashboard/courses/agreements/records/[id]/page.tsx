import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { checkPermission } from '@/lib/permissions';
import { AppError } from '@/lib/app-error';
import { PageShell } from '@/components/desktop';
import { DashboardLink } from '@/components/dashboard-link';
import { CourseAgreementReceiptView } from '@/components/course-agreements/receipt';
import { readStaffCourseAgreementReceipt } from '@/server/services/course-agreement-records';
import { courseAgreementRecordsFilterSchema, courseAgreementRecordsHref, courseAgreementRecordPdfHref } from '@/lib/course-agreement-records';
export const dynamic = 'force-dynamic';
export default async function CourseAgreementRecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || !await checkPermission(user.role,user.staffId,'customer.read') || !await checkPermission(user.role,user.staffId,'business_hours.view')) notFound();
  if (process.env.COURSE_AGREEMENTS_ENABLED !== '1') notFound();
  const [{ id }, raw] = await Promise.all([params,searchParams]);
  const parsed = courseAgreementRecordsFilterSchema.safeParse(Object.fromEntries(['storeId','q','from','to','page'].filter(key=>raw[key]!==undefined).map(key=>[key,raw[key]])));
  if (!parsed.success) notFound();
  const value = await readStaffCourseAgreementReceipt(id,parsed.data.storeId).catch(error=>{if(error instanceof AppError&&error.code==='NOT_FOUND')notFound();throw error;});
  const filters = {...parsed.data,storeId:value.storeId};
  return <PageShell className="mx-auto w-full min-w-0 max-w-[1440px] px-4 py-6 sm:px-6"><div className="print:hidden"><DashboardLink href={courseAgreementRecordsHref(filters)} scroll={false} className="inline-flex min-h-11 items-center rounded-lg border border-earth-300 px-4 text-sm text-primary-800">返回簽署紀錄</DashboardLink></div><CourseAgreementReceiptView value={value} pdfHref={await checkPermission(user.role,user.staffId,'customer.export')?courseAgreementRecordPdfHref(value.id,value.storeId):undefined} /></PageShell>;
}
