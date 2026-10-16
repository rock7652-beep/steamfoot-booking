import "server-only";
import {musicProjectionRead} from "./music-projection-reads";
import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import { assertMusicOpeningPreviewEnvironment } from "../../../scripts/music-opening-preview-scope.mjs";
import type { Prisma } from "../../../generated/course-client";
import { z } from "zod";
import { musicOpeningMakeupHash } from "@/lib/music-opening-makeup";
export const PILOT_EVIDENCE_HASH="5f32220ea9ea9a2f4b5841f01e3fc43bd2d48004fd62d43ae3d7073edfdfcfe7";
export const PILOT_EVIDENCE_ID="5f32220e-a9ea-9a2f-4b58-41f01e3fc43b";
export const PILOT_RECEIPT_ID="yjy-operational-import:20261014";
function fail(message:string):never {throw new AppError("VALIDATION",message);}
export async function isMusicPilotCard(tx:Prisma.TransactionClient,storeId:string,card:{id:string;requestKey?:string}|null|undefined){
  if(!card?.requestKey?.startsWith("yjy-pilot-card:"))return false;
  if(process.env.VERCEL!=="1")fail("僅開放隔離測試站");assertMusicOpeningPreviewEnvironment(process.env);
  const receipts=await musicProjectionRead(tx,JSON.stringify(["pilot-evidence",storeId,PILOT_RECEIPT_ID]),()=>tx.$queryRaw<Array<{afterJson:{contentHash:string;cardIds:string[]}}>>`SELECT "afterJson" FROM "AuditLog" WHERE id=${PILOT_RECEIPT_ID} AND "storeId"=${storeId} AND action='SOURCE_OPERATIONS_IMPORT'`);
  return receipts.length===1&&receipts[0].afterJson.contentHash===PILOT_EVIDENCE_HASH&&receipts[0].afterJson.cardIds.includes(card.id);
}
export async function isMusicPilotMakeupCard(tx:Prisma.TransactionClient,storeId:string,card:{id:string;requestKey?:string}|null|undefined,at?:Date){
  if(!card?.requestKey?.startsWith("yjy-pilot-makeup:"))return false;
  const source=await tx.courseBooking.findFirst({where:{id:card.requestKey.slice("yjy-pilot-makeup:".length),storeId},include:{card:true,session:true}});
  if(!source||source.absenceKind!=="STUDENT_LEAVE"||source.status!=="CANCELLED"||!await isMusicPilotCard(tx,storeId,source.card))fail("補課的原請假與來源方案不符");
  if(at&&at<=source.session.startsAt)fail("補課必須安排在原請假課堂之後");
  return true;
}
export async function issueMusicPilotLeaveMakeup(tx:Prisma.TransactionClient,actor:{storeId:string;userId:string;name:string},booking:{id:string;cardId:string|null;customerId:string|null;session:{templateId:string}}){
  if(!booking.cardId||!booking.customerId)fail("請假補課缺少原方案");
  const card=await tx.coursePointCard.findFirst({where:{id:booking.cardId,storeId:actor.storeId}});
  if(!card||!card.expiresAt||!await isMusicPilotCard(tx,actor.storeId,card))fail("請假补課未通過來源核對");
  const requestKey="yjy-pilot-makeup:"+booking.id;
  const previous=await tx.coursePointCard.findUnique({where:{storeId_requestKey:{storeId:actor.storeId,requestKey}},include:{members:true}});
  if(previous){
    if(previous.members.length!==1||previous.members[0].customerId!==booking.customerId||previous.templateIds.length!==1||previous.templateIds[0]!==booking.session.templateId||previous.expiresAt?.getTime()!==card.expiresAt.getTime()||!previous.closedAt||previous.remaining!==0)fail("這次請假已有補課權益，不能重複發放");
    await tx.coursePointCard.update({where:{id:previous.id},data:{remaining:1,closedAt:null}});return;
  }
  const right=await tx.coursePointCard.create({data:{id:"yjy-pilot-makeup-card:"+createHash("sha256").update(booking.id).digest("hex").slice(0,32),storeId:actor.storeId,planId:card.planId,nameSnapshot:"補課｜"+card.nameSnapshot,remaining:1,unit:"SESSION",templateIds:[booking.session.templateId],requestKey,expiresAt:card.expiresAt,musicActivatedAt:card.musicActivatedAt,musicValidityDays:null,musicTermSizes:[1],members:{create:{customerId:booking.customerId}}}});
  await tx.coursePointEntry.create({data:{storeId:actor.storeId,cardId:right.id,kind:"GRANT",points:1,actorUserId:actor.userId}});
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,"targetType","targetId",action,summary,"afterJson","createdAt") VALUES (${"yjy-pilot-leave:"+booking.id},${actor.userId},${actor.name},${actor.storeId},'MUSIC','CourseBooking',${booking.id},'PILOT_LEAVE_MAKEUP','請假扣原堂數，另給一堂同期限補課',${JSON.stringify({originalCardId:card.id,makeupRequestKey:requestKey,expiresAt:card.expiresAt.toISOString()})}::jsonb,NOW()) ON CONFLICT (id) DO NOTHING`;
}
export async function closeUnusedMusicPilotMakeup(tx:Prisma.TransactionClient,storeId:string,bookingId:string){
  const card=await tx.coursePointCard.findUnique({where:{storeId_requestKey:{storeId,requestKey:"yjy-pilot-makeup:"+bookingId}}});
  if(!card||card.closedAt)return;
  const used=await tx.courseBooking.count({where:{storeId,cardId:card.id,status:{not:"CANCELLED"}}});
  if(used||card.remaining!==1)fail("這次請假的補課已預約或核銷，請先取消或更正補課再恢復原堂");
  await tx.coursePointCard.update({where:{id:card.id},data:{remaining:0,closedAt:new Date()}});
}
export async function readMusicPilotTuition(tx:Prisma.TransactionClient,storeId:string){
  const rows=await tx.$queryRaw<Array<{payload:unknown;contentHash:string}>>`SELECT payload,"contentHash" FROM "MusicSourceImportBatch" WHERE id=${PILOT_EVIDENCE_ID} AND "storeId"=${storeId}`;
  if(rows.length!==1||rows[0].contentHash!==PILOT_EVIDENCE_HASH||musicOpeningMakeupHash(rows[0].payload)!==PILOT_EVIDENCE_HASH)fail("來源學費核對碼不一致");
  const schema=z.object({students:z.array(z.object({id:z.string(),customerId:z.string()})),histories:z.array(z.object({studentId:z.string(),fees:z.object({groups:z.array(z.object({periods:z.array(z.object({fee:z.array(z.string()),payments:z.array(z.object({tables:z.array(z.array(z.array(z.object({text:z.string()}))))}))}))}))})}))});
  const data=schema.parse(rows[0].payload);
  return data.histories.map(h=>{
    const periods=h.fees.groups.flatMap(g=>g.periods),amount=(s:string)=>Number(s.replaceAll(",",""));
    const paid=periods.reduce((n,p)=>n+amount(p.fee[5]),0),receivable=periods.reduce((n,p)=>n+amount(p.fee[6]),0);
    const payments=periods.flatMap(p=>p.payments[0].tables[0].slice(1).map(r=>({date:r[0].text,amount:amount(r[1].text),method:r[2].text})));
    if(!Number.isSafeInteger(paid)||!Number.isSafeInteger(receivable)||paid<0||receivable<0||payments.reduce((n,p)=>n+p.amount,0)!==paid)fail("來源付款明細與實收不一致");
    return {customerId:data.students.find(s=>s.id===h.studentId)!.customerId,paid,receivable,payments};
  });
}
