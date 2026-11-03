import 'server-only';
import {prisma} from '@/lib/db';
import {AppError} from '@/lib/errors';
import {getNativeHealthSummary} from '@/lib/native-health-service';
export async function readCustomerHealthForStore(storeId: string, customerId: string) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId, mergedIntoCustomerId: null }, select: { id: true } });
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
    const [summary, records] = await Promise.all([
      getNativeHealthSummary(customerId, storeId),
      prisma.customerHealthRecord.findMany({ where: { customerId, storeId }, orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }], take: 100 }),
    ]);
    return { success: true as const, data: { summary, records: records.map((r) => ({ ...r, measuredAt: r.measuredAt.toISOString().slice(0, 10), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })) } };
}

