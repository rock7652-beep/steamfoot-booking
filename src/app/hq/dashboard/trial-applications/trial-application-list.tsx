import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatTWTime } from "@/lib/date-utils";
import {
  applicationStatuses,
  setupSections,
  trialApplicationSchema,
  trialChecklist,
  type TrialApplicationData,
} from "@/lib/trial-application";
import { retryApplicationNotification } from "./actions";
import { TrialApplicationStatusForm } from "./formal-status-form";
import { IntakeList, IntakeListRow } from "./intake-list-row";
import { IntakeDetailFields, IntakeSecondaryDetails } from "./intake-detail-fields";
import { applicationNextStep, intakeTestMarker } from "./intake-summary";
import { consultationHref, suppliedPhoneHref, suppliedEmailHref, type ConsultationSearch } from "./consultation-view";

function setupDetailFields(data: TrialApplicationData): Record<string, unknown> {
  const checklist = new Map(trialChecklist(data).map(({ label, state }) => [label, state]));
  const withNote = (state: string | undefined, note: string) => note ? `${state} · ${note}` : state;
  const authorization = (value: TrialApplicationData["providerAdmin"]) => value && ({
    pending: "待處理", invited: "已邀請，待確認", help: "需要協助", absent: "尚未建立",
  }[value]);
  const line = [
    { existing: "已有", new: "尚未申請", help: "需要協助" }[data.lineStatus],
    data.lineId, checklist.get("官方 LINE ID／好友連結"),
  ];
  return {
    "官方 LINE": [...new Set(line.filter(value => value !== "" && value !== undefined))].join(" · "),
    "官方 LINE 管理員邀請": checklist.get("官方 LINE 管理員邀請"),
    既有串接: withNote(checklist.get("既有串接"), data.integrationName),
    品牌: data.brandName,
    其他門市: data.otherStores,
    希望網址: withNote(checklist.get("網址英文名稱"), data.slug),
    其他後台使用者: data.additionalManagers,
    "共用 LINE": withNote({ yes: "是", no: "否", unknown: "待確認" }[data.sharedLine], data.sharedLineStores),
    "LINE 管理聯絡人": data.lineManagerContact,
    "Provider 管理員授權": authorization(data.providerAdmin),
    "Messaging API 管理員授權": authorization(data.messagingAdmin),
    "LINE Login 管理員授權": authorization(data.loginAdmin),
    "Developers 授權（歷史填報）": authorization(data.developers),
    ...Object.fromEntries(setupSections.map(([progress, notes, label]) => {
      const state = checklist.get(label);
      // Keep both the check result and submitted notes, even for "none" or "help".
      const progressState = data[progress] === "provided" && state !== "已提供"
        ? `${state}（填報已提供）` : state;
      const note = data[notes] || (data[progress] === "provided" && data.attachments.length ? "見附件" : "");
      return [label, withNote(progressState, note)];
    })),
    現有學員匯入: checklist.get("現有學員匯入"),
  };
}

/** Called only after the page's HQ permission and database checks. */
export async function TrialApplicationsList({ q, status, page, application }: ConsultationSearch) {
  const params = { application };
  const where = {
    ...(status ? { status } : {}),
    ...(params.application ? { id: params.application } : {}),
    ...(q
      ? {
          OR: [
            { storeName: { contains: q, mode: "insensitive" as const } },
            { contactEmail: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.trialApplication.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    prisma.trialApplication.count({ where }),
  ]);
  const pageLink = (p: number) =>
    `?${new URLSearchParams({ stage: "applications", q, status: status ?? "", page: String(p), ...(params.application ? { application: params.application } : {}) })}`;
  return (
    <section aria-label="體驗版開通資料" className="space-y-3">
      <p className="text-sm text-earth-600">第二階段 · 已提交的開通資料；完成核對後才另外開通權限。</p>
      <p className="text-sm">
        共 {total} 件 · 第 {page} 頁
      </p>
      {items.length > 0 && <IntakeList>{items.map((item) => {
        const parsed = trialApplicationSchema.safeParse(item.payload);
        const phoneHref = parsed.success ? suppliedPhoneHref(parsed.data.phone) : null;
        const emailHref = parsed.success ? suppliedEmailHref(parsed.data.email) : null;
        const test = intakeTestMarker(item.storeName, parsed.success ? parsed.data.contactName : "");
        return (
          <IntakeListRow key={item.id} open={params.application === item.id}
            store={<>{item.storeName}{test && <span className="block text-amber-900">測試紀錄 · 請勿聯繫</span>}</>}
            contact={<>{parsed.success ? parsed.data.contactName || "尚未提供" : "資料格式待核對"}<span className="block text-earth-600">{item.contactEmail}</span></>}
            demand={<>{parsed.success ? parsed.data.industry || "類型待核對" : "資料格式待核對"}<span className="block text-earth-600">體驗版開通設定</span></>}
            status={<span className={item.status === "CLOSED" ? "text-earth-600" : "text-primary-800"}>{applicationStatuses[item.status as keyof typeof applicationStatuses] ?? item.status}</span>}
            next={<span className={test ? "text-amber-900" : "text-earth-700"}>{test ? "保留查核，請勿聯繫" : applicationNextStep(item.status)}</span>}
            submitted={formatTWTime(item.createdAt)}>
              {parsed.success ? (
                <div className="space-y-2">
                  <IntakeDetailFields fields={{ 電話: parsed.data.phone }} />
                  <div className="flex flex-wrap gap-2 text-sm">
                    {!test && phoneHref && <a href={phoneHref} className="flex min-h-11 items-center rounded-lg border px-3 py-2 text-primary-700">撥打原留電話</a>}
                    {!test && emailHref && <a href={emailHref} className="flex min-h-11 items-center rounded-lg border px-3 py-2 text-primary-700">寄信至原留 Email</a>}
                    {Object.entries({
                      地圖: parsed.data.mapsUrl,
                      加好友連結: parsed.data.friendUrl,
                      "接受官方 LINE 邀請": parsed.data.inviteUrl,
                    }).map(([label, url]) =>
                      url ? (
                        <a
                          key={label}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 max-w-full items-center rounded-lg border px-3 py-2 text-primary-700"
                        >
                          {label} ↗
                        </a>
                      ) : null,
                    )}
                  </div>
                </div>
              ) : (
                <p role="alert" className="text-sm text-amber-900">開通資料格式待核對，請先查核原始申請。</p>
              )}
              <TrialApplicationStatusForm id={item.id} name={item.storeName} status={item.status} />
              <form
                action={retryApplicationNotification}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <input type="hidden" name="id" value={item.id} />
                <span>
                  收件通知：
                  {{
                    SENT: "已寄送",
                    FAILED: "寄送失敗",
                    DISABLED: "尚未啟用／預覽停用",
                    SENDING: "寄送中",
                    PENDING: "待寄送",
                  }[item.notificationStatus] ?? item.notificationStatus}
                </span>
                {["FAILED", "DISABLED", "PENDING"].includes(
                  item.notificationStatus,
                ) && (
                  <button className="min-h-11 max-w-full rounded-lg border px-3 py-2">
                    重試通知
                  </button>
                )}
              </form>
              {parsed.success && <>
                <IntakeDetailFields fields={setupDetailFields(parsed.data)} />
                {parsed.data.attachments.length > 0 && <div className="flex flex-wrap gap-2">
                  {parsed.data.attachments.map((attachment, index) => (
                    <a
                      key={`${attachment.name}-${index}`}
                      href={`/api/trial-applications/${item.id}/attachments/${index}`}
                      className="inline-flex min-h-11 max-w-full items-center break-all rounded border px-3 py-2 text-sm text-primary-700"
                    >
                      下載 {attachment.name}
                    </a>
                  ))}
                </div>}
              </>}
              <IntakeSecondaryDetails>
                <IntakeDetailFields fields={{ 編號: item.id, 修訂: item.revision }} />
                {process.env.CONSULTATION_HQ_ENABLED === "true" && <Link
                  href={consultationHref({ stage: "consultations", application: item.id })}
                  className="inline-flex min-h-11 items-center text-sm underline">
                  查看人工關聯的需求諮詢
                </Link>}
              </IntakeSecondaryDetails>
          </IntakeListRow>
        );
      })}</IntakeList>}
      {!items.length && <div className="rounded-lg border bg-white px-4 py-6 text-sm">
        <p className="font-medium">{q || status || application || page > 1 ? "沒有符合條件的開通資料" : "尚無體驗版開通資料"}</p>
        <p className="mt-1 text-earth-600">需求諮詢請切換上方分頁；店家提交開通資料後才會出現在此處。</p>
        {(q || status || application || page > 1) && <Link className="inline-flex min-h-11 items-center text-primary-800 underline" href={consultationHref({ stage: "applications" })}>清除條件，返回全部開通資料</Link>}
      </div>}
      <div className="flex justify-between text-sm">
        {page > 1 ? <Link className="inline-flex min-h-11 items-center underline" href={pageLink(page - 1)}>上一頁</Link> : <span />}
        {page * 20 < total && <Link className="inline-flex min-h-11 items-center underline" href={pageLink(page + 1)}>下一頁</Link>}
      </div>
    </section>
  );
}
