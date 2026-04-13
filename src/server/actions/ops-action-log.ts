"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { currentStoreId } from "@/lib/store";
import { handleActionError } from "@/lib/errors";
import type { ActionResult } from "@/types";

// ============================================================
// Types
// ============================================================

export type OpsModule = "alert" | "customer_action" | "recommendation";

export type AlertStatus = "resolved" | "ignored" | "snoozed";
export type CustomerActionStatus = "contacted" | "tracking" | "closed" | "skipped";
export type RecommendationStatus = "adopted" | "rejected";

export interface OpsActionLogEntry {
  id: string;
  module: string;
  refId: string;
  status: string;
  note: string | null;
  actorUserId: string;
  actorName?: string;
  assigneeStaffId: string | null;
  assigneeName?: string | null;
  dueDate: Date | null;
  outcomeStatus: string | null;
  outcomeNote: string | null;
  outcomeMetric: string | null;
  outcomeAt: Date | null;
  updatedAt: Date;
}

export interface OpsHistoryEntry {
  id: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  actorName: string;
  createdAt: Date;
}

// ============================================================
// Internal: upsert with history tracking
// ============================================================

async function upsertOpsAction(
  module: OpsModule,
  refId: string,
  status: string,
  note?: string | null,
): Promise<ActionResult<OpsActionLogEntry>> {
  try {
    const user = await requireStaffSession();
    const storeId = currentStoreId(user);

    const existing = await prisma.opsActionLog.findUnique({
      where: { storeId_module_refId: { storeId, module, refId } },
    });

    const log = await prisma.opsActionLog.upsert({
      where: { storeId_module_refId: { storeId, module, refId } },
      create: {
        storeId,
        module,
        refId,
        status,
        note: note ?? null,
        actorUserId: user.id,
      },
      update: {
        status,
        note: note !== undefined ? note : undefined,
        actorUserId: user.id,
      },
      include: {
        actor: { select: { name: true } },
        assignee: { select: { displayName: true } },
      },
    });

    // Record status change history
    if (!existing || existing.status !== status) {
      await prisma.opsActionHistory.create({
        data: {
          opsActionLogId: log.id,
          actorUserId: user.id,
          action: "status_change",
          oldValue: existing?.status ?? null,
          newValue: status,
        },
      });
    }

    // Record note change history
    if (note !== undefined && note !== null && existing?.note !== note) {
      await prisma.opsActionHistory.create({
        data: {
          opsActionLogId: log.id,
          actorUserId: user.id,
          action: "note",
          oldValue: existing?.note ?? null,
          newValue: note,
        },
      });
    }

    revalidatePath("/dashboard/ops");

    return {
      success: true,
      data: {
        ...log,
        actorName: log.actor.name,
        assigneeName: log.assignee?.displayName ?? null,
      },
    };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// Public: status marking actions
// ============================================================

export async function markAlert(
  refId: string,
  status: AlertStatus,
): Promise<ActionResult<OpsActionLogEntry>> {
  return upsertOpsAction("alert", refId, status);
}

export async function markCustomerAction(
  refId: string,
  status: CustomerActionStatus,
  note?: string,
): Promise<ActionResult<OpsActionLogEntry>> {
  return upsertOpsAction("customer_action", refId, status, note);
}

export async function updateCustomerActionNote(
  refId: string,
  note: string,
): Promise<ActionResult<OpsActionLogEntry>> {
  try {
    const user = await requireStaffSession();
    const storeId = currentStoreId(user);

    const existing = await prisma.opsActionLog.findUnique({
      where: { storeId_module_refId: { storeId, module: "customer_action", refId } },
    });

    if (!existing) {
      return upsertOpsAction("customer_action", refId, "tracking", note);
    }

    const log = await prisma.opsActionLog.update({
      where: { storeId_module_refId: { storeId, module: "customer_action", refId } },
      data: { note, actorUserId: user.id },
      include: {
        actor: { select: { name: true } },
        assignee: { select: { displayName: true } },
      },
    });

    // Record note history
    if (existing.note !== note) {
      await prisma.opsActionHistory.create({
        data: {
          opsActionLogId: log.id,
          actorUserId: user.id,
          action: "note",
          oldValue: existing.note,
          newValue: note,
        },
      });
    }

    revalidatePath("/dashboard/ops");
    return {
      success: true,
      data: {
        ...log,
        actorName: log.actor.name,
        assigneeName: log.assignee?.displayName ?? null,
      },
    };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function markRecommendation(
  refId: string,
  status: RecommendationStatus,
): Promise<ActionResult<OpsActionLogEntry>> {
  return upsertOpsAction("recommendation", refId, status);
}

// ============================================================
// Public: assignment actions
// ============================================================

export async function assignOpsAction(
  module: OpsModule,
  refId: string,
  staffId: string | null,
): Promise<ActionResult<OpsActionLogEntry>> {
  try {
    const user = await requireStaffSession();
    const storeId = currentStoreId(user);

    // Ensure the log exists (create with initial status if not)
    let existing = await prisma.opsActionLog.findUnique({
      where: { storeId_module_refId: { storeId, module, refId } },
      include: { assignee: { select: { displayName: true } } },
    });

    if (!existing) {
      await prisma.opsActionLog.create({
        data: {
          storeId,
          module,
          refId,
          status: "tracking",
          actorUserId: user.id,
          assigneeStaffId: staffId,
        },
      });
      existing = await prisma.opsActionLog.findUnique({
        where: { storeId_module_refId: { storeId, module, refId } },
        include: { assignee: { select: { displayName: true } } },
      });
    } else {
      await prisma.opsActionLog.update({
        where: { storeId_module_refId: { storeId, module, refId } },
        data: { assigneeStaffId: staffId, actorUserId: user.id },
      });
    }

    // Get assignee name for history
    let newAssigneeName: string | null = null;
    if (staffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { displayName: true },
      });
      newAssigneeName = staff?.displayName ?? null;
    }

    // Record assignment history
    await prisma.opsActionHistory.create({
      data: {
        opsActionLogId: existing!.id,
        actorUserId: user.id,
        action: "assign",
        oldValue: existing!.assignee?.displayName ?? null,
        newValue: newAssigneeName,
      },
    });

    const updated = await prisma.opsActionLog.findUnique({
      where: { storeId_module_refId: { storeId, module, refId } },
      include: {
        actor: { select: { name: true } },
        assignee: { select: { displayName: true } },
      },
    });

    revalidatePath("/dashboard/ops");

    return {
      success: true,
      data: {
        ...updated!,
        actorName: updated!.actor.name,
        assigneeName: updated!.assignee?.displayName ?? null,
      },
    };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function setOpsActionDueDate(
  module: OpsModule,
  refId: string,
  dueDate: string | null, // ISO string or null
): Promise<ActionResult<OpsActionLogEntry>> {
  try {
    const user = await requireStaffSession();
    const storeId = currentStoreId(user);
    const dueDateVal = dueDate ? new Date(dueDate) : null;

    let existing = await prisma.opsActionLog.findUnique({
      where: { storeId_module_refId: { storeId, module, refId } },
    });

    if (!existing) {
      existing = await prisma.opsActionLog.create({
        data: {
          storeId,
          module,
          refId,
          status: "tracking",
          actorUserId: user.id,
          dueDate: dueDateVal,
        },
      });
    } else {
      await prisma.opsActionLog.update({
        where: { storeId_module_refId: { storeId, module, refId } },
        data: { dueDate: dueDateVal, actorUserId: user.id },
      });
    }

    // Record due date history
    await prisma.opsActionHistory.create({
      data: {
        opsActionLogId: existing.id,
        actorUserId: user.id,
        action: "due_date",
        oldValue: existing.dueDate?.toISOString().slice(0, 10) ?? null,
        newValue: dueDateVal?.toISOString().slice(0, 10) ?? null,
      },
    });

    const updated = await prisma.opsActionLog.findUnique({
      where: { storeId_module_refId: { storeId, module, refId } },
      include: {
        actor: { select: { name: true } },
        assignee: { select: { displayName: true } },
      },
    });

    revalidatePath("/dashboard/ops");

    return {
      success: true,
      data: {
        ...updated!,
        actorName: updated!.actor.name,
        assigneeName: updated!.assignee?.displayName ?? null,
      },
    };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// Public: fetch action logs for a module
// ============================================================

export async function getOpsActionLogs(
  module: OpsModule,
): Promise<Map<string, OpsActionLogEntry>> {
  const user = await requireStaffSession();
  const storeId = currentStoreId(user);

  const logs = await prisma.opsActionLog.findMany({
    where: { storeId, module },
    include: {
      actor: { select: { name: true } },
      assignee: { select: { displayName: true } },
    },
  });

  const map = new Map<string, OpsActionLogEntry>();
  for (const log of logs) {
    map.set(log.refId, {
      ...log,
      actorName: log.actor.name,
      assigneeName: log.assignee?.displayName ?? null,
    });
  }
  return map;
}

// ============================================================
// Public: fetch history for a specific item
// ============================================================

export async function getOpsActionHistory(
  module: OpsModule,
  refId: string,
): Promise<OpsHistoryEntry[]> {
  const user = await requireStaffSession();
  const storeId = currentStoreId(user);

  const log = await prisma.opsActionLog.findUnique({
    where: { storeId_module_refId: { storeId, module, refId } },
  });

  if (!log) return [];

  const histories = await prisma.opsActionHistory.findMany({
    where: { opsActionLogId: log.id },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return histories.map((h) => ({
    id: h.id,
    action: h.action,
    oldValue: h.oldValue,
    newValue: h.newValue,
    note: h.note,
    actorName: h.actor.name,
    createdAt: h.createdAt,
  }));
}

// ============================================================
// Public: fetch active staff list (for assignment dropdown)
// ============================================================

export async function getActiveStaffList(): Promise<
  { id: string; displayName: string; colorCode: string }[]
> {
  const user = await requireStaffSession();
  const storeId = currentStoreId(user);

  return prisma.staff.findMany({
    where: { storeId, status: "ACTIVE" },
    select: { id: true, displayName: true, colorCode: true },
    orderBy: { displayName: "asc" },
  });
}

// ============================================================
// Public: record outcome (effectiveness tracking)
// ============================================================

export type OutcomeStatus = "improved" | "no_change" | "pending";

export async function recordOutcome(
  module: OpsModule,
  refId: string,
  outcomeStatus: OutcomeStatus,
  outcomeNote?: string,
  outcomeMetric?: string,
): Promise<ActionResult<OpsActionLogEntry>> {
  try {
    const user = await requireStaffSession();
    const storeId = currentStoreId(user);

    const existing = await prisma.opsActionLog.findUnique({
      where: { storeId_module_refId: { storeId, module, refId } },
    });

    if (!existing) {
      return { success: false, error: "找不到此操作記錄" };
    }

    const log = await prisma.opsActionLog.update({
      where: { storeId_module_refId: { storeId, module, refId } },
      data: {
        outcomeStatus,
        outcomeNote: outcomeNote ?? null,
        outcomeMetric: outcomeMetric ?? null,
        outcomeAt: new Date(),
        actorUserId: user.id,
      },
      include: {
        actor: { select: { name: true } },
        assignee: { select: { displayName: true } },
      },
    });

    // Record history
    await prisma.opsActionHistory.create({
      data: {
        opsActionLogId: log.id,
        actorUserId: user.id,
        action: "outcome",
        oldValue: existing.outcomeStatus,
        newValue: outcomeStatus,
        note: outcomeMetric ?? outcomeNote ?? null,
      },
    });

    revalidatePath("/dashboard/ops");

    return {
      success: true,
      data: {
        ...log,
        actorName: log.actor.name,
        assigneeName: log.assignee?.displayName ?? null,
      },
    };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// Public: effectiveness summary query
// ============================================================

export interface EffectivenessSummary {
  totalActioned: number;
  improved: number;
  noChange: number;
  pending: number;
  notTracked: number;
  byModule: {
    module: string;
    total: number;
    improved: number;
  }[];
  recentOutcomes: {
    module: string;
    refId: string;
    status: string;
    outcomeStatus: string;
    outcomeMetric: string | null;
    outcomeNote: string | null;
    outcomeAt: Date;
  }[];
}

export async function getEffectivenessSummary(): Promise<EffectivenessSummary> {
  const user = await requireStaffSession();
  const storeId = currentStoreId(user);

  const allLogs = await prisma.opsActionLog.findMany({
    where: {
      storeId,
      status: { notIn: ["snoozed"] }, // only count actually actioned items
    },
    select: {
      module: true,
      refId: true,
      status: true,
      outcomeStatus: true,
      outcomeMetric: true,
      outcomeNote: true,
      outcomeAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const totalActioned = allLogs.length;
  const improved = allLogs.filter((l) => l.outcomeStatus === "improved").length;
  const noChange = allLogs.filter((l) => l.outcomeStatus === "no_change").length;
  const pendingOutcome = allLogs.filter((l) => l.outcomeStatus === "pending").length;
  const notTracked = allLogs.filter((l) => !l.outcomeStatus).length;

  // By module
  const modules = ["alert", "customer_action", "recommendation"];
  const byModule = modules.map((m) => {
    const moduleLogs = allLogs.filter((l) => l.module === m);
    return {
      module: m,
      total: moduleLogs.length,
      improved: moduleLogs.filter((l) => l.outcomeStatus === "improved").length,
    };
  });

  // Recent outcomes
  const recentOutcomes = allLogs
    .filter((l) => l.outcomeStatus && l.outcomeAt)
    .slice(0, 10)
    .map((l) => ({
      module: l.module,
      refId: l.refId,
      status: l.status,
      outcomeStatus: l.outcomeStatus!,
      outcomeMetric: l.outcomeMetric,
      outcomeNote: l.outcomeNote,
      outcomeAt: l.outcomeAt!,
    }));

  return {
    totalActioned,
    improved,
    noChange,
    pending: pendingOutcome,
    notTracked,
    byModule,
    recentOutcomes,
  };
}
