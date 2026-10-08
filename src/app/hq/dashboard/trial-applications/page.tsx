import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { isHqStoreView } from "@/lib/hq-store-view";
import { trialApplicationDatabaseAllowed } from "@/server/services/trial-application-access";
import { consultationDatabaseAllowed } from "@/server/services/consultation-lead-access";
import { TrialApplicationsList } from "./trial-application-list";
import { ConsultationLeadList } from "./consultation-list";
import { ConsultationFilters } from "./consultation-filters";
import { LEGACY_CONSULTATION_SHEET, parseConsultationSearch, type ConsultationSearchParams } from "./consultation-view";

export default async function Page({ searchParams }: { searchParams: Promise<ConsultationSearchParams> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || await isHqStoreView(user) || !(await checkPermission(user.role, user.staffId, "staff.manage"))) redirect("/hq/login");
  if (!trialApplicationDatabaseAllowed()) return <p>預覽收件尚未連接獨立資料庫。</p>;
  const search = parseConsultationSearch(await searchParams);
  const enabled = process.env.CONSULTATION_HQ_ENABLED === "true";
  const isConsultations = search.stage === "consultations";
  if (isConsultations && enabled && !consultationDatabaseAllowed()) return <p>諮詢測試資料庫尚未確認隔離，暫停讀取。</p>;
  return (
    <div className="w-full min-w-0 space-y-3 [overflow-wrap:anywhere]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="admin-page-title">諮詢與體驗申請</h1>
          <p className="mt-1 text-sm text-earth-600">先看需求，再核對開通資料。兩階段需人工關聯。</p>
        </div>
        <Link href="/hq/dashboard/stores" className="flex min-h-11 items-center text-sm underline">返回店舖管理</Link>
      </header>
      <ConsultationFilters search={search} />
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-earth-600">
        <span>歷史 Sheet 資料尚未匯入 HQ。</span>
        <a href={LEGACY_CONSULTATION_SHEET} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary-800 underline">查看原有需求諮詢 Sheet ↗</a>
      </p>
      {isConsultations ? enabled ? <ConsultationLeadList {...search} /> : (
        <section className="rounded-xl border bg-white p-5" aria-label="需求諮詢尚未啟用">
          <h2 className="font-semibold">HQ 需求諮詢尚未啟用</h2>
          <p className="mt-2 text-sm text-earth-600">第一階段目前仍請查閱原有 Sheet；這不表示沒有收到諮詢。正式開通資料可由上方入口查看。</p>
        </section>
      ) : <TrialApplicationsList {...search} />}
    </div>
  );
}
