import { parseTaipeiDateTime } from "@/lib/date-utils";

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function timeOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function validSpaDate(date: string): boolean {
  return parseTaipeiDateTime(date, "00:00") !== null;
}
export function spaEndTime(start: string, durations: { serviceMinutes: number; bufferMinutes: number }[]): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || durations.length === 0 ||
      durations.some(d => !Number.isInteger(d.serviceMinutes) || d.serviceMinutes <= 0 || !Number.isInteger(d.bufferMinutes) || d.bufferMinutes < 0)) {
    throw new Error("服務時間設定不正確");
  }
  const end = minutesOf(start) + durations.reduce((n, d) => n + d.serviceMinutes + d.bufferMinutes, 0);
  if (end > 1440) throw new Error("預約不可跨日，請選擇較早的時間");
  return timeOf(end);
}
export function overlaps(start: string, end: string, otherStart: string, otherEnd: string): boolean {
  return start < otherEnd && end > otherStart;
}
export function staffAvailable(start: string, end: string,
  regular: { startTime: string; endTime: string; isActive: boolean } | null,
  exceptions: { type: string; startTime: string | null; endTime: string | null }[],
): boolean {
  if (exceptions.some(e => e.type === "UNAVAILABLE" && overlaps(start, end, e.startTime ?? "00:00", e.endTime ?? "24:00"))) return false;
  const available = exceptions.filter(e => e.type === "AVAILABLE").map(e => ({ startTime: e.startTime ?? "00:00", endTime: e.endTime ?? "24:00" }));
  if (regular?.isActive) available.push(regular);
  const ranges = available.sort((a, b) => a.startTime.localeCompare(b.startTime));
  let covered = start;
  for (const range of ranges) {
    if (range.startTime > covered) break;
    if (range.endTime > covered) covered = range.endTime;
    if (covered >= end) return true;
  }
  return false;
}
export function applicableLocations<T extends { id: string }>(locations: T[], treatmentLocationIds: string[][]): T[] {
  return locations.filter(location => treatmentLocationIds.every(ids => ids.includes(location.id)));
}

export type SpaServiceKind = "MAIN" | "ADD_ON" | "COMBO";

export type SpaServiceItem = {
  key: string;
  name: string;
  kind: SpaServiceKind;
  durationMinutes: number;
  price: number;
  requiredSpecialty: "body" | "face" | "foot" | "head";
  includedItemKeys?: readonly string[];
};

export type SpaTimeRange = {
  startTime: string;
  durationMinutes: number;
};

export type SpaProviderSpecialty = SpaServiceItem["requiredSpecialty"];

export const SPA_SERVICE_MENU: readonly SpaServiceItem[] = [
  {
    key: "aroma_body_60",
    name: "全身精油舒壓",
    kind: "MAIN",
    durationMinutes: 60,
    price: 1_300,
    requiredSpecialty: "body",
  },
  {
    key: "deep_body_90",
    name: "深層全身芳療",
    kind: "MAIN",
    durationMinutes: 90,
    price: 1_800,
    requiredSpecialty: "body",
  },
  {
    key: "facial_60",
    name: "臉部保濕護理",
    kind: "MAIN",
    durationMinutes: 60,
    price: 1_500,
    requiredSpecialty: "face",
  },
  {
    key: "head_30",
    name: "頭部舒壓加購",
    kind: "ADD_ON",
    durationMinutes: 30,
    price: 500,
    requiredSpecialty: "head",
  },
  {
    key: "foot_30",
    name: "足部放鬆加購",
    kind: "ADD_ON",
    durationMinutes: 30,
    price: 500,
    requiredSpecialty: "foot",
  },
  {
    key: "facial_addon_30",
    name: "臉部亮顏加購",
    kind: "ADD_ON",
    durationMinutes: 30,
    price: 650,
    requiredSpecialty: "face",
  },
  {
    key: "sleep_combo_120",
    name: "深層舒眠組合",
    kind: "COMBO",
    durationMinutes: 120,
    price: 2_200,
    requiredSpecialty: "body",
    includedItemKeys: ["aroma_body_60", "head_30", "foot_30"],
  },
] as const;

export function getSpaServiceItem(key: string): SpaServiceItem {
  const item = SPA_SERVICE_MENU.find((candidate) => candidate.key === key);
  if (!item) throw new Error(`SPA 服務目錄缺少項目：${key}`);
  return item;
}

export function composeSpaServices(
  primaryKey: string,
  addOnKeys: readonly string[] = [],
): readonly SpaServiceItem[] {
  const primary = getSpaServiceItem(primaryKey);
  if (primary.kind === "ADD_ON") throw new Error("加購項目不能單獨成為主療程");
  if (primary.kind === "COMBO") return [primary];

  const uniqueAddOnKeys = [...new Set(addOnKeys)];
  const addOns = uniqueAddOnKeys.map(getSpaServiceItem);
  if (addOns.some((item) => item.kind !== "ADD_ON")) {
    throw new Error("主療程只能搭配加購項目");
  }
  return [primary, ...addOns];
}

export function summarizeSpaServices(items: readonly SpaServiceItem[]) {
  return items.reduce(
    (summary, item) => ({
      durationMinutes: summary.durationMinutes + item.durationMinutes,
      price: summary.price + item.price,
    }),
    { durationMinutes: 0, price: 0 },
  );
}

export function getRequiredSpecialties(items: readonly SpaServiceItem[]): readonly SpaProviderSpecialty[] {
  const expandedItems = items.flatMap((item) => {
    if (item.kind !== "COMBO" || !item.includedItemKeys) return [item];
    return item.includedItemKeys.map(getSpaServiceItem);
  });
  return [...new Set(expandedItems.map((item) => item.requiredSpecialty))];
}

export function canProviderPerformServices(
  providerSpecialties: readonly SpaProviderSpecialty[],
  items: readonly SpaServiceItem[],
): boolean {
  const providerSpecialtySet = new Set(providerSpecialties);
  return getRequiredSpecialties(items).every((specialty) => providerSpecialtySet.has(specialty));
}

export function addMinutes(time: string, minutes: number): string {
  const [hours, minute] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + minute + minutes;
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}

export function rangesOverlap(left: SpaTimeRange, right: SpaTimeRange): boolean {
  const leftStart = timeToMinutes(left.startTime);
  const rightStart = timeToMinutes(right.startTime);
  return leftStart < rightStart + right.durationMinutes && rightStart < leftStart + left.durationMinutes;
}

export function hasContinuousAvailability({
  startTime,
  serviceMinutes,
  bufferMinutes = 0,
  closeTime,
  occupiedRanges,
}: {
  startTime: string;
  serviceMinutes: number;
  bufferMinutes?: number;
  closeTime: string;
  occupiedRanges: readonly SpaTimeRange[];
}): boolean {
  const requestedRange = { startTime, durationMinutes: serviceMinutes + bufferMinutes };
  if (timeToMinutes(startTime) + requestedRange.durationMinutes > timeToMinutes(closeTime)) return false;
  return occupiedRanges.every((range) => !rangesOverlap(requestedRange, range));
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
