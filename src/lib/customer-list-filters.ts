import type { CustomerStage, Prisma } from "@prisma/client";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";

/** Shared by the customer list and its autocomplete index. */
export function customerListFilterWhere(filters: {
  stage?: CustomerStage;
  status?: string | null;
  visit?: string | null;
  referral?: string | null;
  assignedStaffId?: string | null;
}): Prisma.CustomerWhereInput {
  const { stage, status, visit, referral, assignedStaffId } = filters;
  return {
    ...(stage ? { customerStage: stage } : {}),
    ...(assignedStaffId ? { assignedStaffId } : {}),
    ...(status === "linked" ? { lineLinkStatus: "LINKED" as const }
      : status === "unlinked" ? { lineLinkStatus: { not: "LINKED" as const } }
      : status === "lead" ? { customerStage: "LEAD" as const }
      : status === "customer" ? { customerStage: { not: "LEAD" as const } } : {}),
    ...(visit === "month" ? { lastVisitAt: { gte: monthRange(toLocalMonthStr()).start } }
      : visit === "stale30" ? { lastVisitAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
      : visit === "never" ? { lastVisitAt: null } : {}),
    ...(referral === "has" ? { sponsoredCustomers: { some: {} } }
      : referral === "none" ? { sponsoredCustomers: { none: {} } } : {}),
  };
}
