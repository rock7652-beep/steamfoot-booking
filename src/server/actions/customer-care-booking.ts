"use server";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { spaPrisma } from "@/lib/spa-db";
import { requireWritablePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { toLocalDateStr, addTaiwanDuration, dayRange } from "@/lib/date-utils";
import { AppError, handleActionError } from "@/lib/errors";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { enumerateBookableDates } from "@/lib/bookable-window";
import { resolveBookableUntilDate } from "@/lib/shop-config";
import { inferSpaTreatmentKind } from "@/lib/spa-store-identifiers";
import { inferSpaDemoResourceType } from "@/lib/spa-demo-catalog";

export async function loadCustomerCareBooking(customerId: string) {
  try {
    const user = await requireWritablePermission("booking.create");
    const storeId = await resolveWriteStoreId(user);
    await requireStoreFeature(storeId, FEATURES.CUSTOMER_CARE);
    const customer = await prisma.customer.findFirst({ where: { id: customerId, ...getManagerCustomerWhere(user.role, user.staffId, storeId), mergedIntoCustomerId: null, NOT: { user: { is: { status: "SUSPENDED" } } } }, select: { id: true } });
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
    const industry = await getStoreIndustryModule(storeId);
    const today = toLocalDateStr();
    if (industry === "course") {
      const now = new Date();
      const [sessions, cards] = await Promise.all([
        coursePrisma.courseSession.findMany({ where: { storeId, cancelledAt: null, releasedAt: null, startsAt: { gt: now, lte: dayRange(addTaiwanDuration(today, 60, "DAY")).end }, template: { storeId, isActive: true, visibility: { not: "OFF" } } }, select: { id: true, nameSnapshot: true, startsAt: true, templateId: true }, orderBy: { startsAt: "asc" }, take: 200 }),
        coursePrisma.coursePointCard.findMany({ where: { storeId, closedAt: null, remaining: { gt: 0 }, expiresAt: { gt: now }, members: { some: { storeId, customerId } } }, select: { id: true, nameSnapshot: true, expiresAt: true, templateIds: true, termSessionIds: true }, orderBy: { expiresAt: "asc" } }),
      ]);
      return { success: true as const, data: { module: "course" as const, sessions: sessions.map(s => ({ id: s.id, name: s.nameSnapshot, at: s.startsAt.toISOString(), cardIds: cards.filter(c => c.expiresAt >= s.startsAt && (!c.templateIds.length || c.templateIds.includes(s.templateId)) && (!c.termSessionIds.length || c.termSessionIds.includes(s.id))).map(c => c.id) })).filter(s => s.cardIds.length), cards: cards.map(c => ({ id: c.id, name: c.nameSnapshot })) } };
    }
    if (industry !== "spa") throw new AppError("VALIDATION", "請使用蒸足預約表單");
    const [config, treatments] = await Promise.all([
      prisma.shopConfig.findUnique({ where: { storeId }, select: { bookableUntilDate: true } }),
      spaPrisma.spaTreatment.findMany({ where: { storeId, isActive: true }, select: { id: true, name: true, variantLabel: true, price: true, serviceMinutes: true, bufferMinutes: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    ]);
    return { success: true as const, data: { module: "spa" as const, days: enumerateBookableDates(today, resolveBookableUntilDate(config?.bookableUntilDate)), treatments: treatments.map(t => ({ ...t, price: t.price.toNumber(), kind: inferSpaTreatmentKind(t.name), resourceType: inferSpaDemoResourceType({ treatmentId: t.id, treatmentName: t.name }) })) } };
  } catch (error) { return handleActionError(error); }
}
