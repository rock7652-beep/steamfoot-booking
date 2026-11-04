import { CourseAgreementBody } from './body';
import { courseAgreementTitle } from '@/lib/course-agreement';
import type { CourseAgreementPublicDocument } from '@/lib/course-agreement-signing';
export function CourseAgreementDocument({ value }: { value: CourseAgreementPublicDocument }) {
  return <article className="min-w-0 space-y-6 break-words">
    <header><h1 className="text-2xl font-semibold text-primary-900">{value.brand}｜{courseAgreementTitle(value.profile)}</h1><p className="mt-2 text-sm text-earth-600">版本 v{value.version}.0</p></header>
    {value.document.map((clause, index) => <section key={index} className="break-inside-avoid"><h2 className="mb-2 text-lg font-semibold text-primary-900">{index + 1}．{clause.title}</h2><CourseAgreementBody clause={clause} /></section>)}
  </article>;
}
