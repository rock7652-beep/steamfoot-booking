"use server";

import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getLineBotInfo } from "@/lib/line";
import { getLineConfigForStore } from "@/lib/line-config";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import type { ActionResult } from "@/types";

const STORE_SLUGS = ["zhubei", "hsinchu", "taichung"] as const;
type StoreSlug = (typeof STORE_SLUGS)[number];

export type LineOfficialAccountStatus = {
  storeSlug: StoreSlug;
  storeName: string;
  status: "NORMAL" | "NEEDS_ATTENTION" | "NOT_CONFIGURED";
};

async function requireHeadquartersLineAccess() {
  const user = await requirePermission("business_hours.manage");
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "僅限 OWNER 或 ADMIN 可以執行此檢查");
  }
}

async function inspectStore(
  store: { id: string; slug: string; name: string; lineDestination: string | null },
  repair: boolean,
): Promise<LineOfficialAccountStatus> {
  const storeSlug = store.slug as StoreSlug;
  const config = getLineConfigForStore(store.id);

  if (!config.accessToken || !config.channelSecret || !config.expectedBasicId) {
    return { storeSlug, storeName: store.name, status: "NOT_CONFIGURED" };
  }

  const result = await getLineBotInfo(store.id);
  if (!result.ok || result.data.basicId !== config.expectedBasicId) {
    return { storeSlug, storeName: store.name, status: "NEEDS_ATTENTION" };
  }

  if (result.data.userId !== store.lineDestination) {
    if (!repair) {
      return { storeSlug, storeName: store.name, status: "NEEDS_ATTENTION" };
    }
    await prisma.store.update({
      where: { id: store.id },
      data: { lineDestination: result.data.userId },
    });
  }

  return { storeSlug, storeName: store.name, status: "NORMAL" };
}

async function collectStatuses(repair: boolean): Promise<LineOfficialAccountStatus[]> {
  const stores = await prisma.store.findMany({
    where: { slug: { in: [...STORE_SLUGS] } },
    select: { id: true, slug: true, name: true, lineDestination: true },
  });
  const bySlug = new Map(stores.map((store) => [store.slug, store]));

  return Promise.all(
    STORE_SLUGS.map(async (storeSlug) => {
      const store = bySlug.get(storeSlug);
      const storeName = store?.name ?? ({ zhubei: "竹北", hsinchu: "新竹", taichung: "台中" }[storeSlug]);
      if (!store) {
        return { storeSlug, storeName, status: "NOT_CONFIGURED" as const };
      }
      return inspectStore(store, repair);
    }),
  );
}

async function requireCurrentStoreLineAccess() {
  const user = await requirePermission("business_hours.manage");
  const activeStoreId = await getActiveStoreForRead(user);
  if (!activeStoreId) {
    throw new AppError("FORBIDDEN", "請先切換至特定店舖後再執行檢查");
  }
  await requireStoreFeature(activeStoreId, FEATURES.LINE_REMINDER);
  const store = await prisma.store.findUnique({
    where: { id: activeStoreId },
    select: { id: true, slug: true, name: true, lineDestination: true },
  });
  if (!store || !STORE_SLUGS.includes(store.slug as StoreSlug)) {
    throw new AppError("NOT_FOUND", "找不到此店舖的 LINE 官方帳號設定");
  }
  return store as typeof store & { slug: StoreSlug };
}

export async function getAllLineOfficialAccountStatuses(): Promise<LineOfficialAccountStatus[]> {
  await requireHeadquartersLineAccess();
  return collectStatuses(false);
}

export async function checkAllLineOfficialAccounts(): Promise<ActionResult<LineOfficialAccountStatus[]>> {
  try {
    await requireHeadquartersLineAccess();
    return { success: true, data: await collectStatuses(true) };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function getCurrentLineOfficialAccountStatus(): Promise<LineOfficialAccountStatus> {
  const store = await requireCurrentStoreLineAccess();
  return inspectStore(store, false);
}

export async function checkCurrentLineOfficialAccount(): Promise<ActionResult<LineOfficialAccountStatus>> {
  try {
    const store = await requireCurrentStoreLineAccess();
    return { success: true, data: await inspectStore(store, true) };
  } catch (error) {
    return handleActionError(error);
  }
}
