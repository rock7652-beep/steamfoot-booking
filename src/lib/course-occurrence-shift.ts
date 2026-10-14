export function shiftCourseOccurrenceDates(dates: string[], index: number, nextDate: string) {
  const serial = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const [year, month, day] = value.split("-").map(Number);
    const stamp = Date.UTC(year, month - 1, day);
    return new Date(stamp).toISOString().slice(0, 10) === value ? stamp : NaN;
  };
  if (!Number.isInteger(index) || index < 0 || index >= dates.length || !Number.isFinite(serial(nextDate))) {
    throw new Error("請選擇有效日期");
  }
  if (index > 0 && nextDate <= dates[index - 1]) throw new Error("日期需晚於上一堂");
  const delta = (serial(nextDate) - serial(dates[index])) / 86400000;
  return dates.map((date, position) => {
    if (position < index) return date;
    const shifted = new Date(serial(date) + delta * 86400000);
    return shifted.toISOString().slice(0, 10);
  });
}
