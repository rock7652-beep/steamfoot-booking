import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatTWTime } from "@/lib/date-utils";
import {
  applicationStatuses,
  trialApplicationSchema,
  trialChecklist,
  trialSetupSummary,
} from "@/lib/trial-application";
import { retryApplicationNotification } from "./actions";
import { TrialApplicationStatusForm } from "./formal-status-form";
import { IntakeList, IntakeListRow } from "./intake-list-row";
import { applicationNextStep, intakeTestMarker } from "./intake-summary";
import { consultationHref, suppliedPhoneHref, suppliedEmailHref, type ConsultationSearch } from "./consultation-view";

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
              <p className="text-sm">
                編號：{item.id} · 修訂 {item.revision}
              </p>
              {process.env.CONSULTATION_HQ_ENABLED === "true" && <Link
                href={consultationHref({ stage: "consultations", application: item.id })}
                className="inline-flex min-h-11 items-center text-sm underline">
                查看人工關聯的需求諮詢
              </Link>}
              {parsed.success && (
                <>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    {Object.entries({
                      店家類型: parsed.data.industry,
                      聯絡人: parsed.data.contactName,
                      電話: parsed.data.phone,
                      "官方 LINE ID": parsed.data.lineId,
                      "LINE 狀態":
                        parsed.data.lineStatus === "existing"
                          ? "已有"
                          : parsed.data.lineStatus === "new"
                            ? "尚未申請"
                            : "需要協助",
                      既有串接:
                        parsed.data.integration === "existing"
                          ? parsed.data.integrationName || "有，待確認"
                          : parsed.data.integration === "none"
                            ? "無"
                            : "不確定",
                    }).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-earth-500">{k}</dt>
                        <dd className="break-all">{v || "尚未提供"}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-wrap gap-3 text-sm">
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
                          className="rounded-lg border px-3 py-2 text-primary-700"
                        >
                          {label} ↗
                        </a>
                      ) : null,
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                    {trialSetupSummary(parsed.data)}
                  </pre>
                  <div className="flex flex-wrap gap-3">
                    {parsed.data.attachments.map((a, index) => (
                      <a
                        key={`${a.name}-${index}`}
                        href={`/api/trial-applications/${item.id}/attachments/${index}`}
                        className="rounded border px-3 py-2 text-sm text-primary-700"
                      >
                        下載 {a.name}
                      </a>
                    ))}
                  </div>
                  <ul className="space-y-2 text-sm">
                    {trialChecklist(parsed.data).map((i) => (
                      <li key={i.label}>
                        {i.label}：{i.state}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <TrialApplicationStatusForm id={item.id} name={item.storeName} status={item.status} />
              <form
                action={retryApplicationNotification}
                className="flex flex-wrap items-center gap-3 text-sm"
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
