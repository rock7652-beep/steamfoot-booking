import type { PersistedIndustryModule } from "@/lib/industry-modules";

export function buildInitialBusinessHours(
  storeId: string,
  industryModule: PersistedIndustryModule,
) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    storeId,
    dayOfWeek,
    isOpen: industryModule === "SPA" ? dayOfWeek !== 1 : true,
    openTime: "10:00",
    closeTime: "21:00",
    slotInterval: industryModule === "SPA" ? 30 : 60,
    defaultCapacity: industryModule === "SPA" ? 1 : 6,
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

export const SPA_STARTER_SKILLS = [
  { key: "body", name: "身體芳療" },
  { key: "face", name: "臉部護理" },
  { key: "foot", name: "足部舒壓" },
] as const;

export const SPA_STARTER_TREATMENTS = [
  {
    key: "body-60",
    name: "全身芳療",
    price: 1800,
    serviceMinutes: 60,
    skillKey: "body",
  },
  {
    key: "face-60",
    name: "臉部保濕護理",
    price: 2000,
    serviceMinutes: 60,
    skillKey: "face",
  },
  {
    key: "foot-60",
    name: "足部舒壓",
    price: 900,
    serviceMinutes: 60,
    skillKey: "foot",
  },
] as const;
