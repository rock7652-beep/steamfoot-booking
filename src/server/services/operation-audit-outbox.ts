import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentAuditActor, withoutAuditActor, markAuditDeliveryPending } from "@/lib/audit-db-context";
import { redactAuditValue } from "@/lib/audit-redact";
import type { OperationAuditInput } from "./operation-audit";

type Evidence = {
  actorUserId: string; actorNameSnapshot: string | null; actorRoleSnapshot: string | null;
  loginRecordId: string | null; source: string; storeId: string; module: string;
  targetType: string; targetId: string; action: string; summary: string;
  beforeJson?: Prisma.InputJsonValue; afterJson?: Prisma.InputJsonValue;
};

function evidence(input: OperationAuditInput): Evidence {
  const actor = currentAuditActor();
  const matches = actor?.id === input.actorUserId;
  return {
    actorUserId: input.actorUserId, actorNameSnapshot: matches ? actor.name ?? null : input.actorNameSnapshot ?? null,
    actorRoleSnapshot: matches ? actor.role ?? null : null,
    loginRecordId: matches ? actor.loginRecordId ?? null : null,
    source: /(?:^|_)AUTO_/.test(input.action) ? "SYSTEM" : "MANUAL",
    storeId: input.storeId, module: input.module, targetType: input.targetType,
    targetId: input.targetId, action: input.action, summary: input.summary,
    ...(input.before === undefined ? {} : { beforeJson: redactAuditValue(input.before) as Prisma.InputJsonValue }),
    ...(input.after === undefined ? {} : { afterJson: redactAuditValue(input.after) as Prisma.InputJsonValue }),
  };
}

/** Call in the business transaction. Failure rolls back the business change;
 * process exit after COMMIT cannot lose the audit intent. No second connection. */
export async function enqueueOperationAudit(
  input: OperationAuditInput,
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  eventKey?: string,
) {
  const id = eventKey ? createHash("sha256").update(JSON.stringify([
    input.storeId, input.module, input.targetType, input.targetId, input.action, eventKey,
  ])).digest("hex") : randomUUID();
  const payload = JSON.stringify(evidence(input));
  await tx.$executeRaw`INSERT INTO public."OperationAuditOutbox" (id, payload, "createdAt", "nextAttemptAt", attempts)
    VALUES (${id}, ${payload}::jsonb, NOW(), NOW(), 0) ON CONFLICT (id) DO NOTHING`;
  markAuditDeliveryPending();
  return { id };
}

/** Persist-before-delivery fallback for non-transactional events. Callers with
 * business writes must enqueue inside their own transaction instead. */
export async function persistFollowupAudit(input: OperationAuditInput) {
  return prisma.$transaction(tx => enqueueOperationAudit(input, tx));
}

export async function deliverOperationAudits(limit = 50) {
  const rows = await prisma.operationAuditOutbox.findMany({
    where: { deliveredAt: null, nextAttemptAt: { lte: new Date() } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: Math.min(Math.max(limit, 1), 100),
  });
  let delivered = 0;
  for (const row of rows) {
    try {
      const data = row.payload as unknown as Evidence;
      // Append and acknowledgement are atomic. Stable IDs also make concurrent
      // workers and lost responses harmless; never overwrite audit evidence.
      await withoutAuditActor(() => prisma.$transaction(async tx => {
        let auditModule = data.module;
        if (auditModule === "COURSE") auditModule = await tx.storeFeatureEntitlement.findFirst({
          where: { storeId: data.storeId, featureKey: "business.music", status: "ENABLED" },
          select: { storeId: true },
        }) ? "MUSIC" : "FITNESS";
        await tx.auditLog.createMany({ data: [{ ...data, module: auditModule, id: `audit-outbox:${row.id}`, createdAt: row.createdAt }], skipDuplicates: true });
        await tx.operationAuditOutbox.update({ where: { id: row.id }, data: { deliveredAt: new Date() } });
      }));
      delivered++;
    } catch {
      // Keep evidence indefinitely until delivered. Bound retry rate, not the
      // number of attempts. Do not log payloads or database error text.
      const delay = Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7));
      await prisma.operationAuditOutbox.updateMany({ where: { id: row.id, deliveredAt: null },
        data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + delay) } });
    }
  }
  return { delivered, pending: rows.length - delivered };
}
