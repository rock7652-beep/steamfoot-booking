import { PageShell, PageHeader } from "@/components/desktop";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { checkPermission } from "@/lib/permissions";
import { toLocalDateStr } from "@/lib/date-utils";
import { resolveCourseBusinessProfile } from "@/lib/store-business-profile";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { readCourseOrders } from "@/server/services/course-display-order";
import type { getCurrentUser } from "@/lib/session";
import { CourseWorkspace } from "./workspace";

type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
/** Parent page checks booking.read, feature access and the active module first. */
async function readRoomsPage(storeId: string, user: User) {
  const started = performance.now();
  const [rooms, entitlements, canCreate, canEdit, orders, viewContext] = await Promise.all([
    coursePrisma.courseRoom.findMany({ where: { storeId }, select: {
      id: true, name: true, category: true, isActive: true, capacity: true,
      details: true, equipment: true, location: true, rentalEnabled: true,
      rentalHourlyRate: true, rentalBufferMinutes: true,
      sessions: { where: { cancelledAt: null, endsAt: { gt: new Date() } },
        select: { id: true, nameSnapshot: true, startsAt: true }, orderBy: { startsAt: "asc" }, take: 20 },
    }, orderBy: { name: "asc" } }),
    prisma.storeFeatureEntitlement.findMany({ where: { storeId, status: "ENABLED" }, select: { featureKey: true } }),
    checkPermission(user.role, user.staffId, "booking.create"),
    checkPermission(user.role, user.staffId, "booking.update"),
    readCourseOrders(storeId),
    resolveStoreViewContextFromCookie(user),
  ]);
  const businessProfile = resolveCourseBusinessProfile(entitlements.map(item => item.featureKey));
  const writable = (user.role === "ADMIN" || user.storeId === storeId) && !viewContext?.isViewMode;
  console.info("[COURSE_ROOMS_READ_PERF]", { queryMs: Math.round(performance.now() - started), roomCount: rooms.length });
  return { rooms, businessProfile, writable, canCreate, canEdit, orders, viewContext };
}
export async function CourseRoomsPage({ storeId, user }: { storeId: string; user: User }) {
  const { rooms, businessProfile, writable, canCreate, canEdit, orders, viewContext } = await readRoomsPage(storeId, user);
  return <PageShell className="course-workspace mx-auto flex max-w-[1440px] flex-col gap-1 px-6 py-1">
    <PageHeader title="空間管理" subtitle={businessProfile === "MUSIC" ? "管理上課教室" : undefined} />
    <CourseWorkspace key={`${storeId}:rooms`} storeId={storeId} view="rooms"
      selectedDate={toLocalDateStr()} today={toLocalDateStr()} nowIso={new Date().toISOString()}
      calendarDays={{}} staffAvailability={[]} staffAvailabilityExceptions={[]}
      rooms={rooms.map(({ sessions, ...room }) => ({ ...room, uses: sessions.map(item => ({ ...item, startsAt: item.startsAt.toISOString() })) }))}
      templates={[]} sessions={[]} coaches={[]} cancelledBookings={[]}
      displayOrder={orders.room} canCreate={canCreate && writable} canEdit={canEdit && writable}
      canDelete={user.role === "OWNER" && !viewContext?.isViewMode} businessProfile={businessProfile} />
  </PageShell>;
}
