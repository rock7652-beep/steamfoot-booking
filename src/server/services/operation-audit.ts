import "server-only";
import { redactAuditValue } from "@/lib/audit-redact";
import { auditActorData, hasVerifiedAuditActor, registerAuditActor } from "./audit-actor-context";
import { currentAuditActor } from "@/lib/audit-db-context";

import type { Session } from "next-auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type OperationModule =
  | "STEAM"
  | "SPA"
  | "MUSIC"
  | "FITNESS"
  | "COURSE"
  | "SHARED"
  | "SYSTEM";
type AuditClient = Pick<Prisma.TransactionClient, "auditLog"> & Partial<Pick<Prisma.TransactionClient, "storeFeatureEntitlement">>;

export type OperationAuditInput = {
  actor?: object;
  actorUserId: string;
  actorNameSnapshot?: string | null;
  actorRoleSnapshot?: string | null;
  loginRecordId?: string | null;
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
  const auditModule = input.module === "COURSE"
    ? await resolveCourseOperationModule(input.storeId, client)
    : input.module;
  let session: Session | null = null;
  // An interactive transaction may hold the only connection. Never perform
  // a second auth/database lookup while using its client.
  if (client === prisma && !hasVerifiedAuditActor(input.actor, input.actorUserId)) {
    const { auth } = await import("@/lib/auth");
    try { session = await auth(); } catch {
      // Scheduled jobs have no request session; leave the login unlinked.
    }
  }
  const transactionActor = currentAuditActor();
  const verifiedActor = session?.user?.id === input.actorUserId ? registerAuditActor(session.user)
    : transactionActor?.id === input.actorUserId ? registerAuditActor(transactionActor) : input.actor;
  const actorData = auditActorData(verifiedActor, input.actorUserId);
  return client.auditLog.create({
    data: {
      source: /(?:^|_)AUTO_/.test(input.action) ? "SYSTEM" : "MANUAL",
      actorUserId: input.actorUserId,
      actorRoleSnapshot: actorData.actorRoleSnapshot ?? null,
      loginRecordId: actorData.loginRecordId ?? null,
      actorNameSnapshot: actorData.actorNameSnapshot ?? input.actorNameSnapshot?.trim() ?? null,
      storeId: input.storeId,
      module: auditModule,
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      summary: input.summary,
      ...(input.before === undefined ? {} : { beforeJson: redactAuditValue(input.before) as Prisma.InputJsonValue }),
      ...(input.after === undefined ? {} : { afterJson: redactAuditValue(input.after) as Prisma.InputJsonValue }),
    },
    select: { id: true },
  });
}

async function resolveCourseOperationModule(storeId: string, client: AuditClient): Promise<"MUSIC" | "FITNESS" | "COURSE"> {
  if (!client.storeFeatureEntitlement) return "COURSE";
  const music = await client.storeFeatureEntitlement.findFirst({
    where: { storeId, featureKey: "business.music", status: "ENABLED" },
    select: { storeId: true },
  });
  return music ? "MUSIC" : "FITNESS";
}

/** Cross-schema writes cannot share the business transaction; never report the
 * completed business action as failed only because its follow-up audit write failed. */
export async function recordOperationAuditBestEffort(input: OperationAuditInput) {
  try {
    const { persistFollowupAudit, deliverOperationAudits } = await import("./operation-audit-outbox");
    const pending = await persistFollowupAudit(input);
    // Queue already committed. Delivery failure cannot discard the evidence.
    try { await deliverOperationAudits(10); } catch { /* cron will retry */ }
    return pending;
  } catch (error) {
    console.error("[operation-audit] follow-up write failed", {
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      error: error instanceof Error ? error.name : "UnknownError",
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
      source: true, actorNameSnapshot: true, actorRoleSnapshot: true, loginRecordId: true, beforeJson: true, afterJson: true,
      actor: { select: { id: true, name: true, role: true } },
    },
  });
}

export type OperationAuditCenterFilters = {
  storeId?: string | null;
  storeIds?: string[];
  actorUserId?: string;
  loginRecordId?: string;
  module?: OperationModule;
  modules?: OperationModule[];
  keyword?: string;
  dateFrom: Date;
  dateTo: Date;
  page?: number;
  pageSize?: number;
};

function moduleWhere(input: Pick<OperationAuditCenterFilters, "module" | "modules">): Prisma.AuditLogWhereInput {
  const selected = input.module ? [input.module] : input.modules;
  if (!selected?.length) return {};
  const values = selected.filter((module) => module !== "SYSTEM");
  const includeSystem = selected.includes("SYSTEM");
  const clauses: Prisma.AuditLogWhereInput[] = values.length ? [{ module: { in: values } }] : [];
  if (includeSystem) clauses.push(
    { module: "SYSTEM" },
    { module: null, targetType: { in: ["Staff", "StaffPermission", "CourseTeacherFinanceScope"] } },
  );
  if (values.includes("COURSE")) clauses.push({
    module: null,
    targetType: { startsWith: "Course", notIn: ["CourseTeacherFinanceScope"] },
  });
  if (values.includes("STEAM")) clauses.push({ module: null, targetType: "Booking" });
  if (values.includes("SPA")) clauses.push({ module: null, targetType: { startsWith: "Spa" } });
  if (values.includes("SHARED")) clauses.push({
    module: null,
    targetType: { in: ["CashbookEntry", "Transaction"] },
  });
  return { AND: [{ OR: clauses }] };
}

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
    ...(input.loginRecordId ? { loginRecordId: input.loginRecordId } : {}),
    ...moduleWhere(input),
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
        source: true, actorNameSnapshot: true, actorRoleSnapshot: true, loginRecordId: true, beforeJson: true, afterJson: true, storeId: true,
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
        ...moduleWhere(input),
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
