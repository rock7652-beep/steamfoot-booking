import { CustomerLabelsSeed } from "@/components/customer-labels";
import { customerLabelSnapshot } from "@/server/services/customer-label-snapshot";
import { customerLabelFilterIds } from "@/server/services/customer-label-filter";
import { prisma } from "@/lib/db";
import { spaCustomerSummaries } from "@/server/queries/spa-customer-summary";
import { SpaCustomersWorkspace } from "./spa-customers-workspace";
export type SpaCustomerPermissions = {
  canSell: boolean;
  canRefund: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canBook: boolean;
  canReadBookings: boolean;
  canReadAccounts: boolean;
  canManageStaff: boolean;
};
export async function SpaCustomers({
  storeId,
  search,
  labelId,
  ...permissions
}: { storeId: string; search: string; labelId?: string } & SpaCustomerPermissions) {
  const labelIds=await customerLabelFilterIds(storeId,labelId);
  const customers = await prisma.customer.findMany({
    where: {
      storeId,
      ...(labelIds===null ? {} : {id:{in:labelIds}}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, phone: true, serviceNote: true },
    orderBy: { name: "asc" },
    take: 100,
  });
  const summaries = await spaCustomerSummaries(
    storeId,
    customers.map((c) => c.id),
    permissions.canReadBookings,
    permissions.canReadAccounts,
  );
  const rows = customers.map((c) => ({
    ...c,
    lastVisit:
      summaries.visits.find((v) => v.customerId === c.id)?.lastVisit ?? null,
    nextVisit:
      summaries.visits.find((v) => v.customerId === c.id)?.nextVisit ?? null,
    packages: summaries.credits
      .filter((p) => p.customerId === c.id)
      .map((p) => ({ name: p.name, available: p.available, expiry: p.expiry })),
    balance: permissions.canReadAccounts
      ? Number(
          summaries.wallets.find((w) => w.customerId === c.id)?.balance ?? 0,
        )
      : null,
  }));
  const labels = await customerLabelSnapshot(rows.map(c=>c.id));
  return (
    <CustomerLabelsSeed initial={labels}><SpaCustomersWorkspace
      key={storeId}
      customers={rows}
      search={search}
      {...permissions}
    /></CustomerLabelsSeed>
  );
}
