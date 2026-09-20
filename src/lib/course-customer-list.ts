import { monthRange, toLocalMonthStr } from "@/lib/date-utils";

export interface CourseCustomerListFilterRow {
  id: string;
  name: string;
  phone: string;
  lineName: string | null;
  lineLinkStatus: string;
  customerStage: string;
  lastVisitAt: Date | null;
  createdAt: Date;
  sponsoredCount: number;
  assignedStaff: { id: string } | null;
  userStatus: string | null;
}

// Only course attendance and course point availability are supplied here.
// Shared cards remain shared balances; totals across customers must not be summed.
export function filterCourseCustomers<T extends CourseCustomerListFilterRow>(
  rows: T[], params: URLSearchParams, availablePoints: ReadonlyMap<string, number>, now = new Date(),
): T[] {
  const search = (params.get("search") ?? "").trim().toLocaleLowerCase();
  const status = params.get("status");
  const visit = params.get("visit");
  const referral = params.get("referral");
  const staff = params.get("staff");
  const { start, end } = monthRange(toLocalMonthStr(now));
  const stale = now.getTime() - 30 * 86400000;
  return rows.filter(row => {
    const last = row.lastVisitAt ? new Date(row.lastVisitAt).getTime() : null;
    return (!search || `${row.name} ${row.phone} ${row.lineName ?? ""}`.toLocaleLowerCase().includes(search))
      && (status !== "linked" || row.lineLinkStatus === "LINKED")
      && (status !== "unlinked" || row.lineLinkStatus !== "LINKED")
      && (status !== "lead" || row.customerStage === "LEAD")
      && (status !== "customer" || row.customerStage !== "LEAD")
      && (visit !== "month" || (last !== null && last >= start.getTime() && last <= end.getTime()))
      && (visit !== "stale30" || (last !== null && last < stale))
      && (visit !== "never" || last === null)
      && (referral !== "has" || row.sponsoredCount > 0)
      && (referral !== "none" || row.sponsoredCount === 0)
      && (!staff || row.assignedStaff?.id === staff);
  }).sort((a, b) => {
    const inactive = Number(a.userStatus === "SUSPENDED") - Number(b.userStatus === "SUSPENDED");
    if (inactive) return inactive;
    const sort = params.get("sort");
    const delta = sort === "points"
      ? (availablePoints.get(b.id) ?? 0) - (availablePoints.get(a.id) ?? 0)
      : sort === "created"
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : (b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0) - (a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0);
    return delta || a.name.localeCompare(b.name, "zh-TW") || a.id.localeCompare(b.id);
  });
}
