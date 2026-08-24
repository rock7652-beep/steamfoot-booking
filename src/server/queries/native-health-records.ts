import { prisma } from "@/lib/db";

export type HealthMetricFilter =
  | "weight"
  | "bmi"
  | "bodyFat"
  | "muscleMass"
  | "boneMass"
  | "visceralFat"
  | "bmr"
  | "bodyWater"
  | "metabolicAge";

export interface NativeHealthRecordFilters {
  search?: string;
  from?: string;
  to?: string;
  metric?: HealthMetricFilter;
  page?: number;
  pageSize?: number;
}

function dateBoundary(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function listNativeHealthRecords(
  storeId: string,
  filters: NativeHealthRecordFilters,
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 30));
  const search = filters.search?.trim();
  const from = dateBoundary(filters.from);
  const to = dateBoundary(filters.to);
  const metricWhere = filters.metric ? { [filters.metric]: { not: null } } : {};

  const where = {
    storeId,
    ...metricWhere,
    ...(from || to
      ? { measuredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    customer: {
      mergedIntoCustomerId: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    },
  };

  const [records, total] = await Promise.all([
    prisma.customerHealthRecord.findMany({
      where,
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customerHealthRecord.count({ where }),
  ]);

  return { records, total, page, pageSize };
}
