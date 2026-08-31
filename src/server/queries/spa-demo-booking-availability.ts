import "server-only";

import { prisma } from "@/lib/db";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import type { SpaBookableProvider } from "@/lib/spa-provider-availability";
import { SPA_DEMO_PROVIDERS, SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import type { SpaProviderSpecialty } from "@/lib/spa-scheduling";

const SPECIALTY_BY_SKILL_ID: Record<string, SpaProviderSpecialty> = {
  "spa-demo-skill-body": "body",
  "spa-demo-skill-head": "head",
  "spa-demo-skill-foot": "foot",
  "spa-demo-skill-face": "face",
};

export async function getSpaDemoBookableProviders({
  startDate,
  endDate,
  excludeBookingIds,
}: {
  startDate: string;
  endDate: string;
  excludeBookingIds?: readonly string[];
}): Promise<readonly SpaBookableProvider[]> {
  const [staff, bookings] = await Promise.all([
    prisma.staff.findMany({
      where: {
        storeId: SPA_DEMO_STORE.id,
        status: "ACTIVE",
        isOwner: false,
      },
      select: {
        id: true,
        displayName: true,
        skills: {
          where: { storeId: SPA_DEMO_STORE.id, skill: { isActive: true } },
          select: { skillId: true },
        },
        weeklyAvailabilities: {
          where: { storeId: SPA_DEMO_STORE.id, isActive: true },
          select: { dayOfWeek: true, startTime: true, endTime: true },
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        },
        availabilityExceptions: {
          where: {
            storeId: SPA_DEMO_STORE.id,
            date: {
              gte: parseTaiwanDateToDbDate(startDate),
              lte: parseTaiwanDateToDbDate(endDate),
            },
          },
          select: { date: true, type: true, startTime: true, endTime: true },
          orderBy: { date: "asc" },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
    prisma.booking.findMany({
      where: {
        id: excludeBookingIds?.length ? { notIn: [...excludeBookingIds] } : undefined,
        storeId: SPA_DEMO_STORE.id,
        serviceStaffId: { not: null },
        bookingDate: {
          gte: parseTaiwanDateToDbDate(startDate),
          lte: parseTaiwanDateToDbDate(endDate),
        },
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      },
      select: {
        serviceStaffId: true,
        bookingDate: true,
        slotTime: true,
        treatmentServiceMinutesSnapshot: true,
        treatmentBufferMinutesSnapshot: true,
      },
    }),
  ]);

  return staff.map((person) => ({
    id: person.id,
    label: person.displayName,
    specialties: person.skills
      .map((record) => SPECIALTY_BY_SKILL_ID[record.skillId])
      .filter((specialty): specialty is SpaProviderSpecialty => Boolean(specialty)),
    weeklyAvailability: person.weeklyAvailabilities,
    availabilityExceptions: person.availabilityExceptions.map((exception) => ({
      date: toLocalDateStr(exception.date),
      type: exception.type,
      startTime: exception.startTime,
      endTime: exception.endTime,
    })),
    occupiedRanges: bookings
      .filter((booking) => booking.serviceStaffId === person.id)
      .map((booking) => ({
        date: toLocalDateStr(booking.bookingDate),
        startTime: booking.slotTime,
        durationMinutes:
          (booking.treatmentServiceMinutesSnapshot ?? 90)
          + (booking.treatmentBufferMinutesSnapshot ?? 0),
      })),
  }));
}

export function getSpaDemoFixtureBookableProviders(): readonly SpaBookableProvider[] {
  return SPA_DEMO_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: `${provider.badge}號 ${provider.name}`,
    specialties: provider.specialtyKeys,
    weeklyAvailability: provider.weeklyAvailability,
    availabilityExceptions: provider.scheduleExceptions.map((exception) => ({
      date: exception.date,
      type: exception.tone === "leave" ? "UNAVAILABLE" as const : "AVAILABLE" as const,
      startTime: exception.startTime ?? null,
      endTime: exception.endTime ?? null,
    })),
    occupiedRanges: [],
  }));
}
