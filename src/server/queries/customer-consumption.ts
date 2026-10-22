import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie, storeIdForViewContext, userForViewContext } from "@/lib/store-view-context-server";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { AppError } from "@/lib/app-error";
import { CONSUMPTION_EXPORT_LIMIT, consumptionMetrics, parseConsumptionFilters, type ConsumptionOption, type ConsumptionParams, type ConsumptionRow } from "@/lib/customer-consumption";
import { customerConsumptionCustomersSql, customerConsumptionSql } from "./customer-consumption-sql";

export type ConsumptionResult = { total: number; matched: number; page: number; rows: ConsumptionRow[] };

/** Page and export resolve the same current identity, viewed store and visibility on every request. */
export const getCustomerConsumptionAccess = cache(async (exporting = false) => {
  const user = await requirePermission("customer.read");
  await requirePermission("booking.read");
  await requirePermission("wallet.read");
  await requirePermission("transaction.read");
  if (exporting) await requirePermission("customer.export");
  const [activeStore, view] = await Promise.all([getActiveStoreForRead(user), resolveStoreViewContextFromCookie(user)]);
  const storeId = storeIdForViewContext(activeStore, view);
  if (!storeId) throw new AppError("VALIDATION", "請先選擇一家店家，再查看期間消耗統計");
  await requireStoreFeature(storeId, FEATURES.CUSTOMER_CARE);
  if (exporting) await requireStoreFeature(storeId, FEATURES.DATA_EXPORT);
  const industryModule = await getStoreIndustryModule(storeId);
  if (industryModule !== "course" && industryModule !== "steamfoot" && industryModule !== "beauty") throw new AppError("FORBIDDEN", "此店家模組不支援期間消耗統計");
  if (industryModule === "beauty") {
    const { requireBeauty } = await import("@/server/beauty/access");
    await requireBeauty(storeId);
  }
  const scopedUser = userForViewContext(user, view);
  const scope = getManagerCustomerWhere(scopedUser.role, scopedUser.staffId, storeId);
  return { storeId, module: industryModule, staffScope: typeof scope.assignedStaffId === "string" ? scope.assignedStaffId : null };
});

export const getCustomerConsumptionOptions = cache(async (access: Awaited<ReturnType<typeof getCustomerConsumptionAccess>>) => {
  const { storeId, module } = access;
  if (module === "beauty") {
    const {beautyPrisma} = await import("@/lib/beauty-db");
    const plans = await beautyPrisma.beautyPlan.findMany({where:{storeId},select:{id:true,name:true},orderBy:[{name:"asc"},{id:"asc"}]});
    return [...plans.map(p=>({...p,unit:"VISIT"})),{id:"__single__",name:"體驗／單次付費",unit:"MONEY"}];
  }
  return prisma.$queryRaw<ConsumptionOption[]>(module === "course" ? Prisma.sql`
    SELECT p.id,p.name,p.unit,ARRAY(SELECT DISTINCT c.unit FROM "CoursePointCard" c WHERE c."storeId"=${storeId} AND c."planId"=p.id) units
    FROM "CoursePointPlan" p WHERE p."storeId"=${storeId}
    UNION ALL SELECT '__trial__','體驗／單次付費','MONEY',ARRAY[]::text[] ORDER BY name,id`
    : Prisma.sql`SELECT id,name,'SESSION'::text unit FROM "ServicePlan" WHERE "storeId"=${storeId}
      UNION ALL SELECT '__unassigned__','未指定收費方式','MONEY' ORDER BY name,id`);
});

export const getCustomerConsumptionStaffOptions = cache(async (access: Awaited<ReturnType<typeof getCustomerConsumptionAccess>>) => {
  const staff = await prisma.staff.findMany({
    where: { storeId: access.storeId, ...(access.staffScope ? { id: access.staffScope } : {}) },
    select: { id: true, displayName: true }, orderBy: [{ displayName: "asc" }, { id: "asc" }],
  });
  return staff.map(person => ({ id: person.id, name: person.displayName }));
});

export async function getCustomerConsumption(params: ConsumptionParams, exporting = false) {
  const access = await getCustomerConsumptionAccess(exporting);
  const filters = parseConsumptionFilters(params);
  const [options, staffOptions] = await Promise.all([getCustomerConsumptionOptions(access), getCustomerConsumptionStaffOptions(access)]);
  if (filters.planId && !options.some(option => option.id === filters.planId))
    throw new AppError("VALIDATION", "所選收費方式不屬於目前店家");
  if (filters.staffId && filters.staffId !== "__unassigned__" && !staffOptions.some(option => option.id === filters.staffId))
    throw new AppError("VALIDATION", "所選店長不屬於目前可查看範圍");
  const metrics = consumptionMetrics(options);
  if (!metrics.includes(filters.sort) || Object.keys(filters.ranges).some(key => !metrics.includes(key as typeof metrics[number])))
    throw new AppError("VALIDATION", "目前店家未使用所選消耗單位");
  let result: ConsumptionResult;
  if (access.module === "beauty") {
    const customers = await prisma.$queryRaw<Array<{id:string;name:string;phone:string;assignedStaffName:string|null}>>(customerConsumptionCustomersSql(access.storeId, access.staffScope, filters, new Date()));
    const {beautyPrisma} = await import("@/lib/beauty-db");
    [result] = await beautyPrisma.$queryRaw<ConsumptionResult[]>(customerConsumptionSql(access.storeId, "beauty", access.staffScope, filters, exporting, new Date(), customers));
  } else {
    [result] = await prisma.$queryRaw<ConsumptionResult[]>(customerConsumptionSql(access.storeId, access.module, access.staffScope, filters, exporting));
  }
  if (exporting && result.total > CONSUMPTION_EXPORT_LIMIT)
    throw new AppError("VALIDATION", `符合名單超過 ${CONSUMPTION_EXPORT_LIMIT.toLocaleString()} 人，請縮小篩選條件後匯出`);
  return { ...result, filters, options, staffOptions, metrics, module: access.module };
}
