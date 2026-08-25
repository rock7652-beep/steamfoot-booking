import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import type { HealthAlert, HealthRecord, HealthSummary } from "@/lib/health-service";

export type NativeHealthTrendPoint = HealthSummary["trend"][number];

export interface NativeHealthMembershipScope {
  storeId: string;
  customerId: string;
  storeName: string;
  storeSlug: string;
}

const healthRecordSelect = {
  measuredAt: true,
  weight: true,
  bmi: true,
  bodyFat: true,
  muscleMass: true,
  boneMass: true,
  visceralFat: true,
  bmr: true,
  bodyWater: true,
  metabolicAge: true,
  note: true,
} as const;

function toHealthRecord(row: {
  measuredAt: Date;
  weight: number | null;
  bmi: number | null;
  bodyFat: number | null;
  muscleMass: number | null;
  boneMass: number | null;
  visceralFat: number | null;
  bmr: number | null;
  bodyWater: number | null;
  metabolicAge: number | null;
  note: string | null;
  store?: { name: string; slug: string };
}): HealthRecord {
  return {
    measuredAt: row.measuredAt.toISOString().slice(0, 10),
    weight: row.weight,
    bmi: row.bmi,
    bodyFat: row.bodyFat,
    muscleMass: row.muscleMass,
    boneMass: row.boneMass,
    visceralFat: row.visceralFat,
    bmr: row.bmr,
    bodyWater: row.bodyWater,
    metabolicAge: row.metabolicAge,
    note: row.note,
    ...(row.store
      ? { storeName: row.store.name, storeSlug: row.store.slug }
      : {}),
  };
}

function uniqueMembershipScopes(
  memberships: NativeHealthMembershipScope[],
): NativeHealthMembershipScope[] {
  const unique = new Map<string, NativeHealthMembershipScope>();
  for (const membership of memberships) {
    unique.set(`${membership.storeId}:${membership.customerId}`, membership);
  }
  return [...unique.values()];
}

/**
 * 顧客本人專用的跨店健康摘要。
 *
 * 每個範圍都同時鎖定 storeId + customerId，呼叫端只能傳入中央會員解析器
 * 驗證過的 memberships。店員端不可使用本函式，仍應走單店查詢。
 */
export async function getNativeHealthSummaryForMemberships(
  memberships: NativeHealthMembershipScope[],
): Promise<HealthSummary> {
  const scopes = uniqueMembershipScopes(memberships);
  if (scopes.length === 0) {
    return {
      latest: null,
      trend: [],
      alerts: [],
      meta: { totalRecords: 0, daysSinceLastMeasure: null, firstMeasuredAt: null },
    };
  }

  const where = {
    OR: scopes.map(({ storeId, customerId }) => ({ storeId, customerId })),
  };
  const [records, totalRecords, first] = await Promise.all([
    prisma.customerHealthRecord.findMany({
      where,
      orderBy: [{ measuredAt: "desc" as const }, { createdAt: "desc" as const }],
      take: 30,
      include: { store: { select: { name: true, slug: true } } },
    }),
    prisma.customerHealthRecord.count({ where }),
    prisma.customerHealthRecord.findFirst({
      where,
      orderBy: [{ measuredAt: "asc" as const }, { createdAt: "asc" as const }],
      select: { measuredAt: true },
    }),
  ]);

  const latestRow = records[0] ?? null;
  const latest = latestRow ? toHealthRecord(latestRow) : null;
  const trend = records.slice().reverse().map((row) => ({
    ...toHealthRecord(row),
    note: undefined,
  }));

  return {
    latest,
    trend,
    alerts: latestRow ? alertsFor(latestRow) : [],
    meta: {
      totalRecords,
      daysSinceLastMeasure: latestRow
        ? daysBetween(latestRow.measuredAt, toLocalDateStr())
        : null,
      firstMeasuredAt: first?.measuredAt.toISOString().slice(0, 10) ?? null,
    },
  };
}

/** Lightweight customer-detail query: one indexed row, no history/count/chart data. */
export async function getLatestNativeHealthRecord(
  customerId: string,
  storeId: string,
): Promise<HealthRecord | null> {
  const row = await prisma.customerHealthRecord.findFirst({
    where: { customerId, storeId },
    orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
    select: healthRecordSelect,
  });

  return row ? toHealthRecord(row) : null;
}

function daysBetween(date: Date, today: string): number {
  const [year, month, day] = today.split("-").map(Number);
  const utcToday = Date.UTC(year, month - 1, day);
  const utcDate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.max(0, Math.floor((utcToday - utcDate) / 86_400_000));
}

function alertsFor(record: {
  bmi: number | null;
  bodyFat: number | null;
  visceralFat: number | null;
}): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  if (record.bmi != null && (record.bmi < 18.5 || record.bmi >= 24)) {
    alerts.push({ metric: "bmi", status: record.bmi >= 27 ? "danger" : "warning", label: "BMI", message: "建議持續觀察" });
  }
  if (record.bodyFat != null && record.bodyFat >= 30) {
    alerts.push({ metric: "body_fat", status: record.bodyFat >= 35 ? "danger" : "warning", label: "體脂肪", message: "建議持續觀察" });
  }
  if (record.visceralFat != null && record.visceralFat >= 10) {
    alerts.push({ metric: "visceral_fat", status: record.visceralFat >= 15 ? "danger" : "warning", label: "內臟脂肪", message: "建議持續觀察" });
  }
  return alerts;
}

export async function getNativeHealthSummary(
  customerId: string,
  storeId: string,
): Promise<HealthSummary> {
  const [records, totalRecords, first] = await Promise.all([
    prisma.customerHealthRecord.findMany({
      where: { customerId, storeId },
      orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
      take: 30,
      include: { store: { select: { name: true, slug: true } } },
    }),
    prisma.customerHealthRecord.count({ where: { customerId, storeId } }),
    prisma.customerHealthRecord.findFirst({
      where: { customerId, storeId },
      orderBy: [{ measuredAt: "asc" }, { createdAt: "asc" }],
      select: { measuredAt: true },
    }),
  ]);

  const latestRow = records[0] ?? null;
  const latest = latestRow ? toHealthRecord(latestRow) : null;

  const trend = records.slice().reverse().map((row) => ({
    ...toHealthRecord(row),
    note: undefined,
  }));

  return {
    latest,
    trend,
    alerts: latestRow ? alertsFor(latestRow) : [],
    meta: {
      totalRecords,
      daysSinceLastMeasure: latestRow ? daysBetween(latestRow.measuredAt, toLocalDateStr()) : null,
      firstMeasuredAt: first?.measuredAt.toISOString().slice(0, 10) ?? null,
    },
  };
}

export function calculateNativeBmi(weight: number | null, heightCm: number | null): number | null {
  if (!weight || !heightCm) return null;
  return Math.round((weight / ((heightCm / 100) ** 2)) * 10) / 10;
}
