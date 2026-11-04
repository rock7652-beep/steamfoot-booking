import type { CourseAgreementClause } from '@/lib/course-agreement';
import { courseAgreementTextRuns } from '@/lib/course-agreement-emphasis';
export function CourseAgreementBody({ clause }: { clause: CourseAgreementClause }) {
  return <p className="whitespace-pre-wrap text-base leading-7 text-earth-800">{courseAgreementTextRuns(clause).map((run, index) => run.emphasized
    ? <strong key={index} className="font-semibold underline decoration-1 underline-offset-4">{run.text}</strong>
    : run.text)}</p>;
}
