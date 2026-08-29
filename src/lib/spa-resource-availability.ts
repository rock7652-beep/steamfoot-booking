import type { SpaDemoResourceType } from "@/lib/spa-demo-catalog";

function timeToMinutes(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export type SpaOccupiedResourceRange = {
  startTime: string;
  durationMinutes: number;
  resourceType: SpaDemoResourceType;
};

export function isSpaResourceAvailable({
  startTime,
  durationMinutes,
  resourceType,
  capacity,
  occupiedRanges,
}: {
  startTime: string;
  durationMinutes: number;
  resourceType: SpaDemoResourceType;
  capacity: number;
  occupiedRanges: readonly SpaOccupiedResourceRange[];
}) {
  if (capacity < 1) return false;
  const requestedStart = timeToMinutes(startTime);
  const requestedEnd = requestedStart + durationMinutes;
  const matching = occupiedRanges.filter((range) => range.resourceType === resourceType);

  for (let minute = requestedStart; minute < requestedEnd; minute += 1) {
    const used = matching.filter((range) => {
      const rangeStart = timeToMinutes(range.startTime);
      const rangeEnd = rangeStart + range.durationMinutes;
      return minute >= rangeStart && minute < rangeEnd;
    }).length;
    if (used >= capacity) return false;
  }
  return true;
}
