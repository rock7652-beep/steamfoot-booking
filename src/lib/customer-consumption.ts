import { addTaiwanDuration, isAnalysisDate, toLocalDateStr } from "@/lib/date-utils";
import { AppError } from "@/lib/app-error";

export const CONSUMPTION_METRICS = {
  count: "消耗次數", sessions: "消耗堂數", grids: "消耗格數", points: "消耗點數",
  amount: "消耗金額", paid: "實付金額",
} as const;
export type ConsumptionMetric = keyof typeof CONSUMPTION_METRICS;
export type ConsumptionParams = Record<string, string | string[] | undefined>;
export type ConsumptionFilters = {
  startDate: string; endDate: string; preset: string; planId: string; q: string;
  includeAbsent: boolean; sort: ConsumptionMetric; direction: "asc" | "desc";
  top: number | null; page: number;
  ranges: Partial<Record<ConsumptionMetric, { min?: number; max?: number }>>;
};
export type ConsumptionRow = {
  id: string; name: string; phone: string; count: number; sessions: number; grids: number;
  points: number; amount: number; paid: number; balances: string;
};
export type ConsumptionOption = { id: string; name: string; unit: string; units?: string[] };
export const CONSUMPTION_PAGE_SIZE = 50;
export const CONSUMPTION_EXPORT_LIMIT = 10000;
export const CONSUMPTION_PATH = "/dashboard/growth/consumption";

export function firstConsumptionParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseConsumptionFilters(params: ConsumptionParams, today = toLocalDateStr()): ConsumptionFilters {
  const get = (key: string) => firstConsumptionParam(params[key])?.trim() ?? "";
  const preset = get("preset") || "month";
  const monthStart = `${today.slice(0, 7)}-01`;
  let startDate = monthStart, endDate = today;
  if (preset === "lastMonth") {
    startDate = addTaiwanDuration(monthStart, -1, "MONTH");
    endDate = addTaiwanDuration(monthStart, -1, "DAY");
  } else if (preset === "30" || preset === "90") {
    startDate = addTaiwanDuration(today, -(Number(preset) - 1), "DAY");
  } else if (preset === "custom") {
    startDate = get("startDate"); endDate = get("endDate");
  } else if (preset !== "month") throw new AppError("VALIDATION", "請選擇有效的統計期間");
  if (!isAnalysisDate(startDate) || !isAnalysisDate(endDate) || startDate > endDate)
    throw new AppError("VALIDATION", "請填寫有效日期，開始日期不可晚於結束日期");
  const ranges: ConsumptionFilters["ranges"] = {};
  for (const metric of Object.keys(CONSUMPTION_METRICS) as ConsumptionMetric[]) {
    const range: { min?: number; max?: number } = {};
    for (const bound of ["min", "max"] as const) {
      const raw = get(`${metric}_${bound}`);
      if (!raw) continue;
      const value = Number(raw);
      const validNumber = metric === "paid" ? /^-?\d+(\.\d{1,2})?$/.test(raw) : /^\d+(\.\d{1,2})?$/.test(raw);
      if (!validNumber || !Number.isSafeInteger(value * 100) || value < (metric === "paid" ? -1e12 : 0) || value > 1e12)
        throw new AppError("VALIDATION", `${CONSUMPTION_METRICS[metric]}範圍須為有效數字${metric === "paid" ? "" : "且不可小於零"}`);
      range[bound] = value;
    }
    if (range.min !== undefined && range.max !== undefined && range.min > range.max)
      throw new AppError("VALIDATION", `${CONSUMPTION_METRICS[metric]}最低值不可大於最高值`);
    if (range.min !== undefined || range.max !== undefined) ranges[metric] = range;
  }
  const sort = get("sort") || "count";
  if (!Object.hasOwn(CONSUMPTION_METRICS, sort)) throw new AppError("VALIDATION", "排序欄位不正確");
  const direction = get("direction") || "desc";
  if (direction !== "asc" && direction !== "desc") throw new AppError("VALIDATION", "排序方向不正確");
  const top = get("top") ? Number(get("top")) : null;
  if (top !== null && (!Number.isInteger(top) || top < 1 || top > CONSUMPTION_EXPORT_LIMIT))
    throw new AppError("VALIDATION", `前 N 名須介於 1～${CONSUMPTION_EXPORT_LIMIT}`);
  const page = Number(get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) throw new AppError("VALIDATION", "頁碼不正確");
  return { startDate, endDate, preset, planId: get("planId"), q: get("q").slice(0, 100),
    includeAbsent: get("includeAbsent") !== "0", sort: sort as ConsumptionMetric, direction, top, page, ranges };
}

/** Store the resolved dates in links/exports so a saved result keeps its period across midnight. */
export function consumptionSearchParams(filters: ConsumptionFilters) {
  const params = new URLSearchParams({ preset: "custom", startDate: filters.startDate, endDate: filters.endDate,
    includeAbsent: filters.includeAbsent ? "1" : "0", sort: filters.sort, direction: filters.direction });
  if (filters.planId) params.set("planId", filters.planId);
  if (filters.q) params.set("q", filters.q);
  if (filters.top) params.set("top", String(filters.top));
  for (const [metric, range] of Object.entries(filters.ranges)) {
    if (range.min !== undefined) params.set(`${metric}_min`, String(range.min));
    if (range.max !== undefined) params.set(`${metric}_max`, String(range.max));
  }
  return params;
}

export function consumptionMetrics(options: ConsumptionOption[]): ConsumptionMetric[] {
  const units = new Set(options.flatMap(option => [option.unit, ...(option.units ?? [])]));
  return ["count", ...(units.has("SESSION") ? ["sessions" as const] : []),
    ...(units.has("GRID") ? ["grids" as const] : []), ...(units.has("POINT") ? ["points" as const] : []), "amount", "paid"];
}

export function consumptionCsv(rows: ConsumptionRow[], filters: ConsumptionFilters, planName: string, metrics: ConsumptionMetric[]) {
  const conditions = Object.entries(filters.ranges).map(([metric, range]) =>
    `${CONSUMPTION_METRICS[metric as ConsumptionMetric]} ${range.min ?? "不限"}～${range.max ?? "不限"}`).join("；");
  const data: Array<Array<string | number>> = [
    ["統計期間", filters.startDate, filters.endDate], ["收費方式", planName],
    ["曠課／請假扣除", filters.includeAbsent ? "包含" : "不包含"],
    ["搜尋", filters.q], ["數值條件（全部符合）", conditions || "不限"],
    ["排序", CONSUMPTION_METRICS[filters.sort], filters.direction === "asc" ? "由少到多" : "由多到少", filters.top ? `前 ${filters.top} 名` : "全部"],
    ["姓名", "電話", ...metrics.map(metric => CONSUMPTION_METRICS[metric]), "目前方案餘額（非期間末餘額）"],
    ...rows.map(row => [row.name, row.phone, ...metrics.map(metric => row[metric]), row.balances]),
  ];
  return "\uFEFF" + data.map(row => row.map(value => {
    const text = String(value);
    const safe = typeof value === "string" && /^\s*[=+@\-\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
}
