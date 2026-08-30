import { parseLocalDate } from "@/lib/date-utils";
import type { SpaProviderSpecialty, SpaTimeRange } from "@/lib/spa-scheduling";
import { rangesOverlap } from "@/lib/spa-scheduling";

export type SpaWeeklyAvailability = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type SpaAvailabilityException = {
  date: string;
  type: "AVAILABLE" | "UNAVAILABLE";
  startTime: string | null;
  endTime: string | null;
};

export type SpaDatedOccupiedRange = SpaTimeRange & { date: string };

export type SpaBookableProvider = {
  id: string;
  label: string;
  specialties: readonly SpaProviderSpecialty[];
  weeklyAvailability: readonly SpaWeeklyAvailability[];
  availabilityExceptions: readonly SpaAvailabilityException[];
  occupiedRanges: readonly SpaDatedOccupiedRange[];
};

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isSpaProviderAvailable({
  provider,
  date,
  startTime,
  serviceMinutes,
  bufferMinutes = 30,
}: {
  provider: SpaBookableProvider;
  date: string;
  startTime: string;
  serviceMinutes: number;
  bufferMinutes?: number;
}): boolean {
  const exceptions = provider.availabilityExceptions.filter((item) => item.date === date);
  if (exceptions.some((item) => item.type === "UNAVAILABLE")) return false;

  const dayOfWeek = parseLocalDate(date).getDay();
  const workingRanges = [
    ...provider.weeklyAvailability.filter((item) => item.dayOfWeek === dayOfWeek),
    ...exceptions
      .filter((item) => item.type === "AVAILABLE" && item.startTime && item.endTime)
      .map((item) => ({
        dayOfWeek,
        startTime: item.startTime!,
        endTime: item.endTime!,
      })),
  ];
  const requestedRange = { startTime, durationMinutes: serviceMinutes + bufferMinutes };
  const requestedStart = timeToMinutes(startTime);
  const requestedEnd = requestedStart + requestedRange.durationMinutes;
  const fitsWorkingRange = workingRanges.some((range) => (
    requestedStart >= timeToMinutes(range.startTime)
    && requestedEnd <= timeToMinutes(range.endTime)
  ));
  if (!fitsWorkingRange) return false;

  return provider.occupiedRanges
    .filter((range) => range.date === date)
    .every((range) => !rangesOverlap(requestedRange, range));
}

export function createHalfHourTimeOptions(): readonly string[] {
  return Array.from({ length: 48 }, (_, index) => {
    const hours = Math.floor(index / 2);
    const minutes = index % 2 === 0 ? "00" : "30";
    return `${String(hours).padStart(2, "0")}:${minutes}`;
  });
}
