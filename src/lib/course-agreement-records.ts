import { z } from 'zod';
import { parseTaipeiDateTime } from './date-utils';
const date = z.string().refine(value => !value || !!parseTaipeiDateTime(value, '00:00'), '請填寫有效日期');
export const courseAgreementRecordsFilterSchema = z.object({
  storeId: z.string().min(1).max(200).optional(),
  q: z.string().trim().max(100, '搜尋最多 100 字').default(''),
  from: date.default(''), to: date.default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, '開始日期不得晚於結束日期');
export type CourseAgreementRecordsFilter = z.infer<typeof courseAgreementRecordsFilterSchema>;
export type CourseAgreementRecordRow = { id: string; name: string; phone: string; minor: boolean; service: string; version: number; signedAt: string };
export type CourseAgreementRecords = { storeId: string; rows: CourseAgreementRecordRow[]; total: number; page: number; pages: number; pageSize: number; filters: CourseAgreementRecordsFilter };
export function courseAgreementRecordsHref(filters: CourseAgreementRecordsFilter, page = filters.page) {
  const query = new URLSearchParams();
  if (filters.storeId) query.set('storeId', filters.storeId);
  for (const key of ['q', 'from', 'to'] as const) if (filters[key]) query.set(key, filters[key]);
  if (page !== 1) query.set('page', String(page));
  return '/dashboard/courses/agreements/records' + (query.size ? '?' + query.toString() : '');
}
export function courseAgreementRecordHref(id: string, filters: CourseAgreementRecordsFilter) {
  const query = courseAgreementRecordsHref(filters).split('?')[1];
  return '/dashboard/courses/agreements/records/' + encodeURIComponent(id) + (query ? '?' + query : '');
}
export function courseAgreementRecordPdfHref(id: string, storeId: string) {
  return `/api/course-agreements/records/${encodeURIComponent(id)}/pdf?storeId=${encodeURIComponent(storeId)}`;
}
