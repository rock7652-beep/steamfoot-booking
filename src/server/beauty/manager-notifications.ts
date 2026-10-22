import "server-only";
import { prisma } from "@/lib/db";
import { beautyPrisma } from "@/lib/beauty-db";
import { beautyNotificationDeliveryBlocked } from "@/lib/beauty/notification-policy";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { addTaiwanDuration, dayRange, formatTWDateTime, parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";
import { deriveBaseUrl } from "@/lib/base-url";
import { deliverManagerNotification, type ManagerDeliveryResult } from "@/server/services/manager-notification-delivery";

/** Final authoritative opt-in, also used by the common transport. Never imports recipients. */
export async function beautyManagerDeliveryAllowed(storeId: string) {
  if (beautyNotificationDeliveryBlocked()) return false;
  const store = await prisma.store.findFirst({where:{id:storeId,industryModule:"BEAUTY",isDemo:false,operatingStatus:"ACTIVE"},select:{id:true}});
  if (!store || !await hasStoreFeature(storeId,FEATURES.LINE_REMINDER)) return false;
  return !!(await beautyPrisma.beautySetting.findUnique({where:{storeId},select:{notifications:true}}))?.notifications;
}
function managerUrl(slug:string, date:Date, payment=false) {
  const url = new URL(`/s/${encodeURIComponent(slug)}/admin/dashboard/beauty`,deriveBaseUrl());
  url.searchParams.set("tab",payment?"營運":"班表");
  url.searchParams.set("date",toLocalDateStr(date));
  return url.toString();
}
async function storeFor(storeId:string) {
  if (!await beautyManagerDeliveryAllowed(storeId)) return null;
  return prisma.store.findFirst({where:{id:storeId,industryModule:"BEAUTY"},select:{id:true,name:true,slug:true}});
}
const fresh = (date:Date,now:Date) => date<=now && now.getTime()-date.getTime()<15*60_000;

/** Post-commit observers: a notification error can never undo a booking/purchase.
 * No scanning/backfill on re-enable. Same request uses the original group/order key. */
export async function notifyBeautyBookingManagers(storeId:string,groupId:string,now=new Date()) {
  if (beautyNotificationDeliveryBlocked()) return;
  try {
    const store=await storeFor(storeId);
    if (!store) return;
    const group=await beautyPrisma.beautyGroup.findFirst({where:{id:groupId,storeId},include:{items:true}});
    if (!group || !fresh(group.createdAt,now) || !group.items.length || group.items.some(b=>b.status!=="RESERVED"||b.startsAt<=now)) return;
    const trial=group.items.every(b=>b.isTrial);
    const sameDay=group.items.every(b=>toLocalDateStr(b.startsAt)===toLocalDateStr(now));
    if (!trial && !sameDay) return;
    // An AUDIT row is the original authenticated actor; manager-created groups are not customer notices.
    const source=await beautyPrisma.beautyEvent.findFirst({where:{storeId,kind:"BOOK_GROUP",status:"AUDIT",body:{contains:groupId}},select:{userId:true,body:true}});
    if (!source) return;
    const origin=JSON.parse(source.body);
    if (origin.groupId!==groupId || origin.managerNoticeEligible!==true) return;
    if (!trial) {
      if (!source.userId || !group.customerId || !await prisma.customer.findFirst({where:{id:group.customerId,storeId,userId:source.userId,mergedIntoCustomerId:null},select:{id:true}})) return;
    }
    await deliverManagerNotification({storeId,eventKey:`beauty-booking-created:${group.id}`,type:trial?"PUBLIC_TRIAL_BOOKING_CREATED":"SAME_DAY_BOOKING_CREATED",sameDayTrial:trial&&sameDay,
      messages:[{type:"text",text:[trial?"新體驗預約":"今日新增預約",store.name,`預約人：${group.contactName}`,`人數：${group.items.length} 位`,...group.items.map(b=>`${b.personName}｜${b.serviceName}｜${formatTWDateTime(b.startsAt)}–${formatTWDateTime(b.endsAt).slice(11)}`),`查看預約：${managerUrl(store.slug,group.startsAt)}`].join("\n")}],
      beforeDeliver:async()=>fresh(group.createdAt,new Date())&&await beautyPrisma.beautyAppointment.count({where:{storeId,groupId,status:"RESERVED",startsAt:{gt:new Date()}}})===group.items.length,
    });
  } catch { console.error("[Beauty manager notification] booking observer failed",{storeId}); }
}
export async function notifyBeautyPurchaseManagers(storeId:string,purchaseId:string,now=new Date()) {
  if (beautyNotificationDeliveryBlocked()) return;
  try {
    const store=await storeFor(storeId);
    if (!store) return;
    const order=await beautyPrisma.beautyPurchase.findFirst({where:{id:purchaseId,storeId,status:"PENDING"}});
    if (!order||!fresh(order.createdAt,now)) return;
    const source=await beautyPrisma.beautyEvent.findFirst({where:{storeId,kind:"PURCHASE_PENDING",status:"AUDIT",body:{contains:purchaseId}},select:{body:true}});
    if(!source)return;
    const origin=JSON.parse(source.body);
    if(origin.orderId!==purchaseId||origin.managerNoticeEligible!==true)return;
    const customer=await prisma.customer.findFirst({where:{id:order.customerId,storeId,mergedIntoCustomerId:null},select:{name:true}});
    const plan=order.snapshot as {name?:unknown;price?:unknown};
    if (!customer||typeof plan?.name!=="string"||typeof plan?.price!=="number") return;
    await deliverManagerNotification({storeId,eventKey:`beauty-purchase-pending:${order.id}`,type:"TRANSFER_PENDING_CONFIRMATION",messages:[{type:"text",text:["美業方案待確認付款",store.name,`顧客：${customer.name}`,`方案：${plan.name}`,`應付金額：NT$${plan.price}`,`後四碼：${order.lastFour}`,`查看待核帳訂單：${managerUrl(store.slug,now,true)}`].join("\n")}],beforeDeliver:async()=>!!await beautyPrisma.beautyPurchase.findFirst({where:{id:purchaseId,storeId,status:"PENDING"},select:{id:true}})});
  } catch { console.error("[Beauty manager notification] purchase observer failed",{storeId}); }
}

/** Existing Beauty cron, no new schedule. Reads Beauty data only after every off guard.
 * End time is actual service duration; no steamfoot fixed one-hour assumption. */
export async function runBeautyManagerReminders(now=new Date()) {
  const result={sent:0,skipped:0,failed:0};
  if (beautyNotificationDeliveryBlocked()) return result;
  const stores=await prisma.store.findMany({where:{industryModule:"BEAUTY",operatingStatus:"ACTIVE",isDemo:false},select:{id:true,name:true,slug:true}});
  const count=(r:ManagerDeliveryResult)=>{if(r.status==="sent"){result.sent+=r.sentCount;result.failed+=r.failedCount;}else if(r.status==="failed")result.failed++;else result.skipped++;};
  for (const store of stores) {
    try {
      if (!await beautyManagerDeliveryAllowed(store.id)) continue;
      const today=toLocalDateStr(now),yesterday=dayRange(addTaiwanDuration(today,-1,"DAY"));
      const due=new Date(now.getTime()-60*60_000);
      const candidates=await beautyPrisma.beautyAppointment.findMany({where:{storeId:store.id,status:"RESERVED",endsAt:{gte:yesterday.start,lte:due}},orderBy:{endsAt:"asc"},take:100});
      for (const b of candidates) count(await deliverManagerNotification({storeId:store.id,type:"INCOMPLETE_SERVICE_REMINDER",eventKey:`beauty-incomplete:${b.id}:${b.endsAt.toISOString()}`,messages:[{type:"text",text:["服務尚未完成",store.name,`${b.personName}｜${b.serviceName}`,`${formatTWDateTime(b.startsAt)}–${formatTWDateTime(b.endsAt).slice(11)}`,"服務結束一小時後仍未完成，請核對。",`前往後台處理：${managerUrl(store.slug,b.startsAt)}`].join("\n")}],beforeDeliver:async()=>!!await beautyPrisma.beautyAppointment.findFirst({where:{id:b.id,storeId:store.id,status:"RESERVED",endsAt:b.endsAt},select:{id:true}})}));
      // Only the 09:00 quarter-hour window, never late catch-up after a disabled period.
      const nine=parseTaipeiDateTime(today,"09:00")!;
      if(now<nine||now.getTime()-nine.getTime()>=15*60_000)continue;
      const counts=async()=>Promise.all([
        beautyPrisma.beautyPurchase.count({where:{storeId:store.id,status:"PENDING"}}),
        beautyPrisma.beautyAppointment.count({where:{storeId:store.id,status:"RESERVED",endsAt:{gte:yesterday.start,lte:yesterday.end}}}),
      ]);
      const [pending,incomplete]=await counts();
      if(!pending&&!incomplete)continue;
      count(await deliverManagerNotification({storeId:store.id,type:"DAILY_ACTION_DIGEST",eventKey:`beauty-digest:${store.id}:${today}`,messages:[{type:"text",text:["今日待辦",store.name,`待確認付款：${pending} 筆`,`昨日未完成服務：${incomplete} 筆`,`前往後台：${managerUrl(store.slug,now,true)}`].join("\n")}],beforeDeliver:async()=>{const current=await counts();return current[0]===pending&&current[1]===incomplete;}}));
    } catch { result.failed++;console.error("[Beauty manager notification] reminder scan failed",{storeId:store.id}); }
  }
  return result;
}
