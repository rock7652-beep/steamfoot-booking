import { PageHeader, PageShell } from "@/components/desktop";
import { getSpaCustomerCare } from "@/server/queries/spa-customer-care";
import { getBirthdayCustomersForMonth } from "@/server/queries/customer-birthday";
import { formatTWTime } from "@/lib/date-utils";
import { CareWorkspaceServer } from "./care-workspace-server";
import type { CareItem } from "./care-section";
export async function SpaCare({ storeId, month, staffScope, readOnly, canFollowUp, canBook }: { storeId: string; month: string; staffScope: string | null; readOnly: boolean; canFollowUp: boolean; canBook: boolean }) {
  const [rows, birthdays] = await Promise.all([getSpaCustomerCare(storeId, month, staffScope), getBirthdayCustomersForMonth(storeId, month, staffScope)]);
  const base = (c: typeof rows[number]): Omit<CareItem, "reason"> => ({ customerId: c.id, name: c.name, phoneLabel: c.phone || "未提供電話", staffName: c.assignedStaff?.displayName ?? null, lastFollowUpText: null, script: "您好，想關心您最近的狀況，需要我們協助安排下一次服務嗎？", meta: null });
  return <PageShell compact><PageHeader compact title="顧客經營" subtitle="生日、回店與方案關懷。"/>
    <CareWorkspaceServer storeId={storeId} module="spa" month={month} staffScope={staffScope} readOnly={readOnly} canFollowUp={canFollowUp} canBook={canBook} sections={[
      { reason: "birthday", title: "本月生日", description: "生日祝福。", emptyText: "本月沒有待祝福顧客。", items: birthdays.map(c => ({ customerId: c.customerId, name: c.customerName, phoneLabel: c.customerPhone || "未提供電話", staffName: c.assignedStaffName, reason: `${c.birthday.getUTCMonth() + 1} 月 ${c.birthday.getUTCDate()} 日生日`, meta: null, lastFollowUpText: null, script: "生日快樂！祝您新的一歲平安順心。" })) },
      { reason: "trial", title: "本月體驗未開卡", description: "完成體驗但尚未購買方案。", emptyText: "本月沒有待關懷體驗顧客。", items: rows.filter(c => c.trial).map(c => ({ ...base(c), reason: "本月完成體驗・尚未購買方案" })) },
      { reason: "inactive", title: "好久不見", description: "超過 30 天未到店。", emptyText: "目前沒有需要回店關懷的顧客。", items: rows.filter(c => c.inactive).sort((a,b) => (b.daysSinceVisit ?? 0) - (a.daysSinceVisit ?? 0)).map(c => ({ ...base(c), reason: `${c.daysSinceVisit} 天未到店${c.remaining ? `・剩 ${c.remaining} 次` : "・仍有儲值餘額"}` })) },
      { reason: "low", title: "次數快用完", description: "有效方案剩餘次數偏低。", emptyText: "目前沒有低次數提醒。", items: rows.filter(c => c.low).map(c => ({ ...base(c), reason: `剩 ${c.remaining} 次・適合關心續約` })) },
      { reason: "expiring", title: "方案快到期", description: "14 天內到期。", emptyText: "目前沒有到期提醒。", items: rows.filter(c => c.expiring.length).map(c => ({ ...base(c), reason: "方案將於 14 天內到期", meta: c.expiring.map(card => `${card.nameSnapshot}・剩 ${card.remainingUses} 次・${formatTWTime(card.expiryDate!, { dateOnly: true })} 到期`).join("；") })) },
    ]}/>
  </PageShell>;
}
