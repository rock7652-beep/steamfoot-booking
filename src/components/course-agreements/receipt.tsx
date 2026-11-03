'use client';
import type { CourseAgreementReceipt } from '@/lib/course-agreement-signing';
import { formatTWDateTime } from '@/lib/date-utils';
import { CourseAgreementDownload } from './download';
import { CourseAgreementDocument } from './document';
export function CourseAgreementReceiptView({ value, pdfHref }: { value: CourseAgreementReceipt; pdfHref?: string }) {
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 print:max-w-none print:p-0">
    <div className="space-y-3 print:hidden"><p className="text-lg font-semibold text-primary-800">已簽署副本</p>{pdfHref && <CourseAgreementDownload href={pdfHref} label="下載已簽署 PDF" />}<button type="button" className="min-h-11 rounded-lg bg-primary-700 px-4 py-2 text-white" onClick={() => window.print()}>列印／另存 PDF</button><p className="text-sm text-earth-600">此副本包含個人資料，請自行保存，勿公開或轉傳連結。</p></div>
    <CourseAgreementDocument value={value} />
    <section className="space-y-3 break-inside-avoid border-t border-earth-200 pt-5"><h2 className="text-lg font-semibold">簽署紀錄</h2><p>學員：{value.signer.name} · {value.signer.phone}</p>{value.signer.minor && <p>法定代理人：{value.signer.guardian.name} · {value.signer.guardian.relation} · {value.signer.guardian.phone}</p>}<p>提供記錄：{formatTWDateTime(new Date(value.deliveredAt))}（台灣時間）</p><p>簽署時間：{formatTWDateTime(new Date(value.signedAt))}（台灣時間）</p><p>{value.signer.minor ? '法定代理人簽名' : '學員簽名'}：</p>
      {/* Private data URL must never pass through a shared image optimizer/cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={value.signatureDataUrl} alt={value.signer.minor ? '法定代理人簽名' : '學員簽名'} width={1000} height={300} className="h-auto w-full max-w-md" />
      <p className="break-all text-sm text-earth-600">文件識別碼：{value.id}</p><p className="break-all text-sm text-earth-600">內容 SHA-256：{value.documentHash}</p>
    </section>
  </main>;
}
