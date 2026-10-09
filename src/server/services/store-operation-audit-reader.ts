import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STORE_AUDIT_ACTIONS, STORE_AUDIT_ACTOR_ROLES, toStoreAuditItem } from "@/lib/store-operation-audit-policy";

export function storeOperationAuditWhere(storeId: string): Prisma.AuditLogWhereInput {
  return {
    storeId,
    AND: [
      { OR: Object.entries(STORE_AUDIT_ACTIONS).map(([targetType, actions]) => ({ targetType, action: { in: [...actions] } })) },
      { actorRoleSnapshot: { in: [...STORE_AUDIT_ACTOR_ROLES] } },
      { actor: { role: { not: "ADMIN" } } },
      { OR: [{ module: null }, { module: { not: "SYSTEM" } }] },
    ],
  };
}
const select = {
  id: true, targetType: true, action: true, createdAt: true, module: true,
  actorNameSnapshot: true, actorRoleSnapshot: true,
  actor: { select: { name: true, role: true } }, beforeJson: true, afterJson: true,
} satisfies Prisma.AuditLogSelect;

/** Only callable after authoritative role/store/grant checks; no client-provided scope. */
export async function readStoreOperationAudits(input: {
  storeId: string; dateFrom?: Date; dateTo?: Date; page?: number; limit?: number;
  targetType?: string; targetId?: string;
}) {
  const page = Math.max(1, Math.min(input.page ?? 1, 10000));
  const limit = Math.max(1, Math.min(input.limit ?? 50, 50));
  const where: Prisma.AuditLogWhereInput = {
    ...storeOperationAuditWhere(input.storeId),
    ...(input.dateFrom && input.dateTo ? { createdAt: { gte: input.dateFrom, lte: input.dateTo } } : {}),
    ...(input.targetType ? { targetType: input.targetType } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
  ]);
  return { total, page, pageSize: limit, items: rows.flatMap(row => { const item = toStoreAuditItem(row); return item ? [item] : []; }) };
}
