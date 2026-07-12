import { toLocalDateStr } from "@/lib/date-utils";

const BIRTHDAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type BirthdayParseResult =
  | { success: true; value: Date; dateString: string }
  | { success: false; error: string };

/** Parse a birthday as a date-only UTC-midnight value without timezone shifting. */
export function parseBirthday(value: string, now = new Date()): BirthdayParseResult {
  const match = BIRTHDAY_PATTERN.exec(value);
  if (!match) return { success: false, error: "生日格式不正確" };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const currentYear = Number(toLocalDateStr(now).slice(0, 4));
  if (year < 1920 || year > currentYear) {
    return { success: false, error: `生日年份需介於 1920 至 ${currentYear} 年` };
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { success: false, error: "生日日期不存在" };
  }

  const dateString = `${match[1]}-${match[2]}-${match[3]}`;
  if (dateString > toLocalDateStr(now)) {
    return { success: false, error: "生日不可晚於今天" };
  }
  return { success: true, value: date, dateString };
}

export function formatBirthday(value: Date): string {
  return value.toISOString().slice(0, 10).replaceAll("-", "/");
}

export function birthdayToDate(value: string): Date {
  const parsed = parseBirthday(value);
  if (!parsed.success) throw new Error(parsed.error);
  return parsed.value;
}
