import 'server-only';
import {createHash} from 'node:crypto';
import type {Prisma} from '../../../generated/course-client';
import {AppError} from '@/lib/errors';
export function cardSubjectRevision(card:unknown){return createHash('sha256').update(JSON.stringify(card)).digest('hex');}
export async function readSubjectReviewCard(tx:Prisma.TransactionClient,storeId:string,cardId:string){
 return tx.coursePointCard.findFirst({
  where:{id:cardId,storeId},
  include:{
   members:{orderBy:{customerId:'asc'}},
   bookings:{where:{status:'RESERVED'},orderBy:{id:'asc'},select:{id:true,pointCost:true,session:{select:{template:{select:{musicSubjectId:true}}}}}},
  },
 });
}
export async function confirmCardSubject(tx:Prisma.TransactionClient,a:{storeId:string;userId:string},d:{cardId:string;customerId:string;subjectId:string;cost:number;expectedRevision:string;requestKey:string}){
 const receiptId='card-subject:'+cardSubjectRevision([a.storeId,d.requestKey]);
 const fingerprint=cardSubjectRevision([a.userId,d]);
 const receipts=await tx.$queryRaw<Array<{afterJson:{fingerprint:string}}>>`SELECT "afterJson" FROM "AuditLog" WHERE id=${receiptId} AND "storeId"=${a.storeId}`;
 if(receipts.length){if(receipts[0].afterJson.fingerprint!==fingerprint)throw new AppError('CONFLICT','請求識別已使用，請重新核對');return;}
 const card=await readSubjectReviewCard(tx,a.storeId,d.cardId);
 if(!card||!card.members.some(m=>m.customerId===d.customerId))throw new AppError('NOT_FOUND','找不到學員持有的本店方案');
 if(cardSubjectRevision(card)!==d.expectedRevision)throw new AppError('CONFLICT','方案或預約已變更，請重新核對');
 if(card.closedAt||card.sportsMode!=='OPEN'||card.sportsSubjectId||card.musicOpeningStateRequired||['yjy-','no-show-makeup:','music-leave-makeup:'].some(p=>card.requestKey.startsWith(p)))throw new AppError('CONFLICT','此方案不適用舊通用卡科目核對');
 if(card.unit==='SESSION'&&d.cost!==1)throw new AppError('VALIDATION','堂數方案每次使用 1 堂');
 if(!['SESSION','POINT'].includes(card.unit))throw new AppError('VALIDATION','不支援此方案單位');
 const subject=await tx.musicSubject.findFirst({where:{id:d.subjectId,storeId:a.storeId,isActive:true},select:{id:true}});
 const templates=await tx.courseTemplate.findMany({where:{storeId:a.storeId,musicSubjectId:d.subjectId},select:{id:true}});
 if(!subject||!templates.length)throw new AppError('VALIDATION','請先設定本店有效科目與課程');
 if(card.bookings.some(b=>b.session.template.musicSubjectId!==d.subjectId||b.pointCost!==d.cost))throw new AppError('CONFLICT','已有不同科目或扣抵數量的預約，請先核對原預約，不會自動改卡或額度');
 await tx.coursePointCard.update({where:{id:card.id},data:{sportsMode:'ASSIGNED',sportsSubjectId:d.subjectId,sportsCost:d.cost,templateIds:templates.map(t=>t.id)}});
 const after=JSON.stringify({fingerprint,subjectId:d.subjectId,cost:d.cost,remainingPreserved:card.remaining,expiresAtPreserved:card.expiresAt?.toISOString()??null});
 const before=JSON.stringify({sportsMode:card.sportsMode,sportsSubjectId:card.sportsSubjectId,sportsCost:card.sportsCost,templateIds:card.templateIds});
 await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","storeId",module,"targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${receiptId},${a.userId},${a.storeId},'COURSE','CoursePointCard',${card.id},'CONFIRM_CARD_SUBJECT',${before}::jsonb,${after}::jsonb,NOW())`;
}
