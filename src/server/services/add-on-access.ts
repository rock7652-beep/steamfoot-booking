import 'server-only';
import type {Prisma} from '@prisma/client';
import {FEATURES} from '@/lib/feature-flags';
import {resolveEffectiveEntitlement} from '@/lib/effective-entitlement';
import {prisma} from '@/lib/db';
import {addonsPrisma} from '@/lib/addons-db';
import {hasStoreFeature} from '@/lib/feature-gate';
import {AppError} from '@/lib/errors';
/** Use the caller's transaction connection; no cached grant or nested pool checkout. */
export async function requireAddOnManagement(tx:Prisma.TransactionClient,storeId:string){
 const grant=await tx.storeFeatureEntitlement.findUnique({where:{uq_store_feature_entitlement:{storeId,featureKey:FEATURES.ADD_ONS}},select:{status:true,startsAt:true,expiresAt:true}});
 if(!resolveEffectiveEntitlement(false,grant).enabled)throw new AppError('FORBIDDEN','附加項目尚未開通');
}
export async function requireAddOnSelection(tx:Prisma.TransactionClient,storeId:string,module:string){
 await requireAddOnManagement(tx,storeId);
 const catalog=await tx.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId,module}}});
 if(!catalog?.enabled)throw new AppError('FORBIDDEN','門市尚未啟用附加項目');
}

/** Beauty uses a separate domain client; read the central entitlement/local switch here. */
export async function isAddOnSelectionEnabled(storeId:string,module:string){
 if(!await hasStoreFeature(storeId,FEATURES.ADD_ONS))return false;
 const catalog=await addonsPrisma.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId,module}},select:{enabled:true}});
 return catalog?.enabled===true;
}
export async function requireBeautyAddOnSelection(storeId:string,tx?:BeautyFeatureReader){
 if(!await isBeautyServiceAddOnsEnabled(storeId,tx))throw new AppError('FORBIDDEN','附加選購已關閉，既有預約與款項保留');
}

export type BeautyFeatureReader={ $queryRaw<T=unknown>(query:TemplateStringsArray,...values:unknown[]):Promise<T> };
/** Read both switches on the caller's connection; never consume a nested pool checkout. */
export async function isBeautyServiceAddOnsEnabled(storeId:string,tx:BeautyFeatureReader=prisma){
 // A closed/uninstalled feature must not read its new local-switch column.
 // Keep both reads on the supplied transaction; the second read rechecks the live grant.
 const [grant]=await tx.$queryRaw<{industry:string;status:'ENABLED'|'DISABLED'|'LOCKED'|'HIDDEN'|null;startsAt:Date|null;expiresAt:Date|null}[]>`SELECT s."industryModule"::text AS industry,e.status,e."startsAt",e."expiresAt" FROM "Store" s LEFT JOIN "StoreFeatureEntitlement" e ON e."storeId"=s.id AND e."featureKey"=${FEATURES.BEAUTY_SERVICE_ADD_ONS} WHERE s.id=${storeId}`;
 if(!grant||grant.industry!=='BEAUTY'||!resolveEffectiveEntitlement(false,grant.status?{status:grant.status,startsAt:grant.startsAt,expiresAt:grant.expiresAt}:null).enabled)return false;
 const [row]=await tx.$queryRaw<{industry:string;localEnabled:boolean|null;status:'ENABLED'|'DISABLED'|'LOCKED'|'HIDDEN'|null;startsAt:Date|null;expiresAt:Date|null}[]>`SELECT s."industryModule"::text AS industry,b."serviceAddOnsEnabled" AS "localEnabled",e.status,e."startsAt",e."expiresAt" FROM "Store" s LEFT JOIN "BeautySetting" b ON b."storeId"=s.id LEFT JOIN "StoreFeatureEntitlement" e ON e."storeId"=s.id AND e."featureKey"=${FEATURES.BEAUTY_SERVICE_ADD_ONS} WHERE s.id=${storeId}`;
 return !!row&&row.industry==='BEAUTY'&&row.localEnabled===true&&resolveEffectiveEntitlement(false,row.status?{status:row.status,startsAt:row.startsAt,expiresAt:row.expiresAt}:null).enabled;
}

export async function requireBeautyServiceAddOnManagement(storeId:string,tx:BeautyFeatureReader){
 const [row]=await tx.$queryRaw<{industry:string;status:'ENABLED'|'DISABLED'|'LOCKED'|'HIDDEN'|null;startsAt:Date|null;expiresAt:Date|null}[]>`SELECT s."industryModule"::text AS industry,e.status,e."startsAt",e."expiresAt" FROM "Store" s LEFT JOIN "StoreFeatureEntitlement" e ON e."storeId"=s.id AND e."featureKey"=${FEATURES.BEAUTY_SERVICE_ADD_ONS} WHERE s.id=${storeId}`;
 if(!row||row.industry!=='BEAUTY'||!resolveEffectiveEntitlement(false,row.status?{status:row.status,startsAt:row.startsAt,expiresAt:row.expiresAt}:null).enabled)throw new AppError('FORBIDDEN','加做服務尚未開通');
}
