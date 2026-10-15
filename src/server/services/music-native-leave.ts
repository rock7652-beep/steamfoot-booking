import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { musicDataSeparationEnabled } from "./music-data-scope";
export const NATIVE_MAKEUP_PREFIX = "music-leave-makeup:";
type Card = { id:string;requestKey?:string;unit?:string;musicValidityDays?:number|null };
function fail(message:string):never {throw new AppError("VALIDATION",message);}

/** Native purchases are independently proven; never classify them as imported cards. */
export async function isNativeMusicLeaveCard(tx:Prisma.TransactionClient,storeId:string,card:Card|null|undefined) {
  if (!musicDataSeparationEnabled(storeId) || !card || card.unit!=="SESSION" || !card.musicValidityDays || card.requestKey?.startsWith("yjy-") || card.requestKey?.startsWith(NATIVE_MAKEUP_PREFIX)) return false;
  const purchases=await tx.coursePurchase.count({where:{storeId,cardId:card.id,status:"CONFIRMED",confirmedAt:{not:null},voidedAt:null}});
  return purchases===1;
}
export async function nativeLeaveWasDebited(tx:Prisma.TransactionClient,storeId:string,bookingId:string) {
  if(!musicDataSeparationEnabled(storeId))return false;
  return !!await tx.coursePointCard.findUnique({where:{storeId_requestKey:{storeId,requestKey:NATIVE_MAKEUP_PREFIX+bookingId}},select:{id:true}});
}
export async function isNativeMusicMakeup(tx:Prisma.TransactionClient,storeId:string,card:Card|null|undefined,at?:Date) {
  if(!card?.requestKey?.startsWith(NATIVE_MAKEUP_PREFIX))return false;
  if(!musicDataSeparationEnabled(storeId))fail("補課僅開放隔離測試站");
  const source=await tx.courseBooking.findFirst({where:{storeId,id:card.requestKey.slice(NATIVE_MAKEUP_PREFIX.length)},include:{card:true,session:true}});
  if(!source||source.status!=="CANCELLED"||source.absenceKind!=="STUDENT_LEAVE"||!await isNativeMusicLeaveCard(tx,storeId,source.card))fail("補課原請假或購課紀錄不符");
  if(at&&at<=source.session.startsAt)fail("補課必須安排在原請假課堂之後");
  return true;
}
export async function issueNativeMusicMakeup(tx:Prisma.TransactionClient,actor:{storeId:string;userId:string;name:string},booking:{id:string;cardId:string|null;customerId:string|null;session:{templateId:string}}) {
  if(!booking.cardId||!booking.customerId)fail("請假補課缺少原方案");
  const card=await tx.coursePointCard.findFirst({where:{storeId:actor.storeId,id:booking.cardId}});
  if(!card?.expiresAt||!await isNativeMusicLeaveCard(tx,actor.storeId,card))fail("請假補課未通過購課核對");
  const requestKey=NATIVE_MAKEUP_PREFIX+booking.id;
  const previous=await tx.coursePointCard.findUnique({where:{storeId_requestKey:{storeId:actor.storeId,requestKey}},include:{members:true}});
  if(previous){
    if(!previous.closedAt||previous.remaining!==0||previous.members.length!==1||previous.members[0].customerId!==booking.customerId)fail("已有補課權益，不能重複發放");
    await tx.coursePointCard.update({where:{id:previous.id},data:{remaining:1,closedAt:null,expiresAt:card.expiresAt,musicActivatedAt:card.musicActivatedAt}});
    return;
  }
  const right=await tx.coursePointCard.create({data:{id:"music-leave-card:"+createHash("sha256").update(booking.id).digest("hex").slice(0,32),storeId:actor.storeId,planId:card.planId,nameSnapshot:"補課｜"+card.nameSnapshot,remaining:1,unit:"SESSION",templateIds:[booking.session.templateId],requestKey,expiresAt:card.expiresAt,musicActivatedAt:card.musicActivatedAt,musicValidityDays:null,musicTermSizes:[1],members:{create:{customerId:booking.customerId}}}});
  await tx.coursePointEntry.create({data:{storeId:actor.storeId,cardId:right.id,kind:"GRANT",points:1,actorUserId:actor.userId}});
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,"targetType","targetId",action,summary,"afterJson","createdAt") VALUES (${"music-native-leave:"+booking.id},${actor.userId},${actor.name},${actor.storeId},'MUSIC','CourseBooking',${booking.id},'NATIVE_LEAVE_MAKEUP','請假扣原堂數，另給同期限補課',${JSON.stringify({originalCardId:card.id,makeupCardId:right.id,expiresAt:card.expiresAt.toISOString()})}::jsonb,NOW()) ON CONFLICT (id) DO NOTHING`;
}
export async function closeNativeMusicMakeup(tx:Prisma.TransactionClient,storeId:string,bookingId:string) {
  if(!musicDataSeparationEnabled(storeId))return;
  const card=await tx.coursePointCard.findUnique({where:{storeId_requestKey:{storeId,requestKey:NATIVE_MAKEUP_PREFIX+bookingId}}});
  if(!card||card.closedAt)return;
  if(card.remaining!==1||await tx.courseBooking.count({where:{storeId,cardId:card.id,status:{not:"CANCELLED"}}}))fail("補課已預約或核銷，請先取消或更正補課再恢復原堂");
  await tx.coursePointCard.update({where:{id:card.id},data:{remaining:0,closedAt:new Date()}});
}

/** Persisted entitlements distinguish deducted leaves from older non-deducting leaves. */
export async function nativeDeductedLeaveIds(tx:Prisma.TransactionClient,storeId:string) {
  if(!musicDataSeparationEnabled(storeId))return [];
  const coupons=await tx.coursePointCard.findMany({where:{storeId,requestKey:{startsWith:NATIVE_MAKEUP_PREFIX}},select:{requestKey:true}});
  return coupons.map(c=>c.requestKey.slice(NATIVE_MAKEUP_PREFIX.length));
}

export async function syncNativeMakeupExpiry(tx:Prisma.TransactionClient,storeId:string,cardId:string,expiresAt:Date,musicActivatedAt:Date|null) {
  if(!musicDataSeparationEnabled(storeId))return;
  const leaves=await tx.courseBooking.findMany({where:{storeId,cardId,status:"CANCELLED",absenceKind:"STUDENT_LEAVE"},select:{id:true}});
  if(leaves.length)await tx.coursePointCard.updateMany({where:{storeId,requestKey:{in:leaves.map(b=>NATIVE_MAKEUP_PREFIX+b.id)}},data:{expiresAt,musicActivatedAt}});
}
