import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getActiveStoreForRead } from "@/lib/store";
import DataExportClient from "./data-export-client";

export default async function DataExportPage() {
  const user = await getCurrentUser();
  const canCustomerExport = user ? await checkPermission(user.role, user.staffId, "customer.export") : false;
  const canReportExport = user ? await checkPermission(user.role, user.staffId, "report.export") : false;
  if (!user || (!canCustomerExport && !canReportExport)) redirect("/dashboard");
  const stores = user.role === "ADMIN" ? await prisma.store.findMany({ where: { operatingStatus: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const activeStoreId = user.role === "ADMIN" ? await getActiveStoreForRead(user) : null;
  return <DataExportClient isAdmin={user.role === "ADMIN"} stores={stores} activeStoreId={activeStoreId} canCustomerExport={canCustomerExport} canReportExport={canReportExport} />;
}
