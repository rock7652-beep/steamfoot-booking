import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { getShopConfig } from "@/lib/shop-config";
import { listStaff } from "@/server/queries/staff";
import { listReminderRules } from "@/server/queries/reminder";
import { getBusinessHours } from "@/server/actions/business-hours";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import {
  PageShell,
  PageHeader,
  InfoList,
  type InfoListItem,
} from "@/components/desktop";
import {
  SettingsShell,
  SettingsNavSection,
  SettingsActionCard,
  SettingsSidePanel,
} from "@/components/settings";

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
export default async function SettingsIndexPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "OWNER" && user.role !== "PARTNER") {
    notFound();
  }

  const activeStoreId = await getActiveStoreForRead(user);

  // 並行拉 summary（皆為既有 query）
  const [plan, shopConfig, staffList, rules, weeklyHours, store] =
    await Promise.all([
      getCurrentStorePlan().catch(() => "EXPERIENCE" as const),
      getShopConfig().catch(() => ({
        dutySchedulingEnabled: false,
        bankName: null as string | null,
        bankCode: null as string | null,
        bankAccountNumber: null as string | null,
        lineOfficialUrl: null as string | null,
      })),
      listStaff(activeStoreId).catch(() => []),
      listReminderRules().catch(() => []),
      getBusinessHours().catch(() => []),
      activeStoreId
        ? prisma.store.findUnique({
            where: { id: activeStoreId },
            select: { name: true, slug: true },
          })
        : Promise.resolve(null),
    ]);

  // ==== Summary 組裝 ====

  const staffCount = staffList.length;
  const activeStaffCount = staffList.filter((s) => s.status === "ACTIVE").length;

  const planInfo = PRICING_PLAN_INFO[plan];
  const planLabel = planInfo?.label ?? plan;

  const openDays = weeklyHours.filter((h) => h.isOpen);
  const sampleOpen = openDays[0];
  const hoursLine = sampleOpen
    ? `${sampleOpen.openTime}–${sampleOpen.closeTime}（營業 ${openDays.length} 天/週）`
    : weeklyHours.length === 0
      ? "尚未設定"
      : "目前全週未開放";

  const dutyOn = shopConfig.dutySchedulingEnabled;

  const totalRules = rules.length;
  const enabledRules = rules.filter((r) => r.isEnabled).length;
  const remindersLine =
    totalRules === 0
      ? "尚未建立提醒規則"
      : `${enabledRules}/${totalRules} 規則啟用中`;

  const storeName = store?.name ?? "—";

  // ==== Nav 分類（左欄）====
  const navSections = [
    {
      title: "店務設定",
      items: [
        { label: "預約開放設定", href: "/dashboard/settings/hours" },
        { label: "值班排班設定", href: "/dashboard/settings/duty" },
      ],
    },
    {
      title: "營運設定",
      items: [
        { label: "方案設定", href: "/dashboard/settings/plan" },
        { label: "付款設定", href: "/dashboard/settings/payment" },
        { label: "提醒管理", href: "/dashboard/reminders" },
      ],
    },
    {
      title: "人員與權限",
      items: [{ label: "人員管理", href: "/dashboard/staff" }],
    },
  ];

  // ==== 付款設定 summary ====
  const bankLine = shopConfig.bankAccountNumber
    ? `${shopConfig.bankName ?? ""}${shopConfig.bankCode ? ` (${shopConfig.bankCode})` : ""} ${shopConfig.bankAccountNumber}`.trim()
    : "尚未設定";
  const lineOfficialLine = shopConfig.lineOfficialUrl ? "已設定" : "尚未設定";

  // ==== 右欄資料 ====
  const quickActions = [
    { label: "新增預約", href: "/dashboard/bookings/new" },
    { label: "新增顧客", href: "/dashboard/customers/new" },
    { label: "預約月曆", href: "/dashboard/bookings" },
  ];

  const systemInfo: InfoListItem[] = [
    { label: "目前店別", value: storeName },
    { label: "目前方案", value: planLabel },
    { label: "員工數", value: `${activeStaffCount} / ${staffCount}` },
  ];

  // 使用提示（右欄最下）— 有警示才顯示
  const hints: string[] = [];
  if (weeklyHours.length === 0)
    hints.push("尚未設定每週營業時間，顧客將看不到可預約時段");
  if (dutyOn && weeklyHours.length > 0 && openDays.length === 0)
    hints.push("值班排班已啟用，但目前沒有任何營業日");
  if (totalRules === 0)
    hints.push("尚未建立提醒規則，預約不會自動通知顧客");

  return (
    <PageShell>
      <PageHeader
        title="設定"
        subtitle="店長控制台 · 查看狀態、快速進入對應設定"
      />

      <SettingsShell
        nav={navSections.map((s) => (
          <SettingsNavSection key={s.title} title={s.title} items={s.items} />
        ))}
        side={
          <SettingsSidePanel
            quickActions={quickActions}
            systemInfo={systemInfo}
          >
            {hints.length > 0 ? (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  使用提示
                </h4>
                <ul className="mt-1.5 space-y-1 text-[11px] text-amber-800">
                  {hints.map((h, i) => (
                    <li key={i}>• {h}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </SettingsSidePanel>
        }
      >
        {/* 1. 人員管理 */}
        <SettingsActionCard
          title="人員管理"
          description="建立員工、指派角色與可視範圍"
          iconPath="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          primaryHref="/dashboard/staff"
          primaryLabel="管理人員"
          summary={
            <InfoList
              items={[
                { label: "員工總數", value: `${staffCount} 位` },
                { label: "啟用中", value: `${activeStaffCount} 位` },
              ]}
            />
          }
        />

        {/* 2. 方案設定 */}
        <SettingsActionCard
          title="方案設定"
          description="方案內容、試用狀態、升級申請"
          iconPath="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
          primaryHref="/dashboard/settings/plan"
          primaryLabel="查看方案"
          summary={
            <InfoList
              items={[
                { label: "目前方案", value: planLabel },
                {
                  label: "說明",
                  value: planInfo?.description ?? "—",
                },
              ]}
            />
          }
        />

        {/* 3. 預約開放設定 */}
        <SettingsActionCard
          title="預約開放設定"
          description="營業時間、可預約時段與休假"
          iconPath="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
          primaryHref="/dashboard/settings/hours"
          primaryLabel="編輯預約設定"
          summary={
            <InfoList
              items={[
                { label: "營業時間", value: hoursLine },
                {
                  label: "營業天數",
                  value:
                    weeklyHours.length === 0
                      ? "—"
                      : `${openDays.length} 天 / 週`,
                },
              ]}
            />
          }
        />

        {/* 4. 值班排班設定 */}
        <SettingsActionCard
          title="值班排班設定"
          description="員工值班排定與輪班"
          iconPath="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
          primaryHref="/dashboard/settings/duty"
          primaryLabel="編輯班表"
          summary={
            <InfoList
              items={[
                {
                  label: "聯動預約",
                  value: dutyOn ? (
                    <span className="text-primary-700">已啟用</span>
                  ) : (
                    <span className="text-earth-500">停用中</span>
                  ),
                },
                {
                  label: "說明",
                  value: dutyOn
                    ? "只有已排班時段會開放顧客預約"
                    : "所有時段都可預約（值班僅作參考）",
                },
              ]}
            />
          }
        />

        {/* 5. 付款設定 */}
        <SettingsActionCard
          title="付款設定"
          description="前台購買頁顯示的銀行轉帳資訊與 LINE@ 連結"
          iconPath="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
          primaryHref="/dashboard/settings/payment"
          primaryLabel="編輯付款設定"
          summary={
            <InfoList
              items={[
                { label: "銀行帳戶", value: bankLine },
                { label: "LINE@ 連結", value: lineOfficialLine },
              ]}
            />
          }
        />

        {/* 6. 提醒管理 */}
        <SettingsActionCard
          title="提醒管理"
          description="LINE 提醒模板與自動通知"
          iconPath="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          primaryHref="/dashboard/reminders"
          primaryLabel="設定提醒"
          secondaryHref="/dashboard/reminders?tab=templates"
          secondaryLabel="查看模板"
          summary={
            <InfoList
              items={[
                { label: "啟用狀態", value: remindersLine },
              ]}
            />
          }
        />
      </SettingsShell>
    </PageShell>
  );
}
