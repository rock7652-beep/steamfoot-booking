import "server-only";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { bookingDateToday, monthRange, toLocalDateStr } from "@/lib/date-utils";

/** SPA signals never read Steamfoot bookings, transactions or plan wallets. */
export async function getSpaCustomerCare(storeId: string, month: string, staffScope: string | null = null) {
  const customers = await prisma.customer.findMany({ where: { storeId, ...(staffScope ? { assignedStaffId: staffScope } : {}), mergedIntoCustomerId: null, NOT: { user: { is: { status: "SUSPENDED" } } } }, select: { id: true, name: true, phone: true, assignedStaff: { select: { displayName: true } } } });
  const ids = customers.map(c => c.id);
  if (!ids.length) return [];
  const today = bookingDateToday();
  const [plans, visits, trials, convertedPlans, balances] = await Promise.all([
    spaPrisma.spaEntitlement.findMany({ where: { storeId, customerId: { in: ids }, status: "ACTIVE", remainingUses: { gt: 0 }, startDate: { lte: today }, OR: [{ expiryDate: null }, { expiryDate: { gte: today } }] }, select: { customerId: true, remainingUses: true, expiryDate: true, nameSnapshot: true } }),
    spaPrisma.spaBooking.groupBy({ by: ["customerId"], where: { storeId, customerId: { in: ids }, status: "COMPLETED" }, _max: { bookingDate: true } }),
    spaPrisma.spaBooking.findMany({ where: { storeId, customerId: { in: ids }, status: "COMPLETED", isTrial: true, bookingDate: { gte: new Date(`${month}-01T00:00:00.000Z`), lt: monthRange(month).end } }, select: { customerId: true } }),
    spaPrisma.spaEntitlement.findMany({ where: { storeId, customerId: { in: ids }, status: { not: "VOIDED" } }, select: { customerId: true } }),
    spaPrisma.spaStoredValueWallet.findMany({ where: { storeId, customerId: { in: ids }, status: "ACTIVE", balance: { gt: 0 } }, select: { customerId: true } }),
  ]);
  const converted = new Set([...convertedPlans, ...balances].map(c => c.customerId));
  const trialIds = new Set(trials.map(t => t.customerId));
  const visitMap = new Map(visits.map(v => [v.customerId, v._max.bookingDate]));
  const todayDate = new Date(`${toLocalDateStr()}T00:00:00.000Z`).getTime();
  return customers.map(c => {
    const cards = plans.filter(p => p.customerId === c.id);
    const remaining = cards.reduce((sum, card) => sum + card.remainingUses, 0);
    const visit = visitMap.get(c.id);
    const daysSinceVisit = visit ? Math.floor((todayDate - visit.getTime()) / 86400000) : null;
    const expiring = cards.filter(card => card.expiryDate && (card.expiryDate.getTime() - todayDate) / 86400000 <= 14);
    return { ...c, remaining, cards, expiring, daysSinceVisit, inactive: daysSinceVisit !== null && daysSinceVisit > 30 && (remaining > 0 || balances.some(w => w.customerId === c.id)), low: remaining > 0 && remaining <= 3, trial: trialIds.has(c.id) && !converted.has(c.id) };
  });
}
