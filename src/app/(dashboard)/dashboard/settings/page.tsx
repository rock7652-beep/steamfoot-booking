import { CustomerLabelsSettingsLink } from "@/components/customer-labels";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getTrialSettings } from "@/lib/shop-config";
import { getActiveStoreForRead } from "@/lib/store";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { getCachedShopConfig, getCachedBusinessHours } from "@/lib/query-cache";
import { listStaff } from "@/server/queries/staff";
import { listReminderRules } from "@/server/queries/reminder";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  PageShell,
  PageHeader,
} from "@/components/desktop";
import {
  SettingsListRow,
  SettingsModuleWorkspace,
  SettingsPanel,
} from "@/components/settings";
import RemindersPage from "../reminders/page";

/**
 * /dashboard/settings — 設定控制台（PR5 重構）
 *
 * 從「卡片式入口頁」升級成桌機三欄控制台：
 *   左欄：分類導覽（3 類 / 5 項）
 *   中欄：5 張設定卡，每張含目前狀態 summary + 主/次入口
 *   右欄：快速操作 + 系統資訊
 *
 * 資料策略（遵守 PR5 spec「不可大幅增加首頁 query 負擔」）：
 *   - 所有 summary 都走既有 query，並行取得
 *   - 取不到資料時以保守字串取代，不報錯
 */
interface SettingsPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function SettingsIndexPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "OWNER" && user.role !== "PARTNER") {
    notFound();
  }

  const activeStoreId = await getActiveStoreForRead(user);

  if (!activeStoreId) {
    const canManageHeadquarters = user.role === "OWNER" || user.role === "ADMIN";

    return (
      <PageShell className="flex w-full min-w-0 flex-col gap-3 py-4">
        <PageHeader
          title="總部設定"
          subtitle="管理跨店系統設定；單店設定請先切換到特定店舖"
        />
        {canManageHeadquarters ? (
          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-earth-900">LINE 官方帳號管理</h2>
              <p className="mt-2 text-sm leading-relaxed text-earth-500">
                查看竹北、新竹與台中分店的 LINE 通知狀態，並可一次重新驗證。
              </p>
              <Link
                href="/dashboard/settings/line-official-accounts"
                className="mt-4 inline-flex h-9 items-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
              >
                進入 LINE 官方帳號管理
              </Link>
            </section>
          </div>
        ) : (
          <div className="rounded-xl border border-earth-200 bg-white p-8 text-center">
            <p className="text-sm text-earth-500">
              全部分店模式不顯示或儲存單店設定，請先選擇特定店舖。
            </p>
          </div>
        )}
      </PageShell>
    );
  }


  const industry = await getStoreIndustryModule(activeStoreId);
  if (industry === "course") redirect("/dashboard/courses?view=settings");
  const canManageTrial = await checkPermission(
    user.role,
    user.staffId,
    "trial.manage",
  );
  const isSpaStore = industry === "spa";

  const [
    plan,
    shopConfig,
    staffList,
    rules,
    weeklyHours,
    store,
    trialSettings,
    hasDigitalButler,
    canHours,
    canPayment,
    canBooking,
    canDuty,
  ] = await Promise.all([
    getCurrentStorePlan().catch(() => "EXPERIENCE" as const),
    getCachedShopConfig(activeStoreId).catch(() => ({
      dutySchedulingEnabled: false,
      bankName: null as string | null,
      bankCode: null as string | null,
      bankAccountNumber: null as string | null,
      lineOfficialUrl: null as string | null,
      referralShareTemplate: null as string | null,
    })),
    listStaff(activeStoreId).catch(() => []),
    listReminderRules(activeStoreId).catch(() => []),
    getCachedBusinessHours(activeStoreId).catch(() => []),
    prisma.store.findUnique({
      where: { id: activeStoreId },
      select: { name: true, slug: true },
    }),
    getTrialSettings(activeStoreId).catch(() => null),
    hasStoreFeature(activeStoreId, FEATURES.DIGITAL_BUTLER).catch(() => false),
    checkPermission(user.role, user.staffId, "business_hours.manage"),
    checkPermission(user.role, user.staffId, "plans.edit"),
    checkPermission(user.role, user.staffId, "booking.read"),
    checkPermission(user.role, user.staffId, "duty.manage"),
  ]);

  const staffCount = staffList.length;
  const activeStaffCount = staffList.filter((s) => s.status === "ACTIVE").length;
  const planInfo = PRICING_PLAN_INFO[plan];
  const planLabel = planInfo?.label ?? plan;
  const openDays = weeklyHours.filter((h) => h.isOpen);
  const sampleOpen = openDays[0];
  const hoursLine = sampleOpen
    ? `${sampleOpen.openTime}–${sampleOpen.closeTime}・每週 ${openDays.length} 天`
    : weeklyHours.length === 0
      ? "未設定"
      : "目前全週未開放";
  const dutyOn = shopConfig.dutySchedulingEnabled;
  const totalRules = rules.length;
  const enabledRules = rules.filter((rule) => rule.isEnabled).length;
  const remindersLine = totalRules === 0 ? "未建立規則" : `${enabledRules} / ${totalRules} 規則開啟`;
  const storeName = store?.name ?? "—";
  const bankLine = shopConfig.bankAccountNumber
    ? `${shopConfig.bankName || "銀行帳戶"}・末四碼 ${shopConfig.bankAccountNumber.slice(-4)}`
    : "未設定";
  const trialLine = trialSettings
    ? `${trialSettings.trialEnabled ? "開啟" : "關閉"}・預設 NT$ ${trialSettings.trialDefaultPrice}`
    : "未設定";

  const commonNotificationRows = (
    <>
      <SettingsListRow title="提醒管理" summary={remindersLine} href="/dashboard/settings?panel=reminders&panelQuery=tab%3Dcustomer" action="管理" />
      <SettingsListRow
        title="推薦分享"
        summary={"referralShareTemplate" in shopConfig && shopConfig.referralShareTemplate ? "已自訂" : "系統預設"}
        href="/dashboard/settings/referral-share"
        action="編輯"
      />
      {hasDigitalButler ? (
        <>
          <SettingsListRow title="數位管家" summary="已開通" href="/dashboard/settings/digital-butler" action="管理" />
          <SettingsListRow title="數位管家名單" summary="查看顧客互動名單" href="/dashboard/digital-butler/leads" action="查看" />
        </>
      ) : null}
    </>
  );

  const sections = isSpaStore
    ? [
        {
          id: "booking",
          label: "營業與預約",
          content: (
            <>
              {canHours ? <SettingsListRow title="營業與預約時間" summary={hoursLine} href="/dashboard/settings/hours" action="修改" /> : null}
              {canBooking ? <SettingsListRow title="預約排程" summary="人員・服務・位置排程" href="/dashboard/spa-schedule" action="查看" /> : null}
            </>
          ),
        },
        {
          id: "payment",
          label: "收款與體驗",
          content: (
            <>
              {canPayment ? <SettingsListRow title="銀行轉帳資訊" summary={bankLine} href="/dashboard/settings/payment" action="修改" /> : null}
              {canManageTrial ? <SettingsListRow title="體驗設定" summary={trialLine} href="/dashboard/settings/trial" action="修改" /> : null}
            </>
          ),
        },
        {
          id: "staff",
          label: "人員與服務",
          content: (
            <>
              {canDuty && user.role === "OWNER" ? <SettingsListRow title="人員與排班" summary={`啟用 ${activeStaffCount} / ${staffCount} 人`} href="/dashboard/spa-staff" action="管理" /> : null}
              <SettingsListRow title="值班聯動" summary={dutyOn ? "開啟・未值班時段不開放" : "關閉"} href="/dashboard/settings/duty" action="設定" />
            </>
          ),
        },
        {
          id: "notifications",
          label: "通知與顧客經營",
          content: commonNotificationRows,
        },
        {
          id: "subscription",
          label: "系統方案與用量",
          content: (
            <SettingsListRow title="店家系統方案" summary={planLabel} href="/dashboard/settings/plans" action="查看" />
          ),
        },
      ]
    : [
        {
          id: "booking",
          label: "營業與預約",
          content: (
            <>
              <SettingsListRow title="預約開放設定" summary={hoursLine} href="/dashboard/settings/hours" action="修改" />
              <SettingsListRow title="值班聯動" summary={dutyOn ? "開啟・依值班開放預約" : "關閉"} href="/dashboard/settings/duty" action="設定" />
            </>
          ),
        },
        {
          id: "payment",
          label: "收款與體驗",
          content: (
            <>
              <SettingsListRow title="銀行轉帳資訊" summary={bankLine} href="/dashboard/settings/payment" action="修改" />
              {canManageTrial ? <SettingsListRow title="體驗設定" summary={trialLine} href="/dashboard/settings/trial" action="修改" /> : null}
            </>
          ),
        },
        {
          id: "staff",
          label: "人員與權限",
          content: (
            <SettingsListRow title="人員狀態" summary={`啟用 ${activeStaffCount} / ${staffCount} 人`} href="/dashboard/staff" action="管理" />
          ),
        },
        {
          id: "notifications",
          label: "通知與顧客經營",
          content: commonNotificationRows,
        },
        {
          id: "subscription",
          label: "系統方案與用量",
          content: (
            <SettingsListRow title="店家系統方案" summary={planLabel} href="/dashboard/settings/plans" action="查看" />
          ),
        },
      ];

  return (
    <PageShell className="flex w-full min-w-0 flex-col gap-3 py-4">
      <PageHeader
        title="設定"
        subtitle="店長控制台 · 查看狀態，需要修改時再進入"
      />
      <SettingsModuleWorkspace
        moduleLabel={isSpaStore ? "SPA 模組" : "蒸足模組"}
        storeName={storeName}
        sections={sections}
      />

      <CustomerLabelsSettingsLink />
      {params.panel === "reminders" ? (
        <SettingsPanel title="提醒管理" sourceHref="/dashboard/reminders" width={1040}>
          <RemindersPage
            searchParams={Promise.resolve(
              Object.fromEntries(new URLSearchParams(params.panelQuery ?? "tab=customer")),
            )}
          />
        </SettingsPanel>
      ) : null}
    </PageShell>
  );
}
