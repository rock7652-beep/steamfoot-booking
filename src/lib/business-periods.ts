export interface BusinessPeriod {
  openTime: string;
  closeTime: string;
  slotInterval: number;
  defaultCapacity: number;
}


const VALID_INTERVALS = new Set([15, 30, 60, 90, 120]);

export function parseBusinessPeriods(
  value: unknown,
  fallback: { openTime: string | null; closeTime: string | null; slotInterval: number; defaultCapacity: number },
): BusinessPeriod[] {
  const raw = Array.isArray(value) ? value : [];
  const parsed = raw.flatMap((item): BusinessPeriod[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.openTime !== "string" || typeof row.closeTime !== "string") return [];
    const slotInterval = typeof row.slotInterval === "number" ? row.slotInterval : 60;
    const defaultCapacity = typeof row.defaultCapacity === "number" ? row.defaultCapacity : 6;
    if (!VALID_INTERVALS.has(slotInterval) || defaultCapacity < 1) return [];
    return [{ openTime: row.openTime, closeTime: row.closeTime, slotInterval, defaultCapacity }];
  });
  if (parsed.length > 0) return parsed.sort((a, b) => a.openTime.localeCompare(b.openTime));
  if (!fallback.openTime || !fallback.closeTime) return [];
  return [{
    openTime: fallback.openTime,
    closeTime: fallback.closeTime,
    slotInterval: fallback.slotInterval,
    defaultCapacity: fallback.defaultCapacity,
  }];
}

