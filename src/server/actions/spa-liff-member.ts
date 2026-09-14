"use server";

import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { requireSession } from "@/lib/session";
import { requireSpaStore } from "@/lib/industry-module-server";
import { splitLiffBookings } from "@/lib/liff/my-bookings";
import { splitLiffWallets } from "@/lib/liff/my-wallets";
import { resolveCentralMemberCustomerForStore } from "@/server/services/central-member-resolver";
import { resolveMemberRequestStoreId } from "@/server/services/member-request-store";
import type { LiffBookingRow } from "@/server/actions/liff-my-bookings";
import type {
  LiffMakeupCreditRow,
  LiffWalletRow,
} from "@/server/actions/liff-my-wallets";

type SpaMemberContext = { storeId: string; customerId: string };

async function resolveSpaMemberContext(): Promise<SpaMemberContext | null> {
  let user;
  try {
    user = await requireSession();
  } catch {
    return null;
  }

  const storeId = await resolveMemberRequestStoreId(user.storeId ?? null);
  if (!storeId) return null;
  await requireSpaStore(storeId);

  // A fixed, verified user-to-customer membership is the authorization source.
  // Name and phone are deliberately not used to infer access.
  const membership = await resolveCentralMemberCustomerForStore(user.id, storeId);
  if (!membership) return null;
  return { storeId, customerId: membership.customerId };
}

export type SpaLiffBookingRow = LiffBookingRow & {
  endTime: string;
  serviceName: string;
  staffName: string;
  locationName: string;
};

export type FetchSpaLiffBookingsResult =
  | { status: "ok"; upcoming: SpaLiffBookingRow[]; history: SpaLiffBookingRow[] }
  | { status: "no_customer" }
  | { status: "service_unavailable" };

export async function fetchSpaLiffBookings(): Promise<FetchSpaLiffBookingsResult> {
  try {
    const context = await resolveSpaMemberContext();
    if (!context) return { status: "no_customer" };

    const bookings = await spaPrisma.spaBooking.findMany({
      where: {
        storeId: context.storeId,
        customerId: context.customerId,
      },
      select: {
        id: true,
        bookingDate: true,
        startTime: true,
        endTime: true,
        status: true,
        serviceStaffId: true,
        serviceNameSnapshot: true,
        people: true,
        serviceLocation: { select: { name: true } },
        items: {
          select: { treatmentNameSnapshot: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ bookingDate: "desc" }, { startTime: "asc" }],
      take: 50,
    });

    const staff = await prisma.staff.findMany({
      where: {
        storeId: context.storeId,
        id: { in: [...new Set(bookings.map((booking) => booking.serviceStaffId))] },
      },
      select: { id: true, displayName: true },
    });
    const staffNames = new Map(staff.map((person) => [person.id, person.displayName]));

    const normalized = bookings.map((booking) => ({
      ...booking,
      slotTime: booking.startTime,
      bookingStatus: booking.status,
    }));
    const { upcoming, history } = splitLiffBookings(normalized);
    upcoming.reverse();

    const toRow = (booking: (typeof normalized)[number]): SpaLiffBookingRow => ({
      id: booking.id,
      bookingDate: booking.bookingDate.toISOString().slice(0, 10),
      slotTime: booking.startTime,
      endTime: booking.endTime,
      bookingStatus: booking.status,
      bookingType: "SPA_SERVICE",
      isMakeup: false,
      people: booking.people,
      serviceName:
        booking.items.map((item) => item.treatmentNameSnapshot).filter(Boolean).join("、") ||
        booking.serviceNameSnapshot ||
        "服務項目",
      staffName: staffNames.get(booking.serviceStaffId) ?? "待確認人員",
      locationName: booking.serviceLocation?.name ?? "待安排位置",
    });

    return {
      status: "ok",
      upcoming: upcoming.map(toRow),
      history: history.map(toRow),
    };
  } catch (error) {
    console.error("[fetchSpaLiffBookings] failed", error);
    return { status: "service_unavailable" };
  }
}

export type FetchSpaLiffEntitlementsResult =
  | {
      status: "ok";
      active: LiffWalletRow[];
      expired: LiffWalletRow[];
      history: LiffWalletRow[];
      makeupCredits: LiffMakeupCreditRow[];
    }
  | { status: "no_customer" }
  | { status: "service_unavailable" };

export async function fetchSpaLiffEntitlements(): Promise<FetchSpaLiffEntitlementsResult> {
  try {
    const context = await resolveSpaMemberContext();
    if (!context) return { status: "no_customer" };

    const entitlements = await spaPrisma.spaEntitlement.findMany({
      where: {
        storeId: context.storeId,
        customerId: context.customerId,
      },
      select: {
        id: true,
        nameSnapshot: true,
        totalUses: true,
        remainingUses: true,
        startDate: true,
        expiryDate: true,
        status: true,
        uses: {
          select: { uses: true, status: true },
        },
      },
      orderBy: [
        { expiryDate: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: 100,
    });

    const rows: LiffWalletRow[] = entitlements.map((entitlement) => {
      const pendingCount = entitlement.uses
        .filter((use) => use.status === "RESERVED")
        .reduce((sum, use) => sum + use.uses, 0);
      return {
        id: entitlement.id,
        planName: entitlement.nameSnapshot,
        planCategory: "PACKAGE",
        totalSessions: entitlement.totalUses,
        remainingSessions: entitlement.remainingUses,
        availableToBook: Math.max(0, entitlement.remainingUses - pendingCount),
        pendingCount,
        usedCount: Math.max(0, entitlement.totalUses - entitlement.remainingUses),
        voidedCount: 0,
        startDate: entitlement.startDate.toISOString().slice(0, 10),
        expiryDate: entitlement.expiryDate?.toISOString().slice(0, 10) ?? null,
        status: entitlement.status,
      };
    });
    const { active, expired, history } = splitLiffWallets(rows);
    return { status: "ok", active, expired, history, makeupCredits: [] };
  } catch (error) {
    console.error("[fetchSpaLiffEntitlements] failed", error);
    return { status: "service_unavailable" };
  }
}
