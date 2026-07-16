import { monthRange, toLocalMonthStr } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/feature-flags";
import { requireStoreFeature } from "@/lib/feature-gate";
import { requirePermission } from "@/lib/permissions";

export async function getGoogleReviewOverview(month = toLocalMonthStr()) {
  const user = await requirePermission("customer.read");
  if (!user.storeId) throw new Error("使用者未綁定店別");
  await requireStoreFeature(user.storeId, FEATURES.GOOGLE_REVIEW);
  const storeId = user.storeId;
  const { start, end } = monthRange(month);

  const [invitedCount, clickedCount, uninvitedBookings, recentInvites] = await Promise.all([
    prisma.googleReviewInvite.count({
      where: { storeId, invitedAt: { gte: start, lte: end } },
    }),
    prisma.googleReviewInvite.count({
      where: { storeId, clickedAt: { gte: start, lte: end } },
    }),
    prisma.booking.findMany({
      where: { storeId, bookingStatus: "COMPLETED", googleReviewInvite: null },
      orderBy: [{ bookingDate: "desc" }, { slotTime: "desc" }],
      take: 50,
      select: {
        id: true,
        bookingDate: true,
        slotTime: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.googleReviewInvite.findMany({
      where: { storeId },
      orderBy: { invitedAt: "desc" },
      take: 20,
      select: {
        id: true,
        invitedAt: true,
        clickedAt: true,
        source: true,
        bookingId: true,
        customer: { select: { id: true, name: true, phone: true } },
        staff: { select: { id: true, displayName: true } },
      },
    }),
  ]);

  return {
    month,
    summary: { invitedCount, clickedCount },
    uninvitedBookings,
    recentInvites,
  };
}
