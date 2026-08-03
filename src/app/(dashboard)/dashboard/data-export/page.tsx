import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import DataExportClient from "./data-export-client";

export default async function DataExportPage() {
  const user = await getCurrentUser();
  const canCustomerExport = user ? await checkPermission(user.role, user.staffId, "customer.export") : false;
  const canReportExport = user ? await checkPermission(user.role, user.staffId, "report.export") : false;
  if (!user || (!canCustomerExport && !canReportExport)) redirect("/dashboard");
  const stores = user.role === "ADMIN" ? await prisma.store.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  return <DataExportClient isAdmin={user.role === "ADMIN"} stores={stores} canCustomerExport={canCustomerExport} canReportExport={canReportExport} />;
}
