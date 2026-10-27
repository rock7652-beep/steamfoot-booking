import type {OperationsQuery} from "@/lib/operations-navigation";
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getActiveStoreForRead } from "@/lib/store";
import DataExportClient from "./data-export-client";
import { getStoreIndustryModule } from "@/lib/industry-module-server";

export default async function DataExportPage({query={}}:{query?:OperationsQuery}={}) {
  const user = await getCurrentUser();
  const canCustomerExport = user ? await checkPermission(user.role, user.staffId, "customer.export") : false;
  const canReportExport = user ? await checkPermission(user.role, user.staffId, "report.export") : false;
  if (!user || (!canCustomerExport && !canReportExport)) redirect("/dashboard");
  const activeStoreId = await getActiveStoreForRead(user);
  const industry = activeStoreId ? await getStoreIndustryModule(activeStoreId) : null;
  const courseMode = industry === "course", serviceMode = industry === "beauty";
  const stores = getEffectiveActorRole(user) === "ADMIN" ? await prisma.store.findMany({ where: { operatingStatus: "ACTIVE", ...(serviceMode ? {industryModule:"BEAUTY" as const} : courseMode ? { industryModule: "COURSE" as const } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const from=query.dateFrom??query.startDate,to=query.dateTo??query.endDate;
  const valid=(value:string|undefined)=>!!value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  const range=valid(from)&&valid(to)&&from!<=to!;
  return <DataExportClient key={`${activeStoreId}:${range?from:""}:${range?to:""}`} initialStartDate={range?from:undefined} initialEndDate={range?to:undefined} serviceMode={serviceMode} courseMode={courseMode || serviceMode} isAdmin={getEffectiveActorRole(user) === "ADMIN"} stores={stores} activeStoreId={activeStoreId} canCustomerExport={canCustomerExport} canReportExport={canReportExport} />;
}
