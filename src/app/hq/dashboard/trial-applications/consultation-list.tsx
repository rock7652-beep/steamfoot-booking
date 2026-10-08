import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatTWTime } from "@/lib/date-utils";
import { CONSULTATION_LEAD_STATUSES, isConsultationNoContact } from "@/lib/consultation-lead";
import { ConsultationLinkForm, ConsultationNoteForm, ConsultationStatusForm, CopyLineId } from "./consultation-forms";
import { CONSULTATION_PAGE_SIZE, consultationHref, fieldText, originalFields, sheetStatusLabels, suppliedLineHref, suppliedPhoneHref, suppliedWebHref, type ConsultationSearch } from "./consultation-view";

/** Called only after the page's HQ authorization, preview and rollout checks. */
export async function ConsultationLeadList(search: ConsultationSearch) {
  const { q, status, page, lead, activityPage } = search;
  const where = {
    ...(status ? { status } : {}),
    ...(lead ? { id: lead } : {}),
    ...(search.application ? { trialApplicationId: search.application } : {}),
    ...(q ? { OR: ["storeName", "contactName", "phone", "lineId", "requestId"].map(field => ({ [field]: { contains: q, mode: "insensitive" as const } })) } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.consultationLead.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * CONSULTATION_PAGE_SIZE, take: CONSULTATION_PAGE_SIZE,
      include: {
        activities: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: lead ? 20 : 5, skip: lead ? (activityPage - 1) * 20 : 0 },
        _count: { select: { activities: true } },
        trialApplication: { select: { id: true, storeName: true, status: true } },
      },
    }),
    prisma.consultationLead.count({ where }),
  ]);
  return <section aria-label="需求諮詢" className="space-y-4">
    <p className="text-sm text-earth-600">第一階段：保留原始需求與聯絡偏好。HQ 收件與 Sheet 收件分別顯示，不代表已填正式開通資料。</p>
    <p className="text-sm">共 {total} 件 · 第 {page} 頁{(lead || search.application) && <> · <Link href={consultationHref({ stage: "consultations", q })} className="underline">返回諮詢清單</Link></>}</p>
    {items.map(item => {
      const original = originalFields(item.originalPayload);
      const noContact = isConsultationNoContact(original);
      const phoneHref = noContact ? null : suppliedPhoneHref(item.phone);
      const lineHref = noContact ? null : suppliedLineHref(item.lineId);
      const statusLabel = CONSULTATION_LEAD_STATUSES[item.status as keyof typeof CONSULTATION_LEAD_STATUSES] ?? item.status;
      return <details key={item.id} open={lead === item.id || undefined} className="min-w-0 rounded-xl border bg-white p-4 [overflow-wrap:anywhere] sm:p-5">
        <summary className="min-h-11 cursor-pointer leading-7">
          <span className="font-semibold">{item.storeName}</span>
          <span className="ml-3 text-sm text-amber-900">{statusLabel}</span>
          <span className="ml-3 text-sm text-earth-600">{formatTWTime(item.createdAt)} · {item.industry}</span>
          <span className="ml-3 text-sm text-primary-800">HQ 已收件</span>
          <span className="ml-3 text-sm text-earth-600">{sheetStatusLabels[item.sheetStatus] ?? "Sheet 狀態待查核"}</span>
          {noContact && <span className="ml-3 text-sm font-medium text-red-800">暫不考慮，請勿主動聯繫</span>}
        </summary>
        <div className="mt-4 space-y-5">
          <p className="text-sm text-earth-600">諮詢編號：{item.id} · 修訂 {item.revision}<br />原始收件編號：{item.requestId}</p>
          {noContact && <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">店家選擇「目前暫不考慮」。本筆不提供聯絡捷徑，請勿主動聯繫。</p>}
          <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            {Object.entries({
              店家類型: original.industry,
              聯絡人: noContact ? "未提供（暫不考慮）" : original.contactName,
              聯絡偏好: original.contactWay,
              可聯絡時間: noContact ? "不適用" : original.time,
              電話: noContact ? "未提供（暫不考慮）" : original.phone,
              預約方式: original.bookingMode,
              授課型態: original.courseFormat,
              店舖數: original.storeCount,
              人員數: original.staffCount,
              會員數: original.members,
              原有系統: original.hasSystem,
              系統名稱: original.systemName,
            }).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-earth-600">{label}</dt><dd className="whitespace-pre-wrap break-words">{fieldText(value)}</dd></div>)}
          </dl>
          {!noContact && <div className="flex flex-wrap items-center gap-3 text-sm" aria-label="原始聯絡方式">
            {phoneHref && <a href={phoneHref} className="flex min-h-11 items-center rounded-lg border px-3 py-2 text-primary-800">撥打原留電話</a>}
            {lineHref ? <a href={lineHref} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center rounded-lg border px-3 py-2 text-primary-800">開啟原留 LINE 連結 ↗</a> : item.lineId ? <CopyLineId value={item.lineId} /> : <span>尚未提供 LINE ID</span>}
          </div>}
          <section className="space-y-2 border-t pt-4" aria-label="原始需求">
            <h3 className="font-semibold">原始需求</h3>
            <dl className="space-y-3 text-sm">
              {Object.entries({ 需求: original.needs, 最優先需求: original.priorityNeed, 更換原因: original.replaceReason, 其他需求: original.otherNeed }).map(([label, value]) =>
                <div key={label}><dt className="text-earth-600">{label}</dt><dd className="whitespace-pre-wrap break-words">{fieldText(value)}</dd></div>)}
            </dl>
            <div className="flex flex-wrap gap-3 text-sm">
              {Object.entries({ 官網: item.websiteUrl, Facebook: item.facebookUrl, Instagram: item.instagramUrl }).map(([label, value]) => {
                const href = suppliedWebHref(value);
                return value ? href ? <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center rounded-lg border px-3 py-2 text-primary-800">{label} ↗</a>
                  : <p key={label}>{label}：{value}（連結格式需查核）</p> : null;
              })}
            </div>
          </section>
          <p className="text-sm text-earth-600">HQ 收件：{formatTWTime(item.createdAt)}<br />Sheet：{sheetStatusLabels[item.sheetStatus] ?? "狀態待查核"}{item.sheetConfirmedAt ? ` · ${formatTWTime(item.sheetConfirmedAt)}` : ""}</p>
          <section className="space-y-3 border-t pt-4" aria-label="處理進度"><ConsultationStatusForm id={item.id} revision={item.revision} status={item.status} /></section>
          <section className="space-y-3 border-t pt-4" aria-label="聯繫紀錄">
            <h3 className="font-semibold">聯繫與處理紀錄</h3>
            {item.activities.length ? <ol className="space-y-3">{item.activities.map(activity => <li key={activity.id} className="rounded-lg bg-earth-50 p-3 text-sm">
              <p className="text-earth-600">{formatTWTime(activity.createdAt)} · 操作人 {activity.actorId} · {{ NOTE: "聯繫紀錄", STATUS: "狀態變更", LINK: "人工關聯" }[activity.type] ?? activity.type}</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{activity.note}</p>
            </li>)}</ol> : <p className="text-sm text-earth-600">尚無處理紀錄</p>}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>共 {item._count.activities} 筆紀錄</span>
              {!lead && item._count.activities > 5 && <Link className="min-h-11 content-center underline" href={consultationHref({ stage: "consultations", lead: item.id })}>查看全部紀錄</Link>}
              {lead && activityPage > 1 && <Link className="min-h-11 content-center underline" href={consultationHref({ ...search, activityPage: activityPage - 1 })}>較新紀錄</Link>}
              {lead && activityPage * 20 < item._count.activities && <Link className="min-h-11 content-center underline" href={consultationHref({ ...search, activityPage: activityPage + 1 })}>較早紀錄</Link>}
            </div>
            <details><summary className="min-h-11 cursor-pointer content-center text-sm text-primary-800">新增聯繫紀錄</summary><ConsultationNoteForm id={item.id} revision={item.revision} /></details>
          </section>
          <section className="space-y-3 border-t pt-4" aria-label="體驗版開通關聯">
            <h3 className="font-semibold">體驗版開通資料</h3>
            {item.trialApplication ? <div className="text-sm"><Link className="inline-flex min-h-11 items-center underline" href={consultationHref({ stage: "applications", application: item.trialApplication.id })}>查看已關聯資料：{item.trialApplication.storeName}</Link><p className="break-all">完整編號：{item.trialApplication.id}</p><p className="text-earth-600">{item.trialLinkedAt ? formatTWTime(item.trialLinkedAt) : ""} · 人工核對：{item.trialLinkedBy}</p></div> : <p className="text-sm text-earth-600">尚未人工關聯；這不代表店家尚未提交開通資料。</p>}
            <details><summary className="min-h-11 cursor-pointer content-center text-sm text-primary-800">{item.trialApplicationId ? "更改人工關聯" : "人工核對並關聯"}</summary><ConsultationLinkForm id={item.id} revision={item.revision} applicationId={item.trialApplicationId} /></details>
          </section>
        </div>
      </details>;
    })}
    {!items.length && <p className="rounded-xl border bg-white p-8 text-center text-earth-600">目前沒有符合的 HQ 諮詢。歷史資料請查閱上方原有 Sheet。</p>}
    <nav aria-label="需求諮詢分頁" className="flex justify-between text-sm">
      {page > 1 ? <Link className="flex min-h-11 items-center underline" href={consultationHref({ ...search, page: page - 1 })}>上一頁</Link> : <span />}
      {page * CONSULTATION_PAGE_SIZE < total && <Link className="flex min-h-11 items-center underline" href={consultationHref({ ...search, page: page + 1 })}>下一頁</Link>}
    </nav>
  </section>;
}
