import { isMusicOpeningMakeupBooking } from "@/lib/music-opening-runtime";
import { courseDisplayName } from "@/lib/course-template-presentation";
import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { addTaiwanDuration, dayRange, formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { courseMemberNotificationUrl, courseBookingActionUrl } from "./course-delivery-links";

/** Business events prepare candidates and content; they never send or choose a LINE recipient. */
export const COURSE_REMINDER_TRIGGER="COURSE_NEXT_DAY";
export const COURSE_REMINDER_DEFAULT="請記得準時到課；如需取消，請依店家規則在會員專區逐位處理。";
export const courseReminderId=(storeId:string)=>`course-next-day:${storeId}`;
export async function getCourseReminderCandidates(storeId:string,now=new Date()) {
 const store=await prisma.store.findFirst({where:{id:storeId,industryModule:"COURSE"},select:{id:true,name:true,slug:true}});
 if(!store) throw new Error("此提醒僅適用本店課程");
 const date=addTaiwanDuration(toLocalDateStr(now),1,"DAY"),range=dayRange(date);
 const bookings=await coursePrisma.courseBooking.findMany({where:{storeId,status:"RESERVED",bookingKind:{not:"OPENING_MAKEUP"},musicOpeningMakeupEntitlementId:null,session:{storeId,cancelledAt:null,startsAt:{gte:range.start,lte:range.end}}},include:{session:true}});
 const customers=await prisma.customer.findMany({where:{storeId,id:{in:bookings.map(b=>b.customerId ?? b.reserverCustomerId).filter((id): id is string => !!id)},mergedIntoCustomerId:null},select:{id:true,name:true,lineUserId:true}});
 return bookings.flatMap(booking=>{if(isMusicOpeningMakeupBooking(booking))return [];const customer=customers.find(c=>c.id===(booking.customerId ?? booking.reserverCustomerId));return customer?[{booking,customer,store,date}]:[];});
}
export function courseReminderRetryKey(id:string) {
 const hex=createHash("sha256").update(id).digest("hex");
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

type Candidate = Awaited<ReturnType<typeof getCourseReminderCandidates>>[number];
export function prepareCourseReminderEvent(
  {booking, customer, store, date}: Candidate,
  text: string, now: Date, map: {address: string | null; mapUrl: string | null} | null,
) {
  const id=`course-reminder:${createHash("sha256").update(`${store.id}:${booking.id}:${booking.session.startsAt.toISOString()}`).digest("hex")}`;
  const url=courseMemberNotificationUrl(store.slug,"bookings",date);
  const body=`${customer.name}｜${formatTWDateTime(booking.session.startsAt)}｜${courseDisplayName(booking.session.nameSnapshot)}\n${text}\n${url}`;
  const triggerAt=new Date(`${toLocalDateStr(now)}T18:00:00+08:00`);
  const messageInput={customerName:customer.name,bookingDate:date,bookingTime:formatTWDateTime(booking.session.startsAt).slice(11),shopName:store.name,serviceName:courseDisplayName(booking.session.nameSnapshot),serviceDuration:`${Math.round((booking.session.endsAt.getTime()-booking.session.startsAt.getTime())/60000)} 分鐘`,reminderText:text,address:map?.address??undefined,mapUrl:map?.mapUrl && /^https:\/\//.test(map.mapUrl) ? map.mapUrl : undefined,courseActions:{...(booking.bookingKind==="TRIAL"?{confirm:courseBookingActionUrl(store.slug,date,booking.id,"confirm")}:{}),reschedule:courseBookingActionUrl(store.slug,date,booking.id,"reschedule"),cancel:courseBookingActionUrl(store.slug,date,booking.id,"cancel")}};
  return {id,url,body,triggerAt,messageInput};
}
