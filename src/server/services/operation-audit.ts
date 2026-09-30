import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type OperationModule = "STEAM" | "SPA" | "COURSE" | "SHARED";
type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export type OperationAuditInput = {
  actorUserId: string;
  actorNameSnapshot?: string | null;
  storeId: string;
  module: OperationModule;
  targetType: string;
  targetId: string;
  action: string;
  summary: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
};

/** Append-only. actorUserId must come from the authenticated server session. */
export async function recordOperationAudit(
  input: OperationAuditInput,
  client: AuditClient = prisma,
) {
  return client.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorNameSnapshot: input.actorNameSnapshot?.trim() || null,
      storeId: input.storeId,
      module: input.module,
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      summary: input.summary,
      ...(input.before === undefined ? {} : { beforeJson: input.before }),
      ...(input.after === undefined ? {} : { afterJson: input.after }),
    },
    select: { id: true },
  });
}

/** Cross-schema writes cannot share the business transaction; never report the
 * completed business action as failed only because its follow-up audit write failed. */
export async function recordOperationAuditBestEffort(input: OperationAuditInput) {
  try {
    return await recordOperationAudit(input);
  } catch (error) {
    console.error("[operation-audit] follow-up write failed", {
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function getOperationHistory(input: {
  storeId: string;
  targetType: string;
  targetId: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  return prisma.auditLog.findMany({
    where: { storeId: input.storeId, targetType: input.targetType, targetId: input.targetId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true, action: true, summary: true, module: true, createdAt: true,
      actorNameSnapshot: true, beforeJson: true, afterJson: true,
      actor: { select: { id: true, name: true, role: true } },
    },
  });
}

export type OperationAuditCenterFilters = {
  storeId?: string | null;
  storeIds?: string[];
  actorUserId?: string;
  module?: OperationModule;
  modules?: OperationModule[];
  keyword?: string;
  dateFrom: Date;
  dateTo: Date;
  page?: number;
  pageSize?: number;
};

/** Read-only, paginated query for the store/HQ operation record center. */
export async function listOperationAudits(input: OperationAuditCenterFilters) {
  const page = Math.max(input.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 30, 1), 100);
  const keyword = input.keyword?.trim().slice(0, 80);
  const where: Prisma.AuditLogWhereInput = {
    createdAt: { gte: input.dateFrom, lte: input.dateTo },
    ...(input.storeId
      ? { storeId: input.storeId }
      : input.storeIds
        ? { storeId: { in: input.storeIds } }
        : {}),
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(input.module
      ? { module: input.module }
      : input.modules?.length
        ? { module: { in: input.modules } }
        : {}),
    ...(keyword
      ? {
          OR: [
            { summary: { contains: keyword, mode: "insensitive" } },
            { action: { contains: keyword, mode: "insensitive" } },
            { targetType: { contains: keyword, mode: "insensitive" } },
            { actorNameSnapshot: { contains: keyword, mode: "insensitive" } },
            { actor: { name: { contains: keyword, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [total, items, actorRows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, action: true, summary: true, module: true, targetType: true,
        targetId: true, createdAt: true, actorUserId: true,
        actorNameSnapshot: true, beforeJson: true, afterJson: true, storeId: true,
        actor: { select: { name: true, role: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        createdAt: { gte: input.dateFrom, lte: input.dateTo },
        ...(input.storeId
          ? { storeId: input.storeId }
          : input.storeIds
            ? { storeId: { in: input.storeIds } }
            : {}),
      },
      distinct: ["actorUserId"],
      orderBy: { createdAt: "desc" },
      select: {
        actorUserId: true,
        actorNameSnapshot: true,
        actor: { select: { name: true } },
      },
    }),
  ]);
  return {
    items,
    total,
    page,
    pageSize,
    actors: actorRows.map((row) => ({
      id: row.actorUserId,
      name: row.actorNameSnapshot ?? row.actor.name,
    })),
  };
}
