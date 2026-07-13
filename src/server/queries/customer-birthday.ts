import { prisma } from "@/lib/db";

export type BirthdayCustomer = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  birthday: Date;
  assignedStaffName: string | null;
  lastFollowUp: {
    createdAt: Date;
    createdByName: string;
  } | null;
};

/**
 * 指定店舖的本月生日顧客。
 * birthday 是 @db.Date，使用 UTC month/day 讀取不會受時區跨日影響。
 */
export async function getBirthdayCustomersForMonth(
  storeId: string,
  month: string,
): Promise<BirthdayCustomer[]> {
  const monthNumber = Number(month.slice(5, 7));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];

  const customers = await prisma.customer.findMany({
    where: {
      storeId,
      birthday: { not: null },
      mergedIntoCustomerId: null,
      NOT: { user: { is: { status: "SUSPENDED" } } },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      birthday: true,
      assignedStaff: { select: { displayName: true } },
      followUps: {
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, createdBy: { select: { name: true } } },
      },
    },
  });

  return customers
    .filter(
      (customer): customer is typeof customer & { birthday: Date } =>
        customer.birthday !== null && customer.birthday.getUTCMonth() + 1 === monthNumber,
    )
    .map((customer) => {
      const followUp = customer.followUps[0];
      return {
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        birthday: customer.birthday,
        assignedStaffName: customer.assignedStaff?.displayName ?? null,
        lastFollowUp: followUp
          ? { createdAt: followUp.createdAt, createdByName: followUp.createdBy.name }
          : null,
      };
    })
    .sort((a, b) => a.birthday.getUTCDate() - b.birthday.getUTCDate());
}
