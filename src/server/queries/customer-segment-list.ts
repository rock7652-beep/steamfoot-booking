import { prisma } from "@/lib/db";

export type CustomerSegmentCustomer = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  assignedStaffName: string | null;
  lastFollowUp: {
    createdAt: Date;
    createdByName: string;
  } | null;
};

/**
 * KPI customerId selection 共用的顧客顯示資料 hydration。
 * 商業條件由各 KPI selection 決定；本 helper 不重新判斷名單資格。
 */
export async function hydrateCustomerSegment(
  storeId: string,
  customerIds: Iterable<string>,
): Promise<CustomerSegmentCustomer[]> {
  const ids = [...new Set(customerIds)];
  if (ids.length === 0) return [];

  const customers = await prisma.customer.findMany({
    where: { storeId, id: { in: ids } },
    select: {
      id: true,
      name: true,
      phone: true,
      assignedStaff: { select: { displayName: true } },
      followUps: {
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, createdBy: { select: { name: true } } },
      },
    },
  });

  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  return ids.flatMap((customerId) => {
    const customer = byId.get(customerId);
    if (!customer) return [];
    const followUp = customer.followUps[0];
    return [{
      customerId,
      customerName: customer.name ?? "(未命名)",
      customerPhone: customer.phone,
      assignedStaffName: customer.assignedStaff?.displayName ?? null,
      lastFollowUp: followUp
        ? { createdAt: followUp.createdAt, createdByName: followUp.createdBy.name }
        : null,
    }];
  });
}
