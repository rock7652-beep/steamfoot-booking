"use server";

import { recordOperationAudit } from "@/server/services/operation-audit";
import { revalidatePath } from "next/cache";
import type {
  StoreFeatureEntitlementSource,
  StoreFeatureEntitlementStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { addonsPrisma } from "@/lib/addons-db";
import { addOnsDatabaseSelection, AddOnsDatabaseConfigurationError } from "@/lib/addons-database-url";
import { dayRange } from "@/lib/date-utils";
import { AppError } from "@/lib/errors";
import { FEATURES } from "@/lib/feature-flags";
import { revalidateStoreFeatureEntitlements } from "@/lib/revalidation";
import { requireAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import type { ActionResult } from "@/types";

export type StoreFeatureEntitlementFormState = {
  success: string | null;
  error: string | null;
};

const ENTITLEMENT_STATUSES = new Set<StoreFeatureEntitlementStatus>([
  "ENABLED",
  "DISABLED",
  "LOCKED",
  "HIDDEN",
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
    await requirePermission("staff.manage");
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
      select: { id: true, industryModule: true },
    });
    if (!store) return { success: false, error: "店舖不存在" };
    if (store.industryModule === "SPA") return { success: false, error: "SPA 模組已停用，歷史設定僅供封存" };

    if(featureKey===FEATURES.BEAUTY_SERVICE_ADD_ONS&&store.industryModule!=="BEAUTY")return {success:false,error:"加做服務僅適用美業店家"};
    if (featureKey === FEATURES.ADD_ONS || featureKey === FEATURES.BEAUTY_SERVICE_ADD_ONS) {
      if (override !== "INHERIT" && !ENTITLEMENT_STATUSES.has(override as StoreFeatureEntitlementStatus)) return {success:false,error:"無效的覆寫狀態"};
      if (!ENTITLEMENT_SOURCES.has(source as StoreFeatureEntitlementSource)) return {success:false,error:"無效的來源"};
      const startsAt=parseDateBoundary(startsAtInput,"start"),expiresAt=parseDateBoundary(expiresAtInput,"end");
      if(startsAt&&expiresAt&&startsAt>expiresAt)return {success:false,error:"開始日不可晚於到期日"};
      if(featureKey===FEATURES.ADD_ONS&&override==="ENABLED"){
        // Verify on the dedicated connection before opening the main-client write
        // transaction. Disabling must remain possible when that connection is down.
        try{
          addOnsDatabaseSelection();
          const available=await addonsPrisma.$transaction(async tx=>{
            const scopedStore=await tx.store.findUnique({where:{id:storeId},select:{id:true}});
            if(!scopedStore)return false;
            await tx.serviceAddOnCatalog.findFirst({where:{storeId},select:{enabled:true}});
            return true;
          });
          if(!available)return {success:false,error:"加購商品專用連線尚未授權此門市，暫時無法啟用。"};
        }catch(error){
          return {success:false,error:error instanceof AddOnsDatabaseConfigurationError?"加購商品尚未完成專用連線設定，暫時無法啟用。":"加購商品專用連線驗證未通過，暫時無法啟用；請聯絡系統管理員。"};
        }
      }
      await prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
        const where={uq_store_feature_entitlement:{storeId,featureKey}};
        const before=await tx.storeFeatureEntitlement.findUnique({where});
        if(override==="INHERIT")await tx.storeFeatureEntitlement.deleteMany({where:{storeId,featureKey}});
        else await tx.storeFeatureEntitlement.upsert({where,create:{storeId,featureKey,status:override as StoreFeatureEntitlementStatus,source:source as StoreFeatureEntitlementSource,startsAt,expiresAt,note:note||null,createdBy:admin.id,updatedBy:admin.id},update:{status:override as StoreFeatureEntitlementStatus,source:source as StoreFeatureEntitlementSource,startsAt,expiresAt,note:note||null,updatedBy:admin.id}});
        const snapshot=(value:typeof before)=>value?{status:value.status,source:value.source,startsAt:value.startsAt?.toISOString()??null,expiresAt:value.expiresAt?.toISOString()??null}:null;
        const after=await tx.storeFeatureEntitlement.findUnique({where});
        await recordOperationAudit({actor:admin,actorUserId:admin.id,storeId,module:"SYSTEM",targetType:"StoreFeatureEntitlement",targetId:featureKey,action:"SET_ADD_ONS_FEATURE",summary:featureKey===FEATURES.BEAUTY_SERVICE_ADD_ONS?"總部調整加做服務功能":"總部調整附加項目功能",before:{entitlement:snapshot(before)},after:{entitlement:snapshot(after)}},tx);
      });
      revalidateStoreFeatureEntitlements();
      revalidatePath(`/hq/dashboard/stores/${storeId}`);
      revalidatePath(`/hq/dashboard/stores/${storeId}/features`);
      revalidatePath('/dashboard/add-ons');
      revalidatePath('/dashboard/beauty');
      return {success:true,data:undefined};
    }

    if (featureKey === FEATURES.SHARED_CARD) {
      if (override !== "INHERIT" && !ENTITLEMENT_STATUSES.has(override as StoreFeatureEntitlementStatus)) return { success: false, error: "無效的覆寫狀態" };
      if (!ENTITLEMENT_SOURCES.has(source as StoreFeatureEntitlementSource)) return { success: false, error: "無效的來源" };
      const startsAt = parseDateBoundary(startsAtInput, "start");
      const expiresAt = parseDateBoundary(expiresAtInput, "end");
      if (startsAt && expiresAt && startsAt > expiresAt) return { success: false, error: "開始日不可晚於到期日" };
      await prisma.$transaction(async tx => {
        // Serialize HQ shutdown with member, reservation and plan mutations.
        const stores = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT s.id FROM "Store" s WHERE s.id = ${storeId}
            AND s."industryModule"::text = 'COURSE'
            AND NOT EXISTS (SELECT 1 FROM "StoreFeatureEntitlement" m
              WHERE m."storeId" = s.id AND m."featureKey" = 'business.music'
                AND m.status::text = 'ENABLED') FOR UPDATE OF s`;
        if (!stores.length) throw new AppError("FORBIDDEN", "共卡獨立開關目前僅適用運動課程門市");
        if (override === "INHERIT") {
          await tx.storeFeatureEntitlement.deleteMany({ where: { storeId, featureKey } });
          return;
        }
        const data = { status: override as StoreFeatureEntitlementStatus, source: source as StoreFeatureEntitlementSource, startsAt, expiresAt, note: note || null, updatedBy: admin.id };
        await tx.storeFeatureEntitlement.upsert({
          where: { uq_store_feature_entitlement: { storeId, featureKey } },
          create: { ...data, storeId, featureKey, createdBy: admin.id },
          update: data,
        });
      });
      revalidateStoreFeatureEntitlements();
      revalidatePath(`/hq/dashboard/stores/${storeId}`);
      revalidatePath(`/hq/dashboard/stores/${storeId}/features`);
      revalidatePath("/dashboard/courses");
      revalidatePath("/book");
      return { success: true, data: undefined };
    }

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
    await requirePermission("staff.manage");
    const storeId = readString(formData, "storeId");
    const enabled = readString(formData, "enabled") === "true";
    if (!storeId) return { success: null, error: "缺少店舖資訊" };

    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { industryModule: true } });
    if (!store) return { success: null, error: "店舖不存在" };
    if (store.industryModule === "SPA") return { success: null, error: "SPA 模組已停用，歷史設定僅供封存" };

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
