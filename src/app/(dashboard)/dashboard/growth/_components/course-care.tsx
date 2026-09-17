import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { formatTWTime } from "@/lib/date-utils";
import { getCourseCustomerCare } from "@/server/queries/course-customer-care";
import { getBirthdayCustomersForMonth } from "@/server/queries/customer-birthday";
import { CareSection, type CareItem } from "./care-section";

export async function CourseCare({ storeId, month, readOnly, canFollowUp, canBook }: { storeId: string; month: string; readOnly: boolean; canFollowUp: boolean; canBook: boolean }) {
  const [overview, birthdays] = await Promise.all([getCourseCustomerCare(storeId), getBirthdayCustomersForMonth(storeId, month)]);
  const mode = { courseMode: true, readOnly, canFollowUp, canBook };
  const phone = (value: string | null) => value ? `末四碼 ${value.slice(-4)}` : "未提供電話";
  const rows = (kind: keyof typeof overview): CareItem[] => overview[kind].map(customer => {
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
    <form className="mb-5 flex flex-wrap items-end gap-3"><label className="text-sm">生日月份<input className="ml-2 min-h-11 rounded border border-earth-200 p-2" aria-label="生日月份" type="month" name="month" defaultValue={month}/></label><button className="min-h-11 rounded border border-earth-200 px-3">套用月份</button></form>
    <div className="space-y-6">
      <CareSection title="本月生日" description={`${month}，每位顧客只列一次。`} emptyText="本月沒有生日顧客。" items={birthdayItems} totalCount={birthdayItems.length}/>
      {([['inactive', '好久不見'], ['low', '建議安排回課'], ['expiring', '建議續約']] as const).map(([kind, title]) => {
        const items = rows(kind);
        return <CareSection key={kind} title={title} description={kind === 'low' ? '依各方案開關及門檻，逐卡判斷可用額度；不同適用範圍不合併計算。' : kind === 'inactive' ? '最近一次出席超過 30 天，且仍有有效方案。' : '每張有效方案分別列出到期日及額度。'} emptyText="目前沒有符合條件的顧客。" items={items} totalCount={items.length}/>;
      })}
      <section className="rounded border border-earth-200 p-4 text-sm"><h2 className="font-semibold">體驗未開卡與體驗追蹤</h2><p className="mt-2">課程體驗交易承接尚未完成，暫無可用統計來源；此處不將缺少資料顯示為零，也不以一般購買推定體驗成交。</p></section>
    </div>
  </PageShell>;
}
