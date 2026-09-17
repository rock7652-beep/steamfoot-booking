import "server-only";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { deriveBaseUrl } from "@/lib/base-url";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { deliverManagerNotification } from "./manager-notification-delivery";

// Post-commit observers only. Notification failure must not roll back reservations or purchases.
export async function notifyCourseBookingManagers(storeId:string, bookingIds:string[]) {
  try {
    const store=await prisma.store.findFirst({where:{id:storeId,industryModule:"COURSE"},select:{slug:true,name:true}});
    if(!store || !(await hasStoreFeature(storeId,FEATURES.LINE_REMINDER))) return;
    const bookings=await coursePrisma.courseBooking.findMany({where:{storeId,id:{in:bookingIds},status:"RESERVED",operatorCustomerId:{not:null},session:{storeId,cancelledAt:null}},include:{session:true}});
    for(const booking of bookings) {
      const date=toLocalDateStr(booking.session.startsAt);
      if(date!==toLocalDateStr() || date!==toLocalDateStr(booking.createdAt)) continue;
      const url=new URL(`/s/${encodeURIComponent(store.slug)}/admin/dashboard/courses`,deriveBaseUrl());url.searchParams.set("date",date);
      await deliverManagerNotification({storeId,eventKey:`course-booking-created:${booking.id}`,type:"SAME_DAY_BOOKING_CREATED",messages:[{type:"text",text:["今日新增課程預約",store.name,`${formatTWDateTime(booking.session.startsAt)} ${booking.session.nameSnapshot}`,`上課者：${booking.customerName}`,`預約人：${booking.operatorName}`,`查看課程：${url}`].join("\n")}]});
    }
  } catch { console.error("[Course manager notification] booking notification failed",{storeId}); }
}
export async function notifyCoursePurchaseManagers(storeId:string,purchaseId:string) {
  try {
    const store=await prisma.store.findFirst({where:{id:storeId,industryModule:"COURSE"},select:{slug:true,name:true}});
    if(!store || !(await hasStoreFeature(storeId,FEATURES.LINE_REMINDER))) return;
    const order=await coursePrisma.coursePurchase.findFirst({where:{id:purchaseId,storeId,status:"PENDING"}});
    if(!order) return;
    const customer=await prisma.customer.findFirst({where:{id:order.customerId,storeId,mergedIntoCustomerId:null},select:{name:true}});
    if(!customer) return;
    const url=new URL(`/s/${encodeURIComponent(store.slug)}/admin/dashboard/courses`,deriveBaseUrl());url.searchParams.set("view","plans");
    await deliverManagerNotification({storeId,eventKey:`course-purchase-pending:${order.id}`,type:"TRANSFER_PENDING_CONFIRMATION",messages:[{type:"text",text:["課程方案待確認付款",store.name,`顧客：${customer.name}`,`方案：${order.name}`,`應付金額：NT$${order.price}`,"請至後台核對入帳後再確認發卡。",`查看待核帳訂單：${url}`].join("\n")}]});
  } catch { console.error("[Course manager notification] purchase notification failed",{storeId}); }
}
