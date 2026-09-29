import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type OperationModule = "STEAM" | "SPA" | "COURSE" | "SHARED";
type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export type OperationAuditInput = {
  actorUserId: string;
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
      actor: { select: { id: true, name: true, role: true } },
    },
  });
}
