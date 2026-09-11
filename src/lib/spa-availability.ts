export type SpaAvailabilityRange = { startTime: string; endTime: string };
export type SpaAvailabilityException = {
  type: "UNAVAILABLE" | "AVAILABLE";
  startTime: string | null;
  endTime: string | null;
};

export function calculateSpaProviderStartTimes(input: {
  candidateStartTimes: readonly string[];
  businessCloseTime: string;
  serviceMinutes: number;
  bufferMinutes: number;
  requiredSkillKeys: readonly string[];
  providerSkillKeys: readonly string[];
  weeklyRanges: readonly SpaAvailabilityRange[];
  exceptions: readonly SpaAvailabilityException[];
  occupiedRanges: readonly { startTime: string; durationMinutes: number }[];
}): string[] {
  const skills = new Set(input.providerSkillKeys);
  if (!input.requiredSkillKeys.every((skill) => skills.has(skill))) return [];

  if (input.exceptions.some((exception) => exception.type === "UNAVAILABLE" && !exception.startTime && !exception.endTime)) return [];
  const workingRanges = [
    ...input.weeklyRanges,
    ...input.exceptions
      .filter((exception) => exception.type === "AVAILABLE" && exception.startTime && exception.endTime)
      .map((exception) => ({ startTime: exception.startTime!, endTime: exception.endTime! })),
  ];
  const unavailableRanges = input.exceptions
    .filter((exception) => exception.type === "UNAVAILABLE" && exception.startTime && exception.endTime)
    .map((exception) => ({ startTime: exception.startTime!, endTime: exception.endTime! }));
  const occupiedMinutes = input.serviceMinutes + input.bufferMinutes;

  return input.candidateStartTimes.filter((startTime) => {
    const start = toMinutes(startTime);
    const end = start + occupiedMinutes;
    if (end > toMinutes(input.businessCloseTime)) return false;
    if (!workingRanges.some((range) => start >= toMinutes(range.startTime) && end <= toMinutes(range.endTime))) return false;
    if (unavailableRanges.some((range) => overlaps(start, end, toMinutes(range.startTime), toMinutes(range.endTime)))) return false;
    return input.occupiedRanges.every((range) => !overlaps(start, end, toMinutes(range.startTime), toMinutes(range.startTime) + range.durationMinutes));
  });
}

function overlaps(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
