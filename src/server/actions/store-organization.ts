"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { requireAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { assertOrganizationCapacity, organizationDescendants } from "@/lib/alliance-subscription";
import { assertValidStoreParentAssignment } from "@/lib/store-organization";
import type { ActionResult } from "@/types";

export interface StoreOrganizationRow {
  id: string;
  name: string;
  slug: string;
  parentStoreId: string | null;
  plan: string;
  maxStoresOverride: number | null;
  isDemo: boolean;
  operatingStatus: string;
  createdAt: Date;
}

export async function listStoreOrganizationAction(): Promise<
  ActionResult<StoreOrganizationRow[]>
> {
  await requireAdminSession();

  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      parentStoreId: true,
      plan: true,
      maxStoresOverride: true,
      isDemo: true,
      operatingStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return { success: true, data: stores };
}

export async function updateStoreParentAction(input: {
  storeId: string;
  parentStoreId?: string | null;
}): Promise<ActionResult<{ storeId: string; parentStoreId: string | null }>> {
  try {
    const admin = await requireAdminSession();
    await requirePermission("staff.manage");
    const storeId = input.storeId?.trim();
    const parentStoreId = normalizeParentStoreId(input.parentStoreId);

    if (!storeId) {
      throw new AppError("VALIDATION", "請選擇要調整的店舖");
    }

    const [store, parent] = await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: { id: true, name: true, parentStoreId: true },
      }),
      parentStoreId
        ? prisma.store.findUnique({
            where: { id: parentStoreId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    if (!store) {
      throw new AppError("NOT_FOUND", "店舖不存在");
    }
    if (parentStoreId && !parent) {
      throw new AppError("NOT_FOUND", "上層店舖不存在");
    }
    if (store.parentStoreId === parentStoreId) {
      return { success: true, data: { storeId, parentStoreId } };
    }

    await assertValidStoreParentAssignment(storeId, parentStoreId);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(72819401)`;
      const rows = await tx.store.findMany({ select: { id: true, name: true, parentStoreId: true, plan: true, maxStoresOverride: true } });
      const current = rows.find(row => row.id === storeId);
      if (!current) throw new AppError("NOT_FOUND", "店舖不存在");
      const proposed = rows.map(row => row.id === storeId ? { ...row, parentStoreId } : row);
      try {
        organizationDescendants(proposed, storeId);
        assertOrganizationCapacity(proposed, parentStoreId);
      } catch (error) {
        throw new AppError("BUSINESS_RULE", error instanceof Error ? error.message : "無法更新組織");
      }
      await tx.store.update({
        where: { id: storeId },
        data: { parentStoreId },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          targetType: "Store",
          targetId: storeId,
          action: "UPDATE_ORGANIZATION_PARENT",
          beforeJson: {
            parentStoreId: current.parentStoreId,
          } satisfies Prisma.InputJsonValue,
          afterJson: {
            parentStoreId,
            parentStoreName: parent?.name ?? null,
          } satisfies Prisma.InputJsonValue,
        },
      });
    });

    revalidatePath("/hq/dashboard/stores");
    revalidatePath("/hq/dashboard/stores/organization");
    revalidatePath(`/hq/dashboard/stores/${storeId}`);

    return { success: true, data: { storeId, parentStoreId } };
  } catch (e) {
    return handleActionError(e);
  }
}

function normalizeParentStoreId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "__none__") return null;
  return trimmed;
}

/** Platform admin records purchased slots only; this never charges a payment method. */
export async function updateOrganizationCapacityAction(input: {
  storeId: string; purchasedBranches: number;
}): Promise<ActionResult<{ purchasedBranches: number }>> {
  try {
    const admin = await requireAdminSession();
    await requirePermission("staff.manage");
    if (!input.storeId?.trim() || !Number.isSafeInteger(input.purchasedBranches) || input.purchasedBranches < 1 || input.purchasedBranches > 2147483646) {
      throw new AppError("VALIDATION", "請輸入有效的已購分店數（至少 1 家）");
    }
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(72819401)`;
      const rows = await tx.store.findMany({ select: { id: true, name: true, parentStoreId: true, plan: true, maxStoresOverride: true } });
      const hq = rows.find(s => s.id === input.storeId);
      if (!hq || hq.plan !== "ALLIANCE") throw new AppError("BUSINESS_RULE", "僅展店版總部可設定串接額度");
      if (organizationDescendants(rows, hq.id).size > input.purchasedBranches) {
        throw new AppError("BUSINESS_RULE", "額度不可少於目前已串接的分店數，請先調整組織");
      }
      await tx.store.update({ where: { id: hq.id }, data: { maxStoresOverride: input.purchasedBranches + 1 } });
      await tx.auditLog.create({ data: {
        actorUserId: admin.id, targetType: "Store", targetId: hq.id, action: "UPDATE_ORGANIZATION_CAPACITY",
        beforeJson: { maxStoresOverride: hq.maxStoresOverride },
        afterJson: { maxStoresOverride: input.purchasedBranches + 1, purchasedBranches: input.purchasedBranches },
      } });
    });
    revalidatePath("/hq/dashboard/stores/organization");
    revalidatePath("/dashboard/settings/plan");
    return { success: true, data: { purchasedBranches: input.purchasedBranches } };
  } catch (e) { return handleActionError(e); }
}
