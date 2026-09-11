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
};
export async function SpaCustomers({
  storeId,
  search,
  ...permissions
}: { storeId: string; search: string } & SpaCustomerPermissions) {
  const customers = await prisma.customer.findMany({
    where: {
      storeId,
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
  return (
    <SpaCustomersWorkspace
      key={storeId}
      customers={rows}
      search={search}
      {...permissions}
    />
  );
}
