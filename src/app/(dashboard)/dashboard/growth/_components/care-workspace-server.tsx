import { CARE_REASON_LABELS, type CareReason } from "@/lib/customer-care-lifecycle";
import { toLocalDateStr } from "@/lib/date-utils";
import type { IndustryModuleId } from "@/lib/industry-modules";
import { getCustomerCareActivity, getCareItemState } from "@/server/queries/customer-care-activity";
import { CareWorkspace, type CareSectionData } from "./care-workspace";
import type { CareItem } from "./care-section";

export async function CareWorkspaceServer({ storeId, module, month, staffScope = null, sections, readOnly = false, canFollowUp = true, canBook = true, selected }: {
  storeId: string; module: IndustryModuleId; month: string; staffScope?: string | null; sections: CareSectionData[];
  readOnly?: boolean; canFollowUp?: boolean; canBook?: boolean; selected?: CareReason | null;
}) {
  const year = Number(month.slice(0, 4));
  const { customers, latest, nextBookings } = await getCustomerCareActivity(storeId, module, staffScope, year);
  const signalKeys = new Set<string>();
  const assignedNames = new Map(customers.map(customer => [customer.id, customer.assignedStaff?.storeId === storeId ? customer.assignedStaff.displayName : null]));
  const staffLabel = sections.flatMap(section => section.items).find(item => item.staffLabel)?.staffLabel;
  const enriched = sections.map(section => ({ ...section, items: section.items.map(item => {
    signalKeys.add(`${item.customerId}:${section.reason}`);
    const activity = latest.get(`${item.customerId}:${section.reason}`) ?? null;
    const nextBooking = nextBookings.get(item.customerId) ?? null;
    return { ...item, staffLabel: item.staffLabel ?? staffLabel, staffName: assignedNames.get(item.customerId) ?? null, readOnly, canFollowUp, canBook, module, courseMode: module === "course", careReason: section.reason, careYear: year,
      activity, nextBooking, ...getCareItemState(section.reason, year, activity, nextBooking) };
  }) }));
  const history: CareItem[] = [];
  for (const c of customers) for (const [key, activity] of latest) {
    if (key !== `${c.id}:${activity.reason}` || signalKeys.has(key) || (selected && selected !== activity.reason)) continue;
    history.push({ customerId: c.id, name: c.name, phoneMasked: c.phone ? `末四碼 ${c.phone.slice(-4)}` : "未提供電話", staffLabel, staffName: assignedNames.get(c.id) ?? null,
      reason: `${CARE_REASON_LABELS[activity.reason]}・提醒條件已解除`, meta: null, lastFollowUpText: null, script: "", activity, state: "handled", label: "已解除", careReason: activity.reason, careYear: year,
      readOnly, canFollowUp, canBook, module, courseMode: module === "course", nextBooking: nextBookings.get(c.id) ?? null });
  }
  return <CareWorkspace sections={enriched} history={history} today={toLocalDateStr()} selected={selected}/>;
}
