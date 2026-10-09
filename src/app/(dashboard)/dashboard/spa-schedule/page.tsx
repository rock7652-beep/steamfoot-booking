import { requireDashboardCoreFeature } from "@/lib/dashboard-core-feature";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/desktop";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { validSpaDate } from "@/lib/spa-scheduling";
import { SpaScheduleWorkspace } from "./workspace";
import { toLocalDateStr } from "@/lib/date-utils";
import { requireSpaStore } from "@/lib/industry-module-server";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreContext } from "@/lib/store-context";
import { getSpaScheduleForDay } from "@/server/queries/spa-schedule";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";

type PageProps = { searchParams: Promise<{ date?: string; customerId?: string; new?: string }> };

/** SPA schedule is intentionally backed only by SpaBooking. */
export default async function SpaSchedulePage({ searchParams }: PageProps) {
  await requireDashboardCoreFeature("basic_booking");
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) redirect("/dashboard");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) redirect("/dashboard");
  await requireSpaStore(storeId).catch(() => redirect("/dashboard/bookings"));
  const isViewMode = (await resolveStoreViewContextFromCookie(user))?.isViewMode ?? false;
  // Match SPA customer management: HQ selection permits reads only.
  const writeContext = isViewMode ? null : await getStoreContext();
  const canWrite = !isViewMode && writeContext?.storeId === storeId;
  const canReadCustomerNotes = await checkPermission(user.role, user.staffId, "customer.read");

  const { date: requestedDate, customerId, new: openNew } = await searchParams;
  const date = requestedDate && validSpaDate(requestedDate) ? requestedDate : toLocalDateStr();
  const [bookings, staff, customers, treatments, locations, canCreate, canUpdate,canCheckout,canCreateCustomer] = await Promise.all([
    getSpaScheduleForDay(storeId, date),
    prisma.staff.findMany({ where: { storeId, status: "ACTIVE" }, select: { id: true, displayName: true, colorCode: true }, orderBy: { displayName: "asc" } }),
    prisma.customer.findMany({ where: { storeId }, select: { id: true, name: true, phone: true, serviceNote: canReadCustomerNotes }, orderBy: { name: "asc" } }),
    spaPrisma.spaTreatment.findMany({ where: { storeId, isActive: true }, include: { serviceLocations: true }, orderBy: { sortOrder: "asc" } }),
    spaPrisma.spaServiceLocation.findMany({ where: { storeId, isActive: true }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    canWrite ? checkPermission(user.role, user.staffId, "booking.create") : Promise.resolve(false),
    canWrite ? checkPermission(user.role, user.staffId, "booking.update") : Promise.resolve(false),
    canWrite ? checkPermission(user.role, user.staffId, "transaction.create") : Promise.resolve(false),
    canWrite ? checkPermission(user.role, user.staffId, "customer.create") : Promise.resolve(false),
  ]);
  return <PageShell className="max-w-none px-4 py-6">
    <SpaScheduleWorkspace key={`${storeId}:${date}:${customerId??""}:${openNew??""}`} storeId={storeId} initialCustomerId={openNew==="1"&&canCreate&&customers.some(c=>c.id===customerId)?customerId:undefined} date={date} bookings={bookings} staff={staff.map(s => ({ id: s.id, name: s.displayName, colorCode: s.colorCode }))} customers={customers}
      locations={locations} canCreateCustomer={canCreateCustomer} canCreate={canCreate} canUpdate={canUpdate} canCheckout={canCheckout&&canUpdate}
      treatments={treatments.map(t => ({ id: t.id, name: t.name, price: Number(t.price), serviceMinutes: t.serviceMinutes,
        bufferMinutes: t.bufferMinutes, locationIds: t.serviceLocations.map(l => l.serviceLocationId) }))} />
  </PageShell>;
}
