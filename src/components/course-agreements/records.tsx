'use client';
import { DashboardLink } from '@/components/dashboard-link';
import { InstantFilterForm } from '@/components/instant-filter-form';
import { DataTable, type Column } from '@/components/desktop/data-table';
import styles from '@/components/operations/filter-toolbar.module.css';
import { CourseAgreementDownload } from './download';
import { formatTWDateTime } from '@/lib/date-utils';
import { courseAgreementRecordHref, courseAgreementRecordPdfHref, courseAgreementRecordsHref } from '@/lib/course-agreement-records';
import type { CourseAgreementRecords, CourseAgreementRecordsFilter, CourseAgreementRecordRow } from '@/lib/course-agreement-records';
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-earth-300 px-3 py-2 text-sm text-primary-800 disabled:opacity-50';
const field = 'mt-1 min-h-11 min-w-0 rounded-lg border border-earth-300 bg-white px-3 py-2 text-base';
export function CourseAgreementRecordsWorkspace({ data, filters, canExport, error, module = 'COURSE' }: {
  module?: 'COURSE' | 'BEAUTY'; data: CourseAgreementRecords | null; filters: CourseAgreementRecordsFilter; canExport: boolean; error?: string;
}) {
  const current = data?.filters ?? filters;
  const columns: Column<CourseAgreementRecordRow>[] = [
    { key: 'name', header: module === 'BEAUTY' ? '顧客姓名' : '學員姓名', accessor: row => <div className="max-w-48 break-words py-3 font-medium">{row.name}{row.minor && <span className="mt-1 block text-sm font-normal text-earth-500">未成年</span>}</div> },
    { key: 'phone', header: '聯絡電話', accessor: row => <span className="tabular-nums">{row.phone}</span> },
    { key: 'service', header: '服務項目', accessor: row => row.service },
    { key: 'signedAt', header: '簽署日期（台灣）', accessor: row => <span className="whitespace-nowrap tabular-nums">{formatTWDateTime(new Date(row.signedAt))}</span> },
    { key: 'version', header: '版本', accessor: row => `v${row.version}.0` },
    { key: 'actions', header: '同意書', noLink: true, sticky: 'right', accessor: row => <div className="flex flex-wrap gap-2 py-2"><DashboardLink href={courseAgreementRecordHref(row.id, current, module)} scroll={false} className={button} aria-label={`查看 ${row.name} 的同意書`}>查看</DashboardLink>{canExport && <CourseAgreementDownload href={courseAgreementRecordPdfHref(row.id, data!.storeId, module)} ariaLabel={`下載 ${row.name} 的 PDF`} />}</div> },
  ];
  return <div className="min-w-0 space-y-4">
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-3"><div><h1 className="admin-page-title">簽署紀錄</h1><p className="mt-1 text-sm text-earth-600">查詢本店完整簽署紀錄，查看當時版本與簽名。</p></div><DashboardLink href={module === 'BEAUTY' ? '/dashboard/beauty?tab=設定&section=store' : '/dashboard/courses?view=settings&section=store'} className={button}>{module === 'BEAUTY' ? '返回美業設定' : '返回課程設定'}</DashboardLink></header>
    <div className={styles.container}><InstantFilterForm action={courseAgreementRecordsHref(current, 1, module)} className={styles.toolbar}>
      <label>姓名或電話（含代理人）<input className={field} type="search" maxLength={100} name="q" defaultValue={filters.q} /></label>
      <label>開始日期<input className={field} type="date" name="from" defaultValue={filters.from} /></label><label>結束日期<input className={field} type="date" name="to" defaultValue={filters.to} /></label>
      <div data-toolbar-actions className="flex flex-wrap gap-2"><DashboardLink href={courseAgreementRecordsHref({ ...current, q: '', from: '', to: '', page: 1 }, 1, module)} scroll={false} className={button}>清除條件</DashboardLink></div>
    </InstantFilterForm></div>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-base text-red-700">{error}</p> : data ? <>
      <p role="status" className="text-sm text-earth-600">共 {data.total} 筆 · 第 {data.page}／{data.pages} 頁</p>
      <p className="text-sm text-earth-500 lg:hidden">表格可左右滑動，查看完整日期與版本。</p>
      <DataTable columns={columns} rows={data.rows} rowKey={row => row.id} empty={<div className="space-y-2 px-4 py-8 text-center"><p className="text-base text-earth-700">{current.q || current.from || current.to ? '沒有符合條件的簽署紀錄' : '目前尚無簽署紀錄'}</p><p className="text-sm text-earth-500">{current.q || current.from || current.to ? '請調整或清除搜尋條件。' : module === 'BEAUTY' ? '顧客完成簽署後，紀錄會顯示在這裡。' : '學員完成簽署後，紀錄會顯示在這裡。'}</p></div>} />
      <nav aria-label="簽署紀錄分頁" className="flex flex-wrap items-center justify-between gap-3">{data.page > 1 ? <DashboardLink href={courseAgreementRecordsHref(current, data.page - 1, module)} scroll={false} className={button}>上一頁</DashboardLink> : <span />}{data.page < data.pages && <DashboardLink href={courseAgreementRecordsHref(current, data.page + 1, module)} scroll={false} className={button}>下一頁</DashboardLink>}</nav>
      <p className="text-sm text-earth-500">已簽文件保留當時條款；修改草稿或暫停新簽署不會覆蓋這些紀錄。</p>
    </> : null}
  </div>;
}
