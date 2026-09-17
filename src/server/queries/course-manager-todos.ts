import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { requireCourseStore } from "@/lib/industry-module-server";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";

/** Same daily digest window as the mature service, using class time in Taipei. */
export async function getCourseManagerTodoCounts(storeId: string, now: Date) {
  await requireCourseStore(storeId);
  const yesterday = toLocalDateStr(new Date(dayRange(toLocalDateStr(now)).start.getTime() - 1));
  const range = dayRange(yesterday);
  const [pendingPaymentCount, incompleteServiceCount] = await Promise.all([
    coursePrisma.coursePurchase.count({ where: { storeId, status: "PENDING" } }),
    coursePrisma.courseBooking.count({ where: { storeId, status: "RESERVED", session: { storeId, cancelledAt: null, startsAt: { gte: range.start, lte: range.end } } } }),
  ]);
  return { pendingPaymentCount, incompleteServiceCount };
}

/** Preserve the mature one-hour post-service grace period, using the actual class end. */
export async function getIncompleteCourseCandidates(now: Date) {
  const candidates = await prisma.store.findMany({ where: { industryModule: "COURSE", isDemo: false, operatingStatus: { in: ["ACTIVE", "TRIAL"] } }, select: { id: true, slug: true } });
  const eligible = await Promise.all(candidates.map(store => hasStoreFeature(store.id, FEATURES.LINE_REMINDER)));
  const stores = candidates.filter((_, index) => eligible[index]);
  if (!stores.length) return [];
  const today = dayRange(toLocalDateStr(now)).start;
  const earliest = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
  const dueEnd = new Date(now.getTime() - 60 * 60 * 1000);
  const bookings = await coursePrisma.courseBooking.findMany({
    where: { storeId: { in: stores.map(store => store.id) }, status: "RESERVED", session: { cancelledAt: null, startsAt: { gte: earliest }, endsAt: { lte: dueEnd } } },
    select: { id: true, storeId: true, sessionId: true, customerName: true, session: { select: { startsAt: true, endsAt: true } } },
    orderBy: { session: { startsAt: "asc" } }, take: 300,
  });
  return bookings.map(booking => ({ ...booking, storeSlug: stores.find(store => store.id === booking.storeId)!.slug }));
}

export async function isCourseBookingStillIncomplete(storeId: string, id: string, now: Date) {
  return coursePrisma.courseBooking.findFirst({ where: { id, storeId, status: "RESERVED", session: { storeId, cancelledAt: null, endsAt: { lte: new Date(now.getTime() - 60 * 60 * 1000) } } }, select: { id: true } });
}
