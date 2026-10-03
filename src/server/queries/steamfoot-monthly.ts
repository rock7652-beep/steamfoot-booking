import "server-only";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { requireSteamfootStore } from "@/lib/industry-module-server";
import { AppError } from "@/lib/errors";
import { getManagerReadFilter } from "@/lib/manager-visibility";
import { prisma } from "@/lib/db";
import { rentMonth, rentPeriod } from "@/lib/steamfoot-rent";
import { readRentTerms } from "@/server/services/steamfoot-rent";
import { previewStaffSettlement } from "@/server/queries/staff-settlement";

export async function readSteamfootMonthly(storeId: string, month: string) {
  const user = await requirePermission("report.read");
  if ((user.role !== "OWNER" && user.role !== "ADMIN") || await getActiveStoreForRead(user) !== storeId)
    throw new AppError("FORBIDDEN", "僅本店店長可查看月結");
  await requireSteamfootStore(storeId);
  rentMonth.parse(month);
  // bookingDate is a database calendar date, not a timestamp in local time.
  const [year, m] = month.split("-").map(Number);
  const endDate = `${month}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}`;
  const visibility = getManagerReadFilter(user.role, user.staffId, "staffId", storeId);
  const visibleStaffId = typeof visibility.staffId === "string" ? visibility.staffId : undefined;
  const [service, staff, terms] = await Promise.all([
    previewStaffSettlement({ activeStoreId: storeId, startDate: `${month}-01`, endDate }),
    prisma.staff.findMany({ where: { storeId, ...(visibleStaffId ? { id: visibleStaffId } : {}) }, select: { id: true, displayName: true, status: true, isOwner: true, monthlySpaceFee: true, spaceFeeEnabled: true, user: { select: { role: true } } }, orderBy: { displayName: "asc" } }),
    readRentTerms(storeId, visibleStaffId),
  ]);
  const summaries = new Map(service.summary.map(s => [s.staffId, s]));
  const people = staff.map(s => {
    const history = terms.filter(t => t.staffId === s.id);
    const term = history.find(t => t.startMonth <= month && (!t.endMonth || t.endMonth >= month));
    return { id: s.id, name: s.displayName, active: s.status === "ACTIVE",
      canManageRent: user.role === "ADMIN" || (!s.isOwner && s.user.role !== "ADMIN"),
      summary: summaries.get(s.id), details: service.details.filter(d => d.revenueStaffId === s.id),
      rent: term ? rentPeriod(term, month) : null,
      rentLabel: term ? (term.enabled ? "" : "不收租金") : history.length ? "此月無租金約定" : s.spaceFeeEnabled ? "待設定租期" : "未設定租金",
      legacyAmount: !history.length && s.spaceFeeEnabled ? Number(s.monthlySpaceFee) : null,
    };
  }).filter(p => p.active || p.summary || p.rent);
  return { people, unassigned: service.details.filter(d => d.revenueStaffId === null) };
}
