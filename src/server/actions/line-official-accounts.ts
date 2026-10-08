"use server";

import { getHqStoreViewContext } from "@/lib/hq-store-view-context";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getLineBotInfo } from "@/lib/line";
import { getLineConfigForStore } from "@/lib/line-config";
import { getConfiguredStoreLine, readStoreLineConfigs } from "@/lib/store-line-config";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import type { ActionResult } from "@/types";

const STORE_SLUGS = ["zhubei", "hsinchu", "taichung"] as const;

export type LineOfficialAccountStatus = {
  storeSlug: string;
  storeName: string;
  status: "NORMAL" | "NEEDS_ATTENTION" | "NOT_CONFIGURED";
};

async function requireHeadquartersLineAccess() {
  const user = await requirePermission("business_hours.manage");
  if (getHqStoreViewContext(user) || (user.role !== "OWNER" && user.role !== "ADMIN")) {
    throw new AppError("FORBIDDEN", "僅限 OWNER 或 ADMIN 可以執行此檢查");
  }
}

async function inspectStore(
  store: { id: string; slug: string; name: string; lineDestination: string | null },
  repair: boolean,
): Promise<LineOfficialAccountStatus> {
  const storeSlug = store.slug;
  const config = getLineConfigForStore(store.id);

  if (!config.accessToken || !config.channelSecret || !config.expectedBasicId) {
    return { storeSlug, storeName: store.name, status: "NOT_CONFIGURED" };
  }

  const result = await getLineBotInfo(store.id);
  if (!result.ok || result.data.basicId !== config.expectedBasicId) {
    return { storeSlug, storeName: store.name, status: "NEEDS_ATTENTION" };
  }

  // Shared course OAs are registered in server configuration. The legacy DB
  // destination is unique per store and must never be written for both stores.
  const explicit = getConfiguredStoreLine(store.id);
  if (explicit?.sharedAccountKey) {
    return { storeSlug, storeName: store.name,
      status: result.data.userId === explicit.destination ? "NORMAL" : "NEEDS_ATTENTION" };
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
  const configured = readStoreLineConfigs();
  const configuredBySlug = new Map(configured.map(entry => [entry.slug, entry]));
  const storeSlugs = [...new Set<string>([...STORE_SLUGS, ...configured.map(entry => entry.slug)])];
  const stores = await prisma.store.findMany({
    where: { slug: { in: storeSlugs } },
    select: { id: true, slug: true, name: true, lineDestination: true },
  });
  const bySlug = new Map(stores.map((store) => [store.slug, store]));

  return Promise.all(
    storeSlugs.map(async (storeSlug) => {
      const store = bySlug.get(storeSlug);
      const legacyNames: Record<string, string> = { zhubei: "竹北", hsinchu: "新竹", taichung: "台中" };
      const storeName = store?.name ?? legacyNames[storeSlug] ?? storeSlug;
      if (!store) {
        return { storeSlug, storeName, status: "NOT_CONFIGURED" as const };
      }
      const explicit = configuredBySlug.get(storeSlug);
      if (explicit && explicit.storeId !== store.id) {
        return { storeSlug, storeName, status: "NEEDS_ATTENTION" as const };
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
  if (!store) {
    throw new AppError("NOT_FOUND", "找不到此店舖的 LINE 官方帳號設定");
  }
  // Config resolution already supports legacy stores and registered new stores.
  // Do not require per-store code changes here; permission + active store scope
  // still apply, and absent credentials return NOT_CONFIGURED in inspectStore.
  return store;
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
