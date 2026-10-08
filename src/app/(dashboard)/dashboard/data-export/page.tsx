import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getActiveStoreForRead } from "@/lib/store";
import DataExportClient from "./data-export-client";
import { getStoreIndustryModule } from "@/lib/industry-module-server";

export default async function DataExportPage() {
  const user = await getCurrentUser();
  const canCustomerExport = user ? await checkPermission(user.role, user.staffId, "customer.export") : false;
  const canReportExport = user ? await checkPermission(user.role, user.staffId, "report.export") : false;
  if (!user || (!canCustomerExport && !canReportExport)) redirect("/dashboard");
  const activeStoreId = await getActiveStoreForRead(user);
  const courseMode = !!activeStoreId && await getStoreIndustryModule(activeStoreId) === "course";
  const stores = getEffectiveActorRole(user) === "ADMIN" ? await prisma.store.findMany({ where: { operatingStatus: "ACTIVE", ...(courseMode ? { industryModule: "COURSE" as const } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  return <DataExportClient courseMode={courseMode} isAdmin={getEffectiveActorRole(user) === "ADMIN"} stores={stores} activeStoreId={activeStoreId} canCustomerExport={canCustomerExport} canReportExport={canReportExport} />;
}
