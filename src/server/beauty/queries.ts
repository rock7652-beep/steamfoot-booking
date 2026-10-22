import {beautyScheduleRange} from '@/lib/beauty/calendar';
import {beautyHealthEnabled} from "./health";
import {resolvedCourseHours} from "@/lib/course-business-hours";
import "server-only";
import { beautyPrisma } from "@/lib/beauty-db";
import { prisma } from "@/lib/db";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature, requireStoreFeature } from "@/lib/feature-gate";
import {
  dayRange,
  toLocalDateStr,
  toLocalMonthStr,
  monthRange,
  addTaiwanDuration,
} from "@/lib/date-utils";
import { AppError } from "@/lib/errors";
import {
  beautyManager,
  beautyMember,
  beautyWorker,
  requireBeauty,
} from "./access";
import { settings, publicReceipt } from "./booking";
import { settlement } from "./commerce";
import type { Prisma } from "../../../generated/beauty-client";
export async function publicBeautyCatalog(slug: string) {
  const store = await prisma.store.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!store) throw new AppError("NOT_FOUND", "找不到店家");
  await requireBeauty(store.id);
  return privateBeautyCatalog(store);
}
// Only called after public or member access has verified this store.
async function privateBeautyCatalog(store:{id:string;name:string;slug:string},work=false){
  const [services, techs] = await Promise.all([
    work ? [] : beautyPrisma.beautyService.findMany({
      where: { storeId: store.id, active: true },
      select: {
        id: true,
        name: true,
        category: true,
        duration: true,
        price: true,
        trialPrice: true,
        revision: true,
      },
    }),
    work ? [] : beautyPrisma.beautyTechnician.findMany({
      where: { storeId: store.id, active: true },
      select: { id: true, name: true, gender: true, serviceIds: true },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
    }),
  ]);
  const policy = await settings(
    beautyPrisma as unknown as Prisma.TransactionClient,
    store.id,
  );
  return {
    store,
    services,
    techs,
    policy: {
      revision: policy.revision,
      selfBooking: policy.selfBooking,
      selfCancel: policy.selfCancel,
      selfReschedule: policy.selfReschedule,
      cancelDeduct: policy.cancelDeduct,
      noShowDeduct: policy.noShowDeduct,
      cancelLeadMinutes: policy.cancelLeadMinutes,
    },
  };
}
export async function beautyPortal(work = false, month = toLocalMonthStr()) {
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw new AppError("VALIDATION","月份格式不正確");
  const a = work ? await beautyWorker() : await beautyMember();
  await requireStoreFeature(a.storeId, FEATURES.MEMBER_PORTAL);
  const store = a.verifiedStore ?? await prisma.store.findUniqueOrThrow({
    where: { id: a.storeId },
    select: { id: true, name: true, slug: true },
  });
  const [catalog,rows,cards,customer,plans,purchases,bank,canWork,healthEnabled,locations] = await Promise.all([
    privateBeautyCatalog(store,work),
    beautyPrisma.beautyAppointment.findMany({
    where: {
      storeId: a.storeId,
      ...(work
        ? { technicianId: a.technicianId }
        : {
            OR: [
              { customerId: a.customerId },
              { group: { customerId: a.customerId } },
            ],
          }),
    },
    orderBy: { startsAt: "desc" },
    take: 200,
  }),
    work
    ? []
    : beautyPrisma.beautyCard.findMany({
        where: { storeId: a.storeId, memberIds: { has: a.customerId! } },
        orderBy: { createdAt: "desc" },
      }),
    prisma.customer.findFirst({
    where: { storeId: a.storeId, id: a.customerId },
    select: { id: true, name: true, phone: true,birthday:true },
  }),
    work
    ? []
    : beautyPrisma.beautyPlan.findMany({
        where: { storeId: a.storeId, active: true, customerPurchasable: true },
      }),
    work
    ? []
    : beautyPrisma.beautyPurchase.findMany({
        where: { storeId: a.storeId, customerId: a.customerId },
        orderBy: { createdAt: "desc" },
      }),
    prisma.shopConfig.findUnique({
    where: { storeId: a.storeId },
    select: { bankName: true, bankAccountNumber: true, bankCode:true,address:true,mapUrl:true,shopPhone:true },
  }),
    work || beautyPrisma.beautyTechnician.findFirst({where:{storeId:a.storeId,userId:a.userId,active:true},select:{id:true}}).then(Boolean),
    !work && beautyHealthEnabled(a.storeId),
    work ? beautyPrisma.$queryRaw<Array<{id:string;name:string}>>`SELECT id,name FROM "CourseRoom" WHERE "storeId"=${a.storeId}` : [],
  ]);
  const memberIds=[...new Set([a.customerId!,...cards.flatMap(c=>c.memberIds)])];
  const [held,members]=await Promise.all([
    cards.length ? beautyPrisma.beautyAppointment.groupBy({by:['cardId'],where:{storeId:a.storeId,cardId:{in:cards.map(c=>c.id)},status:'RESERVED'},_count:{id:true}}) : [],
    work ? [] : prisma.customer.findMany({where:{storeId:a.storeId,id:{in:memberIds},mergedIntoCustomerId:null},select:{id:true,name:true,phone:true}}),
  ]);
  return {
    ...catalog,
    scopeKey:a.userId,
    readVersion:crypto.randomUUID(),
    incomeMonth:month,
    incomeConfirmed:false,
    canWork,
    work,
    customer:customer?{...customer,birthday:customer.birthday?.toISOString().slice(0,10)??""}:null,
    healthEnabled,
    locations,
    members,
    plans,
    bank,
    purchases: purchases.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
    grants: a.grants ?? [],
    items: rows.map((b) => ({
      ...publicReceipt(b),
      customerId:b.customerId,
      revision: b.revision,
      groupId: b.groupId,
      technicianId: b.technicianId,
      notes: b.notes,
      locationId:b.locationId,
      cardId:b.cardId,
    })),
    cards: cards.map((c) => ({
      id: c.id,
      name: c.name,
      remaining: c.remaining,
      history:[] as Array<{id:string;cardId:string;kind:string;delta:number;createdAt:string}>,
      held: held.find((h) => h.cardId === c.id)?._count.id ?? 0,
      expiresAt: c.expiresAt.toISOString(),
      closed: !!c.closedAt,
      memberIds: c.memberIds,
      allowShared:c.allowShared,
      serviceIds: c.serviceIds,
    })),
    income: [] as Array<{id:string;technicianId:string;serviceName:string;date:string;fee:number;paid:number;payments:Array<{amount:number;date:string;voided:boolean}>}>,
  };
}
export type BeautyPortalData = Awaited<ReturnType<typeof beautyPortal>>;
export async function beautyDashboard(
  date = toLocalDateStr(),
  month = toLocalMonthStr(),
  calendar: "day" | "week" | "month" = "day",
  financialDates?:{startDate:string;endDate:string},
) {
  const a = await beautyManager("booking.read"),
    u = await getCurrentUser();
  const can = async (p: Parameters<typeof checkPermission>[2]) =>
    !!u && (await checkPermission(u.role, u.staffId, p));
  const [
    customerPermission,
    planPermission,
    staffPermission,
    financeAccess,
    feePermission,
    settingsAccess,
    writeAccess,
  ] = await Promise.all([
    can("customer.read"),
    can("wallet.read"),
    can("staff.view"),
    can("transaction.read"),
    can("teacher.compensation.read"),
    can("business_hours.view"),
    can("booking.create"),
  ]);
  const customerAccess =
      customerPermission &&
      (await hasStoreFeature(a.storeId, FEATURES.CUSTOMER_MANAGEMENT)),
    planAccess =
      planPermission &&
      (await hasStoreFeature(a.storeId, FEATURES.PLAN_MANAGEMENT)),
    staffAccess =
      staffPermission &&
      (await hasStoreFeature(a.storeId, FEATURES.STAFF_MANAGEMENT)),
    feeAccess =
      feePermission &&
      (await hasStoreFeature(a.storeId, FEATURES.SERVICE_FEE_CALCULATOR));
  const manage = Object.fromEntries(
    await Promise.all(
      [
        ["update", "booking.update"],
        ["collect", "transaction.create"],
        ["refund", "transaction.refund"],
        ["card", "wallet.create"],
        ["members", "wallet.adjust"],
        ["customer", "customer.create"],
        ["customerEdit", "customer.update"],
        ["plan", "plans.edit"],
        ["technician", "staff.manage"],
        ["location", "business_hours.manage"],
        ["settings", "business_hours.manage"],
        ["feeConfirm", "teacher.settlement.confirm"],
        ["feePay", "teacher.settlement.pay"],
      ].map(async ([key, p]) => [
        key,
        await can(p as Parameters<typeof checkPermission>[2]),
      ]),
    ),
  );
  manage.card = manage.card && manage.collect;
  manage.technician =
    manage.technician &&
    feeAccess &&
    (await can("teacher.compensation.manage"));
  const range=beautyScheduleRange(date,calendar),
    financialRange = financialDates?{start:dayRange(financialDates.startDate).start,end:dayRange(financialDates.endDate).end}:monthRange(month);
  const reportAccess = await can("report.read");
  const analytics = reportAccess
    ? await beautyPrisma.beautyAppointment.groupBy({
        by: ["status", "serviceName"],
        where: {
          storeId: a.storeId,
          startsAt: { gte: financialRange.start, lte: financialRange.end },
        },
        _count: { id: true },
        _sum: { price: true },
      })
    : [];
  const [
    services,
    techs,
    locations,
    plans,
    customers,
    cards,
    items,
    payments,
    policy,
    report,
  ] = await Promise.all([
    beautyPrisma.beautyService.findMany({
      where: { storeId: a.storeId },
      orderBy: { name: "asc" },
    }),
    staffAccess
      ? beautyPrisma.beautyTechnician.findMany({
          where: { storeId: a.storeId },
          orderBy: [{ sort: "asc" }, { id: "asc" }],
        })
      : [],
    beautyPrisma.$queryRaw<
      Array<{ id: string; name: string; isActive: boolean; category:string;details:string;equipment:string;location:string }>
    >`SELECT id,name,"isActive",category,details,equipment,location FROM "CourseRoom" WHERE "storeId"=${a.storeId} ORDER BY name`,
    planAccess
      ? beautyPrisma.beautyPlan.findMany({
          where: { storeId: a.storeId },
          orderBy: { name: "asc" },
        })
      : [],
    customerAccess
      ? prisma.customer.findMany({
          where: { storeId: a.storeId, mergedIntoCustomerId: null },
          select: {
            id: true,
            name: true,
            phone: true,
            userId: true,
            notes: true,
            lineName: true, lineUserId: true, customerStage: true, lineLinkStatus: true,
            lastVisitAt: true, birthday:true, createdAt: true, totalPoints: true, _count:{select:{sponsoredCustomers:true}},
            sponsor: {select:{id:true,name:true}}, assignedStaff:{select:{id:true,displayName:true,colorCode:true}},
            user:{select:{status:true}},
          },
          orderBy: { name: "asc" },
        })
      : [],
    planAccess && customerAccess
      ? beautyPrisma.beautyCard.findMany({
          where: { storeId: a.storeId },
          orderBy: { createdAt: "desc" },
        })
      : [],
    beautyPrisma.beautyAppointment.findMany({
      where: {
        storeId: a.storeId,
        startsAt: { gte: range.start, lte: range.end },
      },
      orderBy: { startsAt: "asc" },
    }),
    financeAccess
      ? beautyPrisma.beautyPayment.findMany({
          where: {
            storeId: a.storeId,
            createdAt: { gte: financialRange.start, lte: financialRange.end },
          },
          orderBy: { createdAt: "desc" },
        })
      : [],
    settings(beautyPrisma as unknown as Prisma.TransactionClient, a.storeId),
    feeAccess
      ? settlement(
          beautyPrisma as unknown as Prisma.TransactionClient,
          a.storeId,
          month,
        )
      : null,
  ]);
  const purchases = financeAccess
    ? await beautyPrisma.beautyPurchase.findMany({
        where: { storeId: a.storeId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const held = cards.length
    ? await beautyPrisma.beautyAppointment.groupBy({
        by: ["cardId"],
        where: {
          storeId: a.storeId,
          cardId: { in: cards.map((c) => c.id) },
          status: "RESERVED",
        },
        _count: { id: true },
      })
    : [];
  const [calendarHours,calendarSpecials,customerVisits,orderRows]=await Promise.all([
    prisma.businessHours.findMany({where:{storeId:a.storeId}}),
    prisma.specialBusinessDay.findMany({where:{storeId:a.storeId,date:{gte:range.start,lte:range.end}}}),
    customerAccess&&customers.length?beautyPrisma.beautyAppointment.groupBy({by:["customerId"],where:{storeId:a.storeId,customerId:{in:customers.map(c=>c.id)},status:"COMPLETED",startsAt:{lte:new Date()}},_max:{startsAt:true}}):[],
    beautyPrisma.$queryRaw<Array<{kind:"room"|"subject"|"plan";ids:string[];revision:number}>>`SELECT kind,ids,revision FROM "CourseDisplayOrder" WHERE "storeId"=${a.storeId} AND kind IN ('room','subject','plan')`,
  ]);
  const calendarDates=Array.from({length:calendar==='month'?31:calendar==='week'?7:1},(_,i)=>addTaiwanDuration(toLocalDateStr(range.start),i,'DAY')).filter(d=>dayRange(d).start<=range.end);
  const calendarDays=Object.fromEntries(calendarDates.map(d=>[d,resolvedCourseHours(d,calendarHours,calendarSpecials)]));
  const displayOrders=Object.fromEntries(orderRows.filter(r=>r.kind!=="plan"||planAccess).map(r=>[r.kind,{ids:r.ids,revision:r.revision}]));
  return {
    displayOrders,
    purchases: purchases.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
    storeId:a.storeId,
    calendarDays,
    now: Date.now(),
    calendar,
    analytics,
    manage,
    date,
    month,
    services,
    techs: techs.map((t) => ({ ...t, rates: feeAccess ? t.rates : {} })),
    locations,
    plans,
    customers:customers.map(c=>({...c,lastVisitAt:customerVisits.find(v=>v.customerId===c.id)?._max.startsAt??null})),
    cards: cards.map((c) => ({
      ...c,
      expiresAt: c.expiresAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      closedAt: c.closedAt?.toISOString() ?? null,
      held: held.find((h) => h.cardId === c.id)?._count.id ?? 0,
    })),
    items: items.map((b) => ({
      ...publicReceipt(b),
      serviceId:b.serviceId,buffer:b.buffer,occupiedEndsAt:b.occupiedEndsAt.toISOString(),
      revision: b.revision,
      groupId: b.groupId,
      technicianId: b.technicianId,
      locationId: b.locationId,
      cardId: planAccess ? b.cardId : null,
      personPhone: customerAccess ? b.personPhone : "",
      customerId: customerAccess ? b.customerId : null,
      notes: customerAccess ? b.notes : "",
      fee: feeAccess ? b.fee : null,
    })),
    payments: payments.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
    policy,
    report,
    access: {
      customerAccess,
      planAccess,
      staffAccess,
      financeAccess,
      feeAccess,
      settingsAccess,
      writeAccess,
    },
  };
}
export type BeautyDashboardData = Awaited<ReturnType<typeof beautyDashboard>>;

/** Calendar transport: no customers, plans, payments or settlement reads. */
export async function beautyCalendar(date:string,calendar:'day'|'week'|'month'){
 const [a,u]=await Promise.all([beautyManager('booking.read'),getCurrentUser()]);
 const can=async(p:Parameters<typeof checkPermission>[2])=>!!u&&await checkPermission(u.role,u.staffId,p);
 const scopes=[['customer.read',FEATURES.CUSTOMER_MANAGEMENT],['wallet.read',FEATURES.PLAN_MANAGEMENT],['teacher.compensation.read',FEATURES.SERVICE_FEE_CALCULATOR]] as const;
 const [customerAccess,planAccess,feeAccess]=await Promise.all(scopes.map(async ([permission,feature])=>{
  const [allowed,enabled]=await Promise.all([can(permission),hasStoreFeature(a.storeId,feature)]);
  return allowed&&enabled;
 }));
 const range=beautyScheduleRange(date,calendar);
 const [rows,hours,specials]=await Promise.all([
  beautyPrisma.beautyAppointment.findMany({where:{storeId:a.storeId,startsAt:{gte:range.start,lte:range.end}},orderBy:{startsAt:'asc'}}),
  prisma.businessHours.findMany({where:{storeId:a.storeId}}),
  prisma.specialBusinessDay.findMany({where:{storeId:a.storeId,date:{gte:range.start,lte:range.end}}}),
 ]);
 const dates=Array.from({length:calendar==='month'?31:calendar==='week'?7:1},(_,i)=>addTaiwanDuration(toLocalDateStr(range.start),i,'DAY')).filter(d=>dayRange(d).start<=range.end);
 return {date,calendar,calendarDays:Object.fromEntries(dates.map(d=>[d,resolvedCourseHours(d,hours,specials)])),items:rows.map(b=>({...publicReceipt(b),serviceId:b.serviceId,buffer:b.buffer,occupiedEndsAt:b.occupiedEndsAt.toISOString(),revision:b.revision,groupId:b.groupId,technicianId:b.technicianId,locationId:b.locationId,cardId:planAccess?b.cardId:null,personPhone:customerAccess?b.personPhone:'',customerId:customerAccess?b.customerId:null,notes:customerAccess?b.notes:'',fee:feeAccess?b.fee:null}))};
}
