import { checkPermission } from "@/lib/permissions";
import { toLocalDateStr } from "@/lib/date-utils";
import { getStoreForPlanByStoreId } from "@/lib/store-plan";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getTrialRetention, trialRetentionMessage } from "@/lib/trial-retention";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getCurrentUser } from "@/lib/session";
import {
  getStoreDeliverySummary,
  updateStoreOperatingStatusAction,
} from "@/server/actions/store-onboarding";
import {
  STORE_OPERATING_STATUS_LABELS,
  type StoreOperatingStatus,
} from "@/lib/store-operating-status";
import { ActivateTrialButton } from "./activate-trial-button";
import { SpaProvisionButton } from "./spa-provision-button";

interface PageProps {
  params: Promise<{ storeId: string }>;
}

export default async function StoreDetailPage({ params }: PageProps) {
  const { storeId } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || !(await checkPermission(user.role, user.staffId, "staff.manage"))) redirect("/hq/login");

  const result = await getStoreDeliverySummary(storeId);
  if (!result.success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-red-600">{result.error}</p>
        <Link href="/hq/dashboard/stores" className="mt-4 inline-block text-sm text-primary-600 hover:underline">
          ← 返回列表
        </Link>
      </div>
    );
  }

  const summary = result.data;
  const coursePlan = !summary.store.isDemo && await getStoreIndustryModule(storeId) === "course"
    ? await getStoreForPlanByStoreId(storeId) : null;
  const retention = coursePlan ? getTrialRetention(coursePlan) : null;
  const trialStarted = Boolean(coursePlan?.planEffectiveAt && coursePlan?.planExpiresAt);
  const canShowActivate = !summary.store.currentSubscriptionId && !summary.store.isDemo && summary.store.planStatus !== "ACTIVE" && summary.canActivate;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {retention && <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{trialRetentionMessage(retention)}{retention.state === "PENDING_CLEANUP" && " 尚未自動刪除；清理前須重新確認未升級及資料範圍。"}</p>}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-earth-900">{summary.store.name}</h1>
          <p className="mt-1 text-sm text-earth-500">
            <span className="font-mono">{summary.store.slug}</span> · {summary.store.plan} ·{" "}
            <span>{summary.store.industryModule === "COURSE" ? "運動課程" : summary.store.industryModule === "SPA" ? "SPA／美容美體" : "蒸足"}</span>
            {" · "}
            <span className={summary.store.planStatus === "ACTIVE" ? "text-green-600" : "text-amber-600"}>
              {summary.store.planStatus}
            </span>
            {" · "}
            <span>{STORE_OPERATING_STATUS_LABELS[summary.store.operatingStatus]}</span>
            {summary.store.isDemo && <span className="ml-2 text-amber-600">(Demo)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/hq/dashboard/stores/${storeId}/features`}
            className="rounded-lg border border-earth-200 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
          >
            功能設定
          </Link>
          <Link href={`/hq/dashboard/stores/subscriptions/${storeId}`} className="text-sm text-primary-700 underline">訂閱管理</Link>
          {canShowActivate && (
            <ActivateTrialButton storeId={storeId} course={summary.store.industryModule === "COURSE"} />
          )}
        </div>
      </div>

      {coursePlan && (
        <div role="status" className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">{trialStarted ? "30 天體驗已起算" : "課程體驗店已建置，30 天尚未起算"}</p>
          <p className="mt-1">{trialStarted
            ? `試用期間：${toLocalDateStr(coursePlan.planEffectiveAt!)} 至 ${toLocalDateStr(coursePlan.planExpiresAt!)}。功能授權與外部服務設定請分別驗收。`
            : "單店功能權限已開放供驗收；完成 LIFF、店長及會員流程與通知測試後，再啟動 30 天倒數。"}</p>
          {summary.thirdParty.line !== "configured" && <p className="mt-1 font-medium">LINE 導流入口尚未設定；LINE 提醒尚不能視為已驗收。</p>}
        </div>
      )}

      <div className="space-y-6">
        {/* URLs — 前台 */}
        <Section title="產業模組">
          <InfoRow
            label="已選模組"
            value={summary.store.industryModule === "COURSE" ? "運動課程" : summary.store.industryModule === "SPA" ? "SPA／美容美體" : "蒸足門市"}
          />
          {summary.store.industryModule === "SPA" && !summary.canActivate && (
            <>
              <p className="mt-2 text-xs leading-relaxed text-amber-700">
                SPA 專屬資料與排程尚在佈建，因此此店不會啟用，也不會使用蒸足預約資料。
              </p>
              <SpaProvisionButton storeId={storeId} />
            </>
          )}
        </Section>

        {/* URLs — 前台 */}
        <Section title="前台網址">
          <InfoRow label="顧客登入" value={summary.urls.storefront} link />
          <InfoRow label="預約頁" value={summary.urls.booking} link />
          <InfoRow label="註冊頁" value={summary.urls.register} link />
        </Section>

        {/* URLs — 後台 */}
        <Section title="後台網址">
          <InfoRow label="後台登入" value={summary.urls.adminLogin} link />
          <InfoRow label="店舖後台" value={summary.urls.adminDashboard} link />
          <InfoRow label="HQ 管理" value={summary.urls.hqStoreDetail} link />
        </Section>

        {/* Accounts */}
        <Section title="帳號">
          <InfoRow label="OWNER" value={`${summary.accounts.owner.name} (${summary.accounts.owner.email})`} />
          {summary.accounts.staff.map((s, i) => (
            <InfoRow key={i} label={`STAFF ${i + 1}`} value={`${s.name} (${s.email}) — ${s.role}`} />
          ))}
        </Section>

        {/* Third-party */}
        <Section title="第三方服務">
          <InfoRow label="LINE" value={summary.thirdParty.line === "configured" ? "已設定" : "未設定"} />
          <InfoRow label="Email 服務" value={summary.thirdParty.email === "configured" ? "已設定" : "未設定"} />
        </Section>

        {/* Operating status */}
        <Section title="營運狀態">
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(STORE_OPERATING_STATUS_LABELS) as StoreOperatingStatus[]).map((status) => (
              <OperatingStatusButton
                key={status}
                storeId={storeId}
                status={status}
                active={summary.store.operatingStatus === status}
              />
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-earth-500">
            營運狀態由 HQ 管理。TRIAL / ACTIVE 可接受前台與新預約；PAUSED / INACTIVE 會阻擋前台顧客頁與所有新預約，但保留資料與後台檢視。
          </p>
        </Section>

        {/* Checklist */}
        <Section title="建置與驗收進度">
          <p className="mb-2 text-xs text-earth-500">✅ 已建立或已檢查；⏭️ 尚待設定或人工實測。此清單不代表 LINE 提醒已送達。</p>
          {summary.checklist.map((item) => (
            <div key={item.key} className="flex items-center gap-2 py-1">
              <span className={`text-sm ${
                item.status === "pass" ? "text-green-600" :
                item.status === "fail" ? "text-red-600" : "text-amber-500"
              }`}>
                {item.status === "pass" ? "✅" : item.status === "fail" ? "❌" : "⏭️"}
              </span>
              <span className="text-sm text-earth-700">{item.label}</span>
            </div>
          ))}
        </Section>

        {/* Status bar */}
        {summary.store.isDemo ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-sm font-medium text-blue-700">
              ℹ️ Demo 店不可啟用為正式店
            </p>
          </div>
        ) : (
          <div className={`rounded-lg border px-4 py-3 ${summary.canActivate ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
            <p className={`text-sm font-medium ${summary.canActivate ? "text-green-700" : "text-amber-700"}`}>
              {summary.store.planStatus === "ACTIVE"
                ? "✅ 已正式啟用"
                : summary.store.currentSubscriptionId
                  ? "已建立訂閱；延長試用或轉正式請至訂閱管理"
                  : summary.canActivate
                  ? summary.store.industryModule === "COURSE"
                    ? "課程店建置完成，30 天尚未起算；完成 LIFF 與通知驗收後再開通"
                    : "✅ 設定完成，可開通 30 天單店試用"
                  : "⚠️ 部分項目未通過，建議先修正"}
            </p>
          </div>
        )}
      </div>

      <div className="mt-8">
        <Link href="/hq/dashboard/stores" className="text-sm text-earth-500 hover:text-earth-700">
          ← 返回店舖列表
        </Link>
      </div>
    </div>
  );
}

function OperatingStatusButton({
  storeId,
  status,
  active,
}: {
  storeId: string;
  status: StoreOperatingStatus;
  active: boolean;
}) {
  return (
    <form action={async () => {
      "use server";
      await updateStoreOperatingStatusAction(storeId, status);
    }}>
      <button
        type="submit"
        disabled={active}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-default disabled:opacity-70 ${
          active
            ? "border-primary-200 bg-primary-50 text-primary-700"
            : "border-earth-200 bg-white text-earth-700 hover:bg-earth-50"
        }`}
      >
        {STORE_OPERATING_STATUS_LABELS[status]}
      </button>
    </form>
  );
}

// ── Helpers ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-earth-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-earth-800">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="w-24 shrink-0 text-earth-500">{label}</span>
      {link ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline break-all">{value}</a>
      ) : (
        <span className="text-earth-800 break-all">{value}</span>
      )}
    </div>
  );
}
