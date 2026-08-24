import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import type { HealthAlert, HealthSummary } from "@/lib/health-service";

export type NativeHealthTrendPoint = HealthSummary["trend"][number];

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
    }),
    prisma.customerHealthRecord.count({ where: { customerId, storeId } }),
    prisma.customerHealthRecord.findFirst({
      where: { customerId, storeId },
      orderBy: [{ measuredAt: "asc" }, { createdAt: "asc" }],
      select: { measuredAt: true },
    }),
  ]);

  const latestRow = records[0] ?? null;
  const latest = latestRow
    ? {
        measuredAt: latestRow.measuredAt.toISOString().slice(0, 10),
        weight: latestRow.weight,
        bmi: latestRow.bmi,
        bodyFat: latestRow.bodyFat,
        muscleMass: latestRow.muscleMass,
        boneMass: latestRow.boneMass,
        visceralFat: latestRow.visceralFat,
        bmr: latestRow.bmr,
        bodyWater: latestRow.bodyWater,
        metabolicAge: latestRow.metabolicAge,
        note: latestRow.note,
      }
    : null;

  const trend = records.slice().reverse().map((row) => ({
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
