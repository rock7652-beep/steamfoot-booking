import { trialApplicationDatabaseAllowed } from "@/server/services/trial-application-access";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import {
  applicationStatuses,
  trialApplicationSchema,
  trialChecklist,
  trialSetupSummary,
} from "@/lib/trial-application";
import { updateApplication, retryApplicationNotification } from "./actions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    application?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (
    !user ||
    user.role !== "ADMIN" ||
    !(await checkPermission(user.role, user.staffId, "staff.manage"))
  )
    redirect("/hq/login");
  if (!trialApplicationDatabaseAllowed())
    return <p>預覽收件尚未連接獨立資料庫。</p>;
  const params = await searchParams;
  const q = (params.q ?? "").slice(0, 200);
  const status =
    params.status && params.status in applicationStatuses
      ? params.status
      : undefined;
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(params.page)) || 1),
  );
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
    `?${new URLSearchParams({ q, status: status ?? "", page: String(p), ...(params.application ? { application: params.application } : {}) })}`;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="admin-page-title">體驗版申請</h1>
          <p className="mt-1 text-sm text-earth-500">
            已提供資料不代表已取得權限；請人工確認後再設定。
          </p>
        </div>
        <Link href="/hq/dashboard/stores" className="text-sm underline">
          返回店舖管理
        </Link>
      </div>
      <form className="flex flex-wrap gap-3 rounded-xl border bg-white p-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="搜尋店家／Email"
          aria-label="搜尋店家或 Email"
          className="min-w-0 flex-1 rounded-lg border px-3 py-2"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          aria-label="申請狀態"
          className="rounded-lg border px-3 py-2"
        >
          <option value="">全部狀態</option>
          {Object.entries(applicationStatuses).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button className="rounded-lg bg-primary-600 px-4 py-2 text-white">
          搜尋
        </button>
      </form>
      <p className="text-sm">
        共 {total} 件 · 第 {page} 頁
      </p>
      {items.map((item) => {
        const parsed = trialApplicationSchema.safeParse(item.payload);
        return (
          <details
            key={item.id}
            open={params.application === item.id}
            className="rounded-xl border bg-white p-5"
          >
            <summary className="cursor-pointer">
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
                  className="rounded-lg border px-3 py-2"
                >
                  {Object.entries(applicationStatuses).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <button className="rounded-lg bg-primary-600 px-4 py-2 text-white">
                  更新進度
                </button>
              </form>
              <form
                action={retryApplicationNotification}
                className="flex items-center gap-3 text-sm"
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
                  <button className="rounded-lg border px-3 py-2">
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
    </div>
  );
}
