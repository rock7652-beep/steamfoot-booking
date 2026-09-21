import { isCourseCareKind, COURSE_CARE_LABELS } from "@/server/queries/course-home";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { formatTWTime } from "@/lib/date-utils";
import { getCourseCustomerCare } from "@/server/queries/course-customer-care";
import { getBirthdayCustomersForMonth } from "@/server/queries/customer-birthday";
import { CareSection, type CareItem } from "./care-section";

export async function CourseCare({ storeId, month, readOnly, canFollowUp, canBook, segment, staffScope = null }: { storeId: string; month: string; readOnly: boolean; canFollowUp: boolean; canBook: boolean; segment?: string; staffScope?: string | null }) {
  const [overview, birthdays] = await Promise.all([getCourseCustomerCare(storeId, new Date(), staffScope), getBirthdayCustomersForMonth(storeId, month, staffScope)]);
  const selected = isCourseCareKind(segment) ? segment : null;
  const mode = { courseMode: true, readOnly, canFollowUp, canBook };
  const phone = (value: string | null) => value ? `末四碼 ${value.slice(-4)}` : "未提供電話";
  const rows = (kind: "low" | "inactive" | "expiring"): CareItem[] => overview[kind].map(customer => {
    const cards = customer.cards.filter(card => kind === "low" ? card.low : kind === "expiring" ? card.expiring : card.remaining > 0);
    return {
      ...mode, customerId: customer.id, name: customer.name, phoneMasked: phone(customer.phone), staffName: customer.assignedStaff?.displayName ?? null,
      lastFollowUpText: customer.followUps[0] ? `最後追蹤：${customer.followUps[0].createdBy.name}・${formatTWTime(customer.followUps[0].createdAt)}` : null,
      reason: kind === "inactive" ? "超過 30 天未出席，仍有有效方案" : kind === "low" ? "已達方案設定的低可用額度門檻" : "方案將於 14 天內到期",
      meta: cards.map(card => `${card.name}：剩餘 ${card.remaining}／占用 ${card.held}／可用 ${card.available} ${card.unit}，${formatTWTime(card.expiresAt, { dateOnly: true })} 到期`).join("；"),
      script: kind === "inactive" ? "您好，最近還好嗎？需要我們協助安排下一次課程嗎？" : "您好，想提醒您確認方案可用額度與期限，需要協助安排課程可以與我們聯絡。預約占用尚未正式使用額度。",
    };
  });
  const birthdayItems: CareItem[] = birthdays.map(customer => ({ ...mode, customerId: customer.customerId, name: customer.customerName, phoneMasked: phone(customer.customerPhone), staffName: customer.assignedStaffName, lastFollowUpText: customer.lastFollowUp ? `最後追蹤：${customer.lastFollowUp.createdByName}・${formatTWTime(customer.lastFollowUp.createdAt)}` : null, reason: `${customer.birthday.getUTCMonth() + 1} 月 ${customer.birthday.getUTCDate()} 日生日`, meta: null, script: "生日快樂！祝您新的一歲平安順心，也期待很快在課堂上見到您。" }));
  return <PageShell>
    <PageHeader title="顧客經營" subtitle="生日、回課與方案關懷；追蹤紀錄不會自動發送 LINE。" actions={<Link href="/dashboard/courses?view=customers">顧客管理</Link>}/>
    <p className="mb-2 text-sm">{selected ? COURSE_CARE_LABELS[selected] : "全部關懷分類"} · <Link href="/dashboard">返回首頁</Link> · <Link href="/dashboard/growth">全部分類</Link> · <Link href="/dashboard/courses?view=settings&section=notifications">返回設定</Link></p>
    <form data-settings-panel-filter className="mb-5 flex flex-wrap items-end gap-3">{selected && <input type="hidden" name="segment" value={selected}/>}<label className="text-sm">生日月份<input className="ml-2 min-h-11 rounded border border-earth-200 p-2" aria-label="生日月份" type="month" name="month" defaultValue={month}/></label><button className="min-h-11 rounded border border-earth-200 px-3">套用月份</button></form>
    <div className="space-y-6">
      {(!selected || selected === "birthday") && <CareSection title="本月生日" description={`${month}，每位顧客只列一次。`} emptyText="本月沒有生日顧客。" items={birthdayItems} totalCount={birthdayItems.length}/>}
      {([['inactive', '好久不見'], ['low', '建議安排回課'], ['expiring', '建議續約']] as const).map(([kind, title]) => {
        if (selected && selected !== kind) return null;
        const items = rows(kind);
        return <CareSection key={kind} title={title} description={kind === 'low' ? '依各方案開關及門檻，逐卡判斷可用額度；不同適用範圍不合併計算。' : kind === 'inactive' ? '最近一次出席超過 30 天，且仍有有效方案。' : '每張有效方案分別列出到期日及額度。'} emptyText="目前沒有符合條件的顧客。" items={items} totalCount={items.length}/>;
      })}
      {(!selected || selected === "trial") && <CareSection title="體驗收款後未購買方案" description="僅列同店已收款且未購買課程方案、沒有有效可用卡的顧客；收款不代表已出席。" emptyText="目前沒有符合條件的體驗顧客。" items={overview.trial.map(c=>({...mode,customerId:c.id,name:c.name,phoneMasked:phone(c.phone),staffName:c.assignedStaff?.displayName??null,lastFollowUpText:c.followUps[0]?`最後追蹤：${c.followUps[0].createdBy.name}・${formatTWTime(c.followUps[0].createdAt)}`:null,reason:`${formatTWTime(c.trial.createdAt)} 體驗收款 NT$ ${c.trial.amount}`,meta:`課程 ${formatTWTime(c.trial.booking.session.startsAt)} · ${c.trial.booking.status==="ATTENDED"?"已出席":c.trial.booking.status==="NO_SHOW"?"未到":"待出席"}`,script:"您好，想關心您課程體驗的安排與感受，需要協助可以與我們聯絡。"}))} totalCount={overview.trial.length}/>}

    </div>
  </PageShell>;
}
