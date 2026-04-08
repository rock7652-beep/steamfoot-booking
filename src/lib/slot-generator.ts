/**
 * 時段生成器 — 根據規則即時運算可預約時段
 *
 * 取代 BookingSlot 固定模板，改為：
 * openTime + closeTime + slotInterval + defaultCapacity → 動態生成
 */

export interface GeneratedSlot {
  startTime: string; // "HH:mm"
  capacity: number;
}

/**
 * 根據營業規則生成時段列表
 *
 * @param openTime  開始時間 "HH:mm"
 * @param closeTime 結束時間 "HH:mm"
 * @param intervalMinutes 時段間隔（分鐘）
 * @param capacity  每時段名額
 * @returns 時段列表
 *
 * 例如：generateSlots("10:00", "22:00", 60, 6)
 * → [{ startTime: "10:00", capacity: 6 }, { startTime: "11:00", capacity: 6 }, ...]
 */
export function generateSlots(
  openTime: string,
  closeTime: string,
  intervalMinutes: number,
  capacity: number
): GeneratedSlot[] {
  if (!openTime || !closeTime || intervalMinutes <= 0 || capacity < 1) {
    return [];
  }
  // 底層防呆：closeTime 必須晚於 openTime
  if (timeToMinutes(closeTime) <= timeToMinutes(openTime)) {
    return [];
  }

  const slots: GeneratedSlot[] = [];
  let cursor = timeToMinutes(openTime);
  const end = timeToMinutes(closeTime);

  // 安全上限：最多 96 個時段（24h / 15min）
  const maxSlots = 96;
  let count = 0;

  while (cursor < end && count < maxSlots) {
    slots.push({
      startTime: minutesToTime(cursor),
      capacity,
    });
    cursor += intervalMinutes;
    count++;
  }

  return slots;
}

/** "HH:mm" → 分鐘數（0-1439） */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** 分鐘數 → "HH:mm" */
function minutesToTime(minutes: number): number extends never ? never : string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 可用的時段間隔選項 */
export const SLOT_INTERVAL_OPTIONS = [
  { value: 30, label: "每 30 分鐘" },
  { value: 60, label: "每 60 分鐘" },
  { value: 90, label: "每 90 分鐘" },
  { value: 120, label: "每 120 分鐘" },
] as const;

/** 可用的名額選項 */
export const CAPACITY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20] as const;

const VALID_INTERVALS: Set<number> = new Set(SLOT_INTERVAL_OPTIONS.map((o) => o.value));

// ============================================================
// 營業規則驗證（前後台共用）
// ============================================================

export interface TimeRangeValidation {
  valid: boolean;
  error?: string;
}

/**
 * 驗證營業時間規則的合理性
 * 所有寫入 BusinessHours / SpecialBusinessDay 的入口都必須呼叫此函式
 *
 * 規則：
 * 1. closeTime 必須晚於 openTime
 * 2. (closeTime - openTime) 必須 >= slotInterval
 * 3. slotInterval 必須是 30/60/90/120 其中之一
 * 4. defaultCapacity 必須 >= 1
 */
export function validateTimeRange(input: {
  openTime: string | null | undefined;
  closeTime: string | null | undefined;
  slotInterval?: number | null;
  defaultCapacity?: number | null;
}): TimeRangeValidation {
  const { openTime, closeTime, slotInterval, defaultCapacity } = input;

  // 如果沒有時間（非營業日），不需要驗證時間相關欄位
  if (!openTime && !closeTime) {
    // 但 capacity 如果有提供，仍需驗證
    if (defaultCapacity != null && defaultCapacity < 1) {
      return { valid: false, error: "每時段名額不可小於 1" };
    }
    return { valid: true };
  }

  // 有提供其中一個但缺另一個
  if (!openTime || !closeTime) {
    return { valid: false, error: "開店時間與關店時間必須同時提供" };
  }

  // 1. closeTime 必須晚於 openTime
  const openMin = timeToMinutes(openTime);
  const closeMin = timeToMinutes(closeTime);
  if (closeMin <= openMin) {
    return { valid: false, error: `關店時間（${closeTime}）必須晚於開店時間（${openTime}）` };
  }

  // 2. slotInterval 驗證
  const interval = slotInterval ?? 60;
  if (!VALID_INTERVALS.has(interval)) {
    return { valid: false, error: `時段間隔必須是 ${[...VALID_INTERVALS].join("/")} 分鐘` };
  }

  // 3. (closeTime - openTime) 必須 >= slotInterval
  const rangeMinutes = closeMin - openMin;
  if (rangeMinutes < interval) {
    return {
      valid: false,
      error: `營業時間範圍（${rangeMinutes} 分鐘）不足一個時段（${interval} 分鐘）。請擴大營業時間或縮短間隔`,
    };
  }

  // 4. defaultCapacity 必須 >= 1
  if (defaultCapacity != null && defaultCapacity < 1) {
    return { valid: false, error: "每時段名額不可小於 1" };
  }

  return { valid: true };
}
