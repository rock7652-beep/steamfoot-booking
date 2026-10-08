import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { isHqStoreView } from "@/lib/hq-store-view";
import { trialApplicationDatabaseAllowed } from "@/server/services/trial-application-access";
import { consultationDatabaseAllowed } from "@/server/services/consultation-lead-access";
import { CONSULTATION_LEAD_STATUSES } from "@/lib/consultation-lead";
import { applicationStatuses } from "@/lib/trial-application";
import { TrialApplicationsList } from "./trial-application-list";
import { ConsultationLeadList } from "./consultation-list";
import { consultationHref, LEGACY_CONSULTATION_SHEET, parseConsultationSearch, type ConsultationSearchParams } from "./consultation-view";

export default async function Page({ searchParams }: { searchParams: Promise<ConsultationSearchParams> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || await isHqStoreView(user) || !(await checkPermission(user.role, user.staffId, "staff.manage"))) redirect("/hq/login");
  if (!trialApplicationDatabaseAllowed()) return <p>預覽收件尚未連接獨立資料庫。</p>;
  const search = parseConsultationSearch(await searchParams);
  const enabled = process.env.CONSULTATION_HQ_ENABLED === "true";
  const isConsultations = search.stage === "consultations";
  if (isConsultations && enabled && !consultationDatabaseAllowed()) return <p>諮詢測試資料庫尚未確認隔離，暫停讀取。</p>;
  const statuses = isConsultations ? CONSULTATION_LEAD_STATUSES : applicationStatuses;
  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-5 [overflow-wrap:anywhere]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="admin-page-title">諮詢與體驗申請</h1>
          <p className="mt-1 text-sm text-earth-600">需求諮詢與正式開通分階段處理，人工核對後才建立關聯。</p>
        </div>
        <Link href="/hq/dashboard/stores" className="flex min-h-11 items-center text-sm underline">返回店舖管理</Link>
      </header>
      <nav aria-label="申請階段" className="flex flex-wrap gap-2">
        {([['consultations', '需求諮詢'], ['applications', '體驗版開通資料']] as const).map(([stage, label]) => (
          <Link key={stage} href={consultationHref({ stage, q: search.q })} aria-current={search.stage === stage ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-medium ${search.stage === stage ? "border-primary-600 bg-primary-50 text-primary-800" : "bg-white text-earth-700"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        歷史 Sheet 資料尚未匯入 HQ。較早的諮詢請查閱 <a href={LEGACY_CONSULTATION_SHEET} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">原有需求諮詢 Sheet ↗</a>。
      </p>
      <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <input type="hidden" name="stage" value={search.stage} />
        <label className="min-w-0 flex-[1_1_16rem] text-sm">
          <span className="mb-1 block">搜尋目前階段</span>
          <input name="q" defaultValue={search.q} maxLength={200} placeholder={isConsultations ? "店家／聯絡人／電話／LINE ID／收件編號" : "店家／Email"}
            className="min-h-11 w-full min-w-0 rounded-lg border px-3 py-2" />
        </label>
        <label className="min-w-0 text-sm">
          <span className="mb-1 block">處理狀態</span>
          <select name="status" key={search.stage} defaultValue={search.status ?? ""} className="min-h-11 max-w-full rounded-lg border px-3 py-2">
            <option value="">全部狀態</option>
            {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 text-white">搜尋</button>
      </form>
      {isConsultations ? enabled ? <ConsultationLeadList {...search} /> : (
        <section className="rounded-xl border bg-white p-5" aria-label="需求諮詢尚未啟用">
          <h2 className="font-semibold">HQ 需求諮詢尚未啟用</h2>
          <p className="mt-2 text-sm text-earth-600">第一階段目前仍請查閱原有 Sheet；這不表示沒有收到諮詢。正式開通資料可由上方入口查看。</p>
        </section>
      ) : <TrialApplicationsList {...search} />}
    </div>
  );
}
