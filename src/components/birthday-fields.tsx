"use client";

import { useMemo, useState } from "react";

interface BirthdayFieldsProps {
  defaultValue?: string | Date | null;
  required?: boolean;
  className?: string;
}

export function normalizeBirthdayInput(
  value: string | Date | null | undefined,
): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return dateOnly ?? "";
}

function daysInMonth(year: number, month: number): number {
  if (!year || !month) return 31;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function BirthdayFields({
  defaultValue,
  required = false,
  className = "",
}: BirthdayFieldsProps) {
  const normalizedDefault = normalizeBirthdayInput(defaultValue);
  const [defaultYear = "1970", defaultMonth = "", defaultDay = ""] =
    normalizedDefault.split("-");
  const [year, setYear] = useState(defaultYear || "1970");
  const [month, setMonth] = useState(defaultMonth);
  const [day, setDay] = useState(defaultDay);
  const currentYear = new Date().getFullYear();
  const maxDay = daysInMonth(Number(year), Number(month));
  const safeDay = day && Number(day) <= maxDay ? day : "";
  const birthday =
    year && month && safeDay
      ? `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${safeDay.padStart(2, "0")}`
      : "";
  const years = useMemo(
    () => Array.from({ length: currentYear - 1919 }, (_, index) => currentYear - index),
    [currentYear],
  );
  const fieldClass =
    className ||
    "h-12 w-full rounded-xl border border-earth-300 bg-white px-3 text-base text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500";

  return (
    <fieldset>
      <legend className="sr-only">生日年月日</legend>
      <input type="hidden" name="birthday" value={birthday} />
      <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-2">
        <div>
          <label htmlFor="birthday-year" className="mb-1 block text-xs text-earth-500">年</label>
          <input
            id="birthday-year"
            type="number"
            inputMode="numeric"
            list="birthday-years"
            min={1920}
            max={currentYear}
            value={year}
            onChange={(event) => setYear(event.target.value)}
            required={required}
            className={fieldClass}
          />
          <datalist id="birthday-years">
            {years.map((value) => <option key={value} value={value}>{value}（民國 {value - 1911} 年）</option>)}
          </datalist>
        </div>
        <div>
          <label htmlFor="birthday-month" className="mb-1 block text-xs text-earth-500">月</label>
          <select
            id="birthday-month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setDay("");
            }}
            required={required}
            className={fieldClass}
          >
            <option value="">月</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={String(value).padStart(2, "0")}>{value}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="birthday-day" className="mb-1 block text-xs text-earth-500">日</label>
          <select
            id="birthday-day"
            value={safeDay}
            onChange={(event) => setDay(event.target.value)}
            required={required}
            className={fieldClass}
          >
            <option value="">日</option>
            {Array.from({ length: maxDay }, (_, index) => index + 1).map((value) => (
              <option key={value} value={String(value).padStart(2, "0")}>{value}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-1 text-xs text-earth-500">年份可直接輸入或搜尋，範圍 1920～{currentYear}</p>
    </fieldset>
  );
}
