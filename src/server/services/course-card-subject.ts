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
export async function confirmCardSubject(tx:Prisma.TransactionClient,a:{storeId:string;userId:string},d:{cardId:string;customerId:string;subjectId?:string;subjectIds?:string[];cost:number;expectedRevision:string;requestKey:string}){
 const scopes=d.subjectIds??(d.subjectId?[d.subjectId]:[]);
 if(!scopes.length||scopes.length>200||new Set(scopes).size!==scopes.length||scopes.some(id=>!id||id.length>100)||!Number.isSafeInteger(d.cost)||d.cost<1||d.cost>10000)throw new AppError('VALIDATION','請核對適用科目與每堂扣抵數量');
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
 let templates:{id:string}[];
 if(scopes.length===1){
  const subject=await tx.musicSubject.findFirst({where:{id:scopes[0],storeId:a.storeId,isActive:true},select:{id:true}});
  templates=await tx.courseTemplate.findMany({where:{storeId:a.storeId,musicSubjectId:scopes[0]},select:{id:true}});
  if(!subject||!templates.length)throw new AppError('VALIDATION','請先設定本店有效科目與課程');
 }else{
  const {sportsTeachingTemplateId}=await import('./sports-teaching-rule');
  const subjects=await tx.musicSubject.findMany({where:{id:{in:scopes},storeId:a.storeId,isActive:true},select:{id:true}});
  const canonical=scopes.map(id=>sportsTeachingTemplateId(a.storeId,id));
  templates=await tx.courseTemplate.findMany({where:{storeId:a.storeId,id:{in:canonical},isActive:true,musicSubjectId:{in:scopes}},select:{id:true,musicSubjectId:true}});
  if(subjects.length!==scopes.length||templates.length!==scopes.length||templates.some(t=>!('musicSubjectId' in t)||typeof t.musicSubjectId!=='string'||t.id!==sportsTeachingTemplateId(a.storeId,t.musicSubjectId)))throw new AppError('VALIDATION','請先設定所有本店有效科目與課程');
 }
 if(card.bookings.some(b=>!b.session.template.musicSubjectId||!scopes.includes(b.session.template.musicSubjectId)||b.pointCost!==d.cost))throw new AppError('CONFLICT','已有不同科目或扣抵數量的預約，請先核對原預約，不會自動改卡或額度');
 await tx.coursePointCard.update({where:{id:card.id},data:{sportsMode:scopes.length===1?'ASSIGNED':'SUBJECTS',sportsSubjectId:scopes.length===1?scopes[0]:null,...(scopes.length>1?{sportsSubjectIds:[...scopes].sort()}:{}),sportsCost:d.cost,templateIds:templates.map(t=>t.id)}});
 const after=JSON.stringify({fingerprint,subjectId:scopes.length===1?scopes[0]:null,subjectIds:scopes,cost:d.cost,remainingPreserved:card.remaining,expiresAtPreserved:card.expiresAt?.toISOString()??null});
 const before=JSON.stringify({sportsMode:card.sportsMode,sportsSubjectId:card.sportsSubjectId,sportsSubjectIds:card.sportsSubjectIds,sportsCost:card.sportsCost,templateIds:card.templateIds});
 await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","storeId",module,"targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${receiptId},${a.userId},${a.storeId},'COURSE','CoursePointCard',${card.id},'CONFIRM_CARD_SUBJECT',${before}::jsonb,${after}::jsonb,NOW())`;
}
