import Link from "next/link";
import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import {
  applicationStatuses,
  trialApplicationSchema,
  trialChecklist,
  trialSetupSummary,
} from "@/lib/trial-application";
import { updateApplication, retryApplicationNotification } from "./actions";
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
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    prisma.trialApplication.count({ where }),
  ]);
  const pageLink = (p: number) =>
    `?${new URLSearchParams({ stage: "applications", q, status: status ?? "", page: String(p), ...(params.application ? { application: params.application } : {}) })}`;
  return (
    <section aria-label="體驗版開通資料" className="space-y-4">
      <p className="text-sm text-earth-600">第二階段：店家填寫正式開通資料後，才會出現在這裡。提供資料不代表已取得權限。</p>
      <p className="text-sm">
        共 {total} 件 · 第 {page} 頁
      </p>
      {items.map((item) => {
        const parsed = trialApplicationSchema.safeParse(item.payload);
        const phoneHref = parsed.success ? suppliedPhoneHref(parsed.data.phone) : null;
        const emailHref = parsed.success ? suppliedEmailHref(parsed.data.email) : null;
        return (
          <details
            key={item.id}
            open={params.application === item.id}
            className="min-w-0 rounded-xl border bg-white p-4 [overflow-wrap:anywhere] sm:p-5"
          >
            <summary className="min-h-11 cursor-pointer leading-7">
              <span className="font-semibold">{item.storeName}</span>
              <span className="ml-3 text-sm text-amber-800">
                {
                  applicationStatuses[
                    item.status as keyof typeof applicationStatuses
                  ]
                }
              </span>
              <span className="ml-3 text-sm text-earth-500">
                {toLocalDateStr(item.createdAt)} · {item.contactEmail}
              </span>
            </summary>
            <div className="mt-5 space-y-5">
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
                    {phoneHref && <a href={phoneHref} className="flex min-h-11 items-center rounded-lg border px-3 py-2 text-primary-700">撥打原留電話</a>}
                    {emailHref && <a href={emailHref} className="flex min-h-11 items-center rounded-lg border px-3 py-2 text-primary-700">寄信至原留 Email</a>}
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
              <form
                key={item.status}
                action={updateApplication}
                className="flex flex-wrap gap-3"
              >
                <input type="hidden" name="id" value={item.id} />
                <select
                  name="status"
                  aria-label={`${item.storeName}處理狀態`}
                  defaultValue={item.status}
                  className="min-h-11 max-w-full rounded-lg border px-3 py-2"
                >
                  {Object.entries(applicationStatuses).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <button className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 text-white">
                  更新進度
                </button>
              </form>
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
            </div>
          </details>
        );
      })}
      {!items.length && (
        <p className="rounded-xl border bg-white p-8 text-center text-earth-500">
          目前沒有符合的申請
        </p>
      )}
      <div className="flex justify-between text-sm">
        {page > 1 ? <Link href={pageLink(page - 1)}>上一頁</Link> : <span />}
        {page * 20 < total && <Link href={pageLink(page + 1)}>下一頁</Link>}
      </div>
    </section>
  );
}
