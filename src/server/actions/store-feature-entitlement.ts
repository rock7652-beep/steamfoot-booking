"use server";

import { revalidatePath } from "next/cache";
import type {
  StoreFeatureEntitlementSource,
  StoreFeatureEntitlementStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { dayRange } from "@/lib/date-utils";
import { AppError } from "@/lib/errors";
import { FEATURES } from "@/lib/feature-flags";
import { revalidateStoreFeatureEntitlements } from "@/lib/revalidation";
import { requireAdminSession } from "@/lib/session";
import type { ActionResult } from "@/types";

export type StoreFeatureEntitlementFormState = {
  success: string | null;
  error: string | null;
};

const ENTITLEMENT_STATUSES = new Set<StoreFeatureEntitlementStatus>([
  "ENABLED",
  "DISABLED",
]);

const ENTITLEMENT_SOURCES = new Set<StoreFeatureEntitlementSource>([
  "ADDON",
  "MANUAL",
  "PROMO",
  "HQ_OVERRIDE",
]);

const FEATURE_KEY_SET = new Set<string>(Object.values(FEATURES));

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseDateBoundary(value: string, boundary: "start" | "end"): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError("VALIDATION", "日期格式不正確");
  }
  const range = dayRange(value);
  return boundary === "start" ? range.start : range.end;
}

export async function saveStoreFeatureEntitlementAction(
  _prevState: StoreFeatureEntitlementFormState,
  formData: FormData,
): Promise<StoreFeatureEntitlementFormState> {
  const result = await saveStoreFeatureEntitlement(formData);
  if (!result.success) return { success: null, error: result.error };
  return { success: "功能設定已更新", error: null };
}

export async function saveStoreFeatureEntitlement(
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const admin = await requireAdminSession();
    const storeId = readString(formData, "storeId");
    const featureKey = readString(formData, "featureKey");
    const override = readString(formData, "override");
    const source = readString(formData, "source") || "MANUAL";
    const startsAtInput = readString(formData, "startsAt");
    const expiresAtInput = readString(formData, "expiresAt");
    const note = readString(formData, "note");

    if (!storeId) return { success: false, error: "缺少店舖資訊" };
    if (!FEATURE_KEY_SET.has(featureKey)) return { success: false, error: "無效的功能代碼" };

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!store) return { success: false, error: "店舖不存在" };

    if (override === "INHERIT") {
      await prisma.storeFeatureEntitlement.deleteMany({
        where: { storeId, featureKey },
      });
      revalidateStoreFeatureEntitlements();
      revalidatePath(`/hq/dashboard/stores/${storeId}`);
      revalidatePath(`/hq/dashboard/stores/${storeId}/features`);
      return { success: true, data: undefined };
    }

    if (!ENTITLEMENT_STATUSES.has(override as StoreFeatureEntitlementStatus)) {
      return { success: false, error: "無效的覆寫狀態" };
    }
    if (!ENTITLEMENT_SOURCES.has(source as StoreFeatureEntitlementSource)) {
      return { success: false, error: "無效的來源" };
    }

    const startsAt = parseDateBoundary(startsAtInput, "start");
    const expiresAt = parseDateBoundary(expiresAtInput, "end");
    if (startsAt && expiresAt && startsAt > expiresAt) {
      return { success: false, error: "開始日不可晚於到期日" };
    }

    await prisma.storeFeatureEntitlement.upsert({
      where: {
        uq_store_feature_entitlement: {
          storeId,
          featureKey,
        },
      },
      create: {
        storeId,
        featureKey,
        status: override as StoreFeatureEntitlementStatus,
        source: source as StoreFeatureEntitlementSource,
        startsAt,
        expiresAt,
        note: note || null,
        createdBy: admin.id,
        updatedBy: admin.id,
      },
      update: {
        status: override as StoreFeatureEntitlementStatus,
        source: source as StoreFeatureEntitlementSource,
        startsAt,
        expiresAt,
        note: note || null,
        updatedBy: admin.id,
      },
    });

    revalidateStoreFeatureEntitlements();
    revalidatePath(`/hq/dashboard/stores/${storeId}`);
    revalidatePath(`/hq/dashboard/stores/${storeId}/features`);

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof AppError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}

export async function setDigitalButlerActivationAction(
  _previous: StoreFeatureEntitlementFormState,
  formData: FormData,
): Promise<StoreFeatureEntitlementFormState> {
  try {
    await requireAdminSession();
    const storeId = readString(formData, "storeId");
    const enabled = readString(formData, "enabled") === "true";
    if (!storeId) return { success: null, error: "缺少店舖資訊" };

    if (enabled) {
      const entitlement = await prisma.storeFeatureEntitlement.findUnique({
        where: {
          uq_store_feature_entitlement: {
            storeId,
            featureKey: FEATURES.DIGITAL_BUTLER,
          },
        },
        select: { status: true, startsAt: true, expiresAt: true },
      });
      const now = new Date();
      const active =
        entitlement?.status === "ENABLED" &&
        (!entitlement.startsAt || entitlement.startsAt <= now) &&
        (!entitlement.expiresAt || entitlement.expiresAt >= now);
      if (!active) {
        return { success: null, error: "請先為此店開啟有效的數位管家功能授權" };
      }
    }

    const updated = await prisma.store.updateMany({
      where: { id: storeId },
      data: { digitalButlerEnabled: enabled },
    });
    if (updated.count !== 1) return { success: null, error: "店舖不存在" };
    revalidatePath(`/hq/dashboard/stores/${storeId}/features`);
    revalidatePath("/dashboard/settings/digital-butler");
    revalidatePath("/dashboard/digital-butler/leads");
    return {
      success: enabled ? "數位管家已啟用" : "數位管家已緊急關閉",
      error: null,
    };
  } catch (error) {
    return {
      success: null,
      error: error instanceof Error ? error.message : "操作失敗",
    };
  }
}
