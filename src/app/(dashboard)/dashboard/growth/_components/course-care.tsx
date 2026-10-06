import { prisma } from "@/lib/db";
import { resolveCourseBusinessProfile } from "@/lib/store-business-profile";
import { isCourseCareKind } from "@/server/queries/course-home";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { formatTWTime } from "@/lib/date-utils";
import { getCourseCustomerCare } from "@/server/queries/course-customer-care";
import { getBirthdayCustomersForMonth } from "@/server/queries/customer-birthday";
import { type CareItem } from "./care-section";
import { CareWorkspaceServer } from "./care-workspace-server";

export async function CourseCare({ storeId, month, readOnly, canFollowUp, canBook, segment, staffScope = null }: { storeId: string; month: string; readOnly: boolean; canFollowUp: boolean; canBook: boolean; segment?: string; staffScope?: string | null }) {
  const [overview, birthdays, businessEntitlements] = await Promise.all([getCourseCustomerCare(storeId, new Date(), staffScope), getBirthdayCustomersForMonth(storeId, month, staffScope), prisma.storeFeatureEntitlement.findMany({ where: { storeId, featureKey: { startsWith: "business." }, status: "ENABLED" }, select: { featureKey: true } })]);
  const staffLabel = resolveCourseBusinessProfile(businessEntitlements.map(item => item.featureKey)) === "MUSIC" ? "所屬人員" : "所屬教練";
  const selected = isCourseCareKind(segment) ? segment : null;
  const mode = { staffLabel, courseMode: true, readOnly, canFollowUp, canBook };
  const phone = (value: string | null) => value ? `末四碼 ${value.slice(-4)}` : "未提供電話";
  const rows = (kind: "low" | "inactive" | "expiring"): CareItem[] => overview[kind].map(customer => {
    const cards = customer.cards.filter(card => kind === "low" ? card.low : kind === "expiring" ? card.expiring : card.remaining > 0).sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
    const details = cards.map(card => `${card.name}：剩餘 ${card.remaining}／已預約 ${card.held}／可用 ${card.available} ${card.unit}，${formatTWTime(card.expiresAt, { dateOnly: true })} 到期`);
    return {
      ...mode, customerId: customer.id, name: customer.name, phoneMasked: phone(customer.phone), staffName: customer.assignedStaff?.displayName ?? null,
      lastFollowUpText: customer.followUps[0] ? `最後追蹤：${customer.followUps[0].createdBy.name}・${formatTWTime(customer.followUps[0].createdAt)}` : null,
      reason: kind === "inactive" ? "超過 30 天未出席，仍有有效方案" : kind === "low" ? "已達方案設定的低可用額度門檻" : "方案將於 14 天內到期",
      meta: details[0] ?? null, planDetails: details.slice(1),
      script: kind === "inactive" ? "您好，最近還好嗎？需要我們協助安排下一次課程嗎？" : "您好，想提醒您確認方案可用額度與期限，需要協助安排課程可以與我們聯絡。預約占用尚未正式使用額度。",
    };
  });
  const birthdayItems: CareItem[] = birthdays.map(customer => ({ ...mode, customerId: customer.customerId, name: customer.customerName, phoneMasked: phone(customer.customerPhone), staffName: customer.assignedStaffName, lastFollowUpText: customer.lastFollowUp ? `最後追蹤：${customer.lastFollowUp.createdByName}・${formatTWTime(customer.lastFollowUp.createdAt)}` : null, reason: `${customer.birthday.getUTCMonth() + 1} 月 ${customer.birthday.getUTCDate()} 日生日`, meta: null, script: "生日快樂！祝您新的一歲平安順心，也期待很快在課堂上見到您。" }));
  const counts = { birthday: birthdayItems.length, inactive: overview.inactive.length, low: overview.low.length, expiring: overview.expiring.length, trial: overview.trial.length };
  return <PageShell compact>
    <PageHeader compact title="顧客經營" subtitle="今天要關心誰，一頁看懂。" actions={<Link className="inline-flex min-h-11 items-center text-sm" href="/dashboard/courses?view=customers">顧客管理</Link>}/>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav aria-label="關懷分類" className="flex flex-wrap gap-1">
        <Link aria-current={!selected ? "page" : undefined} href={`/dashboard/growth?month=${month}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-earth-600 hover:bg-earth-100 aria-[current=page]:bg-primary-100 aria-[current=page]:text-primary-900">全部</Link>
        {([['birthday','本月生日'],['inactive','好久不見'],['low','額度快用完'],['expiring','方案快到期'],['trial','體驗未購買方案']] as const).map(([kind,label]) => <Link key={kind} aria-current={selected === kind ? "page" : undefined} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-earth-600 hover:bg-earth-100 aria-[current=page]:bg-primary-100 aria-[current=page]:text-primary-900" href={`/dashboard/growth?segment=${kind}&month=${month}`}>{label} <span className="tabular-nums">{counts[kind]} 位</span></Link>)}
      </nav>
      <details className="min-w-0">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm text-earth-600">生日月份 · {month}</summary>
        <form data-settings-panel-filter className="flex flex-wrap items-center gap-2 pb-2">{selected && <input type="hidden" name="segment" value={selected}/>}<input className="min-h-11 max-w-full rounded border border-earth-200 p-2 text-sm" aria-label="生日月份" type="month" name="month" defaultValue={month}/><button className="min-h-11 rounded border border-earth-200 px-3 text-sm">套用</button></form>
      </details>
    </div>
    <CareWorkspaceServer storeId={storeId} module="course" month={month} staffScope={staffScope} readOnly={readOnly} canFollowUp={canFollowUp} canBook={canBook} selected={selected} sections={[
      { reason: "birthday", title: "本月生日", description: "本月生日祝福。", emptyText: "本月沒有待祝福顧客。", items: birthdayItems },
      { reason: "inactive", title: "好久不見", description: "超過 30 天未出席。", emptyText: "目前沒有需要回課關懷的顧客。", items: rows("inactive") },
      { reason: "low", title: "額度快用完", description: "依方案門檻逐卡判斷。", emptyText: "目前沒有低額度提醒。", items: rows("low") },
      { reason: "expiring", title: "方案快到期", description: "每張方案分別計算到期。", emptyText: "目前沒有到期提醒。", items: rows("expiring") },
      { reason: "trial", title: "體驗未購買方案", description: "收款不代表已出席。", emptyText: "目前沒有待關懷體驗顧客。", items: overview.trial.map(c=>({...mode,customerId:c.id,name:c.name,phoneMasked:phone(c.phone),staffName:c.assignedStaff?.displayName??null,lastFollowUpText:c.followUps[0]?`最後追蹤：${c.followUps[0].createdBy.name}・${formatTWTime(c.followUps[0].createdAt)}`:null,reason:"體驗收款後・尚未購買正式方案",meta:`${formatTWTime(c.trial.booking.session.startsAt)} · ${c.trial.booking.status==="ATTENDED"?"已出席":c.trial.booking.status==="NO_SHOW"?"未到":"待出席"}`,script:"您好，想關心您課程體驗的安排與感受，需要協助可以與我們聯絡。"})) },
    ]}/>
  </PageShell>;
}
