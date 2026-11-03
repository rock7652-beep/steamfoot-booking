import type { PersistedIndustryModule } from "@/lib/industry-modules";

export function buildInitialBusinessHours(
  storeId: string,
  industryModule: PersistedIndustryModule,
) {
  if (industryModule === "SPA") throw new Error("SPA 模組已移除");
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    storeId,
    dayOfWeek,
    isOpen: true,
    openTime: "10:00",
    closeTime: "21:00",
    slotInterval: 60,
    defaultCapacity: 6,
  }));
}

export function buildSteamfootBookingSlots(storeId: string) {
  const slotTimes = [
    "10:00",
    "11:00",
    "14:00",
    "15:00",
    "16:00",
    "17:30",
    "18:30",
    "19:30",
  ];
  return Array.from({ length: 7 }, (_, dayOfWeek) =>
    slotTimes.map((startTime) => ({
      storeId,
      dayOfWeek,
      startTime,
      capacity: 6,
      isEnabled: true,
    })),
  ).flat();
}
