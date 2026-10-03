import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission, requirePermission } from "@/lib/permissions";
import { getAccessibleStores, getActiveStoreForRead, validateStoreAccess } from "@/lib/store";
import { getStoreFeaturePresentation } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { prisma } from "@/lib/db";
import { authorizeFrontendPreview } from "@/server/services/frontend-preview";
import { FrontendPreviewSelector } from "@/components/frontend-preview/selector";

export default async function FrontendPreviewDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) notFound();
  await requirePermission("customer.read");
  await requirePermission("booking.read");
  const p = await searchParams, stores = await getAccessibleStores(user);
  const storeId = p.storeId ?? await getActiveStoreForRead(user) ?? stores[0]?.id;
  if (!storeId) return <p>請先選擇店家。</p>;
  try { await validateStoreAccess(user, storeId, "read"); } catch { notFound(); }
  const state = await getStoreFeaturePresentation(storeId, FEATURES.FRONTEND_PREVIEW);
  if (state === "HIDDEN") notFound();
  if (state !== "ENABLED") return <div className="space-y-3"><h1 className="admin-page-title">前台預覽</h1><FrontendPreviewSelector key={storeId} stores={stores} storeId={storeId} role="member" query="" people={[]} allowWork={false} previewHref={null} locked /></div>;
  const moduleId = await getStoreIndustryModule(storeId);
  const allowWork = moduleId !== "steamfoot" && (user.role === "OWNER" || user.role === "ADMIN") && await checkPermission(user.role, user.staffId, "staff.view");
  const role = p.role === "work" && allowWork ? "work" : "member";
  if (role === "member") await requirePermission("wallet.read");
  const q = (p.q ?? "").trim().slice(0, 80);
  const people = role === "work" ? await prisma.staff.findMany({
    where: { storeId, status: "ACTIVE", ...(moduleId === "course" ? { courseCoachEnabled: true } : {}), ...(q ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}) },
    select: { id: true, displayName: true }, orderBy: [{ displayName: "asc" }, { id: "asc" }], take: 30,
  }).then(rows => rows.map(row => ({ id: row.id, name: row.displayName }))) : await prisma.customer.findMany({
    where: { ...getManagerCustomerWhere(user.role, user.staffId, storeId), storeId, mergedIntoCustomerId: null, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}) },
    select: { id: true, name: true, phone: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 30,
  });
  const personId = p.personId;
  if (personId) { try { await authorizeFrontendPreview({ storeId, personId, role }); } catch { notFound(); } }
  const href = personId ? `/frontend-preview?${new URLSearchParams({ storeId, personId, role })}` : null;
  return <div className="space-y-3"><h1 className="admin-page-title">前台預覽</h1><p className="text-sm text-earth-600">查看會員與工作前台・不會儲存或發送通知{moduleId === "spa" ? "・SPA 畫面尚未驗收" : ""}</p><FrontendPreviewSelector key={`${storeId}:${role}`} stores={stores} storeId={storeId} role={role} query={q} people={people} personId={personId} allowWork={!!allowWork} previewHref={href} /></div>;
}
