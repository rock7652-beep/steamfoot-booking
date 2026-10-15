import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "../../../generated/course-client";
import { coursePrisma } from "@/lib/course-db";
import { AppError } from "@/lib/errors";
import { dayRange } from "@/lib/date-utils";
import { summarizeSettlement, type SettlementLine } from "@/lib/course-monthly-settlement";
import { assertMusicOpeningPreviewEnvironment } from "../../../scripts/music-opening-preview-scope.mjs";
import { lockCourseStore } from "./course-store-lock";
import { readMusicPilotFeeProof } from "./music-pilot-teacher-fee";
import { readCourseMonthlySettlement } from "./course-monthly-settlement";
import { confirmCourseMonth } from "./confirm-course-month";
import { recordCourseFeePayment, voidCourseFeePayment } from "./course-fee-payment";
import { correctCourseAttendance, type CourseActor } from "./course-booking";

export type MonthlyPilotResult={month:string;checks:string[];people:{name:string;fee:number;paid:number;remaining:number}[];lines:SettlementLine[];revisions:number;paymentCount:number;voidCount:number;expense:number;reversal:number;restored:boolean};
class RollbackResult extends Error {constructor(readonly report:MonthlyPilotResult,readonly before:string){super("ROLLBACK_PAYROLL_TEST");}}
const MONTH="2000-01";
function ensure(ok:unknown,message:string):asserts ok {if(!ok)throw new AppError("CONFLICT",`薪資測試未通過：${message}`);}
/** The fingerprint also covers original attendance, balances, entitlements and financial history. */
async function baseline(tx:Prisma.TransactionClient,storeId:string){
  const rows=await tx.$queryRaw<Array<{state:unknown}>>`SELECT jsonb_build_object(
    'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM "CourseSession" s WHERE s."storeId"=${storeId}),
    'bookings',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM "CourseBooking" b WHERE b."storeId"=${storeId}),
    'cards',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "CoursePointCard" c WHERE c."storeId"=${storeId}),
    'purchases',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "CoursePurchase" p WHERE p."storeId"=${storeId}),
    'points',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "CoursePointEntry" p WHERE p."storeId"=${storeId}),
    'snapshots',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c."sessionId") FROM "CourseCompensationSnapshot" c WHERE c."storeId"=${storeId}),
    'makeups',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "CourseMusicOpeningMakeupEntitlement" m WHERE m."storeId"=${storeId}),
    'fees',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "CourseFeePayment" p WHERE p."storeId"=${storeId}),
    'months',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "CourseMonthlySettlement" m WHERE m."storeId"=${storeId}),
    'cashbook',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "CashbookEntry" e WHERE e."storeId"=${storeId})
  ) AS state`;
  return createHash("sha256").update(JSON.stringify(rows[0].state)).digest("hex");
}

/** Runs native services in one locked transaction. Success is deliberately thrown
 * out of the callback: no fixture, notification, payment, expense or revision commits.
 * Never exposes arbitrary dates, amounts, IDs or SQL as client parameters. */
export async function runMusicPilotMonthlyTest(actor:CourseActor):Promise<MonthlyPilotResult>{
  assertMusicOpeningPreviewEnvironment(process.env);
  ensure(process.env.VERCEL==="1"&&actor.storeId==="store-lubymusic","僅限指定測試站");
  let rolled:RollbackResult;
  let stage="讀取測試前資料";
  try{
    await coursePrisma.$transaction(async tx=>{
      await lockCourseStore(tx,actor.storeId);
      const before=await baseline(tx,actor.storeId),proof=await readMusicPilotFeeProof(tx,actor.storeId);
      ensure(proof,"十人費率來源未驗證");
      ensure(!(await tx.courseSession.count({where:{storeId:actor.storeId,startsAt:{gte:dayRange("2000-01-01").start,lte:dayRange("2000-01-31").end}}})),"測試月份已有課堂，不能混用");
      const key=crypto.randomUUID(), checks:string[]=[];
      stage="讀取來源課堂";
      const customerIds=[...proof.enrollments.map(e=>e.customerId),proof.trial.customerId];
      const source=await tx.courseBooking.findMany({where:{storeId:actor.storeId,customerId:{in:customerIds},sessionId:{startsWith:"yjy-pilot-session:"}},include:{session:true},orderBy:{session:{startsAt:"asc"}}});
      const selected=[...new Map(source.map(b=>[b.customerId,b] as const).reverse()).values()];
      ensure(selected.length===8,"需有七位購課學員與一位體驗學員");
      const sessions=new Map<string,string>(),cards=new Map<string,string>(),bookings=new Map<string,string>();
      let index=0;
      async function session(templateId:string,roomId:string,coachId:string,name:string,isTrial:boolean){
        stage="建立模擬課堂及鐘點快照";
        const startsAt=dayRange(`2000-01-${String(++index).padStart(2,"0")}`).start;
        const s=await tx.courseSession.create({data:{storeId:actor.storeId,templateId,roomId,coachId,nameSnapshot:`[薪資測試・自動復原] ${name}`,isTrial,startsAt,endsAt:new Date(startsAt.getTime()+3600000),pointCost:1,capacity:10,requestKey:key,requestIndex:index,createdById:actor.userId}});
        const percent=proof!.teachers.find(t=>t.staffId===coachId)?.percent;
        ensure(percent!==undefined,"老師費率未驗證");
        await tx.$executeRaw`UPDATE "CourseCompensationSnapshot" SET rule=${JSON.stringify({mode:"SHARE",value:percent,calculationVersion:2})}::jsonb,revision=1,"musicPricePerLesson"=${isTrial?800:450},"musicTeacherFeeBase"=${isTrial?800:null},"musicTrialMode"=${isTrial?"FREE":null} WHERE "sessionId"=${s.id} AND "storeId"=${actor.storeId}`;
        return s.id;
      }
      for(const b of selected){
        const original=b.session;
        let sessionId=sessions.get(original.id);
        if(!sessionId){sessionId=await session(original.templateId,original.roomId,original.coachId,original.nameSnapshot,b.bookingKind==="TRIAL");sessions.set(original.id,sessionId);}
        let cardId:string|null=null;
        if(b.cardId){
          const basis=proof.enrollments.find(e=>e.customerId===b.customerId&&e.cardId===b.cardId);
          ensure(basis,"原價方案未核對");
          const originalCard=await tx.coursePointCard.findUniqueOrThrow({where:{id:b.cardId}});
          stage="建立模擬方案及原價基數";
          const c=await tx.coursePointCard.create({data:{storeId:actor.storeId,planId:originalCard.planId,nameSnapshot:"[薪資測試・自動復原]",unit:"SESSION",templateIds:[original.templateId],remaining:8,expiresAt:dayRange("2000-02-28").end,requestKey:crypto.randomUUID()}});
          cardId=c.id;cards.set(b.customerId!,c.id);
          await tx.courseCardMember.create({data:{storeId:actor.storeId,cardId,customerId:b.customerId!}});
          await tx.coursePurchase.create({data:{storeId:actor.storeId,customerId:b.customerId!,planId:c.planId,name:c.nameSnapshot,unit:"SESSION",points:8,price:0,listPrice:basis.originalUnitPrice*8,discountKind:"PERCENT",discountValue:100,paymentMethod:"DISCOUNT",validDays:70,templateIds:c.templateIds,status:"CONFIRMED",transferLastFive:"",requestKey:crypto.randomUUID(),cardId,confirmedAt:dayRange("2000-01-01").start,confirmedBy:actor.userId,storeCostSnapshot:0,developerProfitSnapshot:0,note:"測試原價基數；零收款；交易結束自動復原"}});
        }
        stage="建立模擬預約及出席更正";
        const clone=await tx.courseBooking.create({data:{storeId:actor.storeId,sessionId,cardId,customerId:b.customerId,customerName:b.customerName,bookingKind:b.bookingKind,trialPrice:b.trialPrice,operatorUserId:actor.userId,operatorName:actor.name,pointCost:cardId?1:0,requestKey:crypto.randomUUID()}});
        bookings.set(b.customerId!,clone.id);
        await correctCourseAttendance(tx,actor,clone.id,"ATTENDED","RESERVED");
      }
      // Three completed source trials are rate references only. These are labelled
      // synthetic lessons, never replayed into source history or actual payroll.
      for(const h of [
        {customerId:"yjy-lubymusic-student-6ac8cec04f500100b5595683",staffId:"music-luby-staff-zheng"},
        {customerId:"yjy-lubymusic-student-6abf62c57e15ad00b50e1308",staffId:"music-luby-staff-yu"},
        {customerId:proof.oldMakeup.customerId,staffId:"music-luby-staff-li"},
      ]){
        const customer=await tx.$queryRaw<Array<{name:string}>>`SELECT name FROM "Customer" WHERE id=${h.customerId} AND "storeId"=${actor.storeId}`;
        ensure(customer.length===1,"歷史體驗學員不存在");
        const template=selected.find(b=>b.bookingKind==="TRIAL")!.session;
        const sessionId=await session(proof.trial.templateId,template.roomId,h.staffId,"免費體驗・費率對照",true);
        await tx.courseBooking.create({data:{storeId:actor.storeId,sessionId,customerId:h.customerId,customerName:customer[0].name,bookingKind:"TRIAL",trialPrice:0,operatorUserId:actor.userId,operatorName:actor.name,pointCost:0,status:"ATTENDED",requestKey:crypto.randomUUID()}});
      }
      const report=()=>readCourseMonthlySettlement(tx,actor.storeId,MONTH);
      const confirm=async()=>{const r=await report();await confirmCourseMonth(tx,actor,{month:MONTH,fingerprint:r.fingerprint,revision:r.revisions[0]?.revision??0,reason:"僅測試・結束自動復原"});return r;};
      const reject=async(work:()=>Promise<unknown>,label:string)=>{try{await work();}catch(e){if(e instanceof AppError){checks.push(label);return;}throw e;}throw new AppError("CONFLICT",`薪資測試未通過：${label}`);};
      const pay=async(id:string,amount?:number)=>{
        const line=(await report()).lines.find(l=>l.id===id)!;
        ensure(line&&line.amount!==null&&!line.issue,"付款明細有待核對項");
        const input={sessionId:id,expectedAmount:line.amount!,expectedRemaining:line.amount!-line.paid,amount:amount??line.amount!-line.paid,method:"OTHER",requestKey:crypto.randomUUID(),note:"模擬發薪；未轉帳；結束自動復原"};
        await recordCourseFeePayment(tx,actor,input);await recordCourseFeePayment(tx,actor,input);
        const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "CourseFeePayment" WHERE "storeId"=${actor.storeId} AND "requestKey"=${input.requestKey}`;
        ensure(rows.length===1,"相同付款請求重複登錄");return rows[0].id;
      };
      stage="確認初始月結";
      let r=await confirm();ensure(r.lines.reduce((n,l)=>n+l.amount!,0)===3750&&r.lines.every(l=>!l.issue),"十人・八堂模擬薪資應為 3750");
      await confirm();ensure((await report()).revisions.length===1,"重複確認新增月結版本");checks.push("十位學員、五位老師月結 3,750 元；重複確認只留一版");
      const privateBooking=bookings.get(proof.oldMakeup.customerId)!;
      const privateSession=selected.find(b=>b.customerId===proof.oldMakeup.customerId)!.sessionId;
      const privateClone=sessions.get(privateSession)!;
      stage="分次發薪及重送付款";
      const p1=await pay(privateClone,200),p2=await pay(privateClone,200);
      for(const l of r.lines.filter(l=>l.id!==privateClone))await pay(l.id);
      await reject(()=>recordCourseFeePayment(tx,actor,{sessionId:privateClone,expectedAmount:400,amount:400,method:"OTHER",requestKey:crypto.randomUUID(),note:"重複全額"}),"分次 200＋200；重送及換請求均不能超付");
      stage="請假及補課薪資更正";
      await correctCourseAttendance(tx,actor,privateBooking,"CANCELLED","ATTENDED");
      await tx.courseBooking.update({where:{id:privateBooking},data:{absenceKind:"STUDENT_LEAVE"}});
      r=await report();ensure(r.lines.find(l=>l.id===privateClone)?.amount===0&&r.lines.find(l=>l.id===privateClone)?.paid===400,"請假更正必須呈現原日多付 400");checks.push("更正為請假：原課日 0 元，已登錄 400 元保留並提示多付");
      await reject(()=>recordCourseFeePayment(tx,actor,{sessionId:privateClone,expectedAmount:400,expectedRemaining:400,amount:400,method:"OTHER",requestKey:crypto.randomUUID(),note:"舊畫面重送"}),"請假更正後，舊金額付款請求會被阻擋");
      const sourcePrivate=selected.find(b=>b.customerId===proof.oldMakeup.customerId)!.session;
      const makeup=await session(sourcePrivate.templateId,sourcePrivate.roomId,sourcePrivate.coachId,"實際補課日",false);
      const mb=await tx.courseBooking.create({data:{storeId:actor.storeId,sessionId:makeup,cardId:cards.get(proof.oldMakeup.customerId),customerId:proof.oldMakeup.customerId,customerName:"黃子齊",makeupForBookingId:privateBooking,operatorUserId:actor.userId,operatorName:actor.name,pointCost:1,requestKey:crypto.randomUUID()}});
      await correctCourseAttendance(tx,actor,mb.id,"ATTENDED","RESERVED");
      const voidOnce=async(id:string)=>{const input={paymentId:id,reason:"測試更正點名・沖回誤登；未轉帳"};await voidCourseFeePayment(tx,actor,input);await voidCourseFeePayment(tx,actor,input);};
      await voidOnce(p1);await voidOnce(p2);await pay(makeup);await confirm();
      r=await report();ensure(r.lines.reduce((n,l)=>n+l.paid,0)===3750&&r.lines.find(l=>l.id===privateClone)?.paid===0&&r.lines.find(l=>l.id===makeup)?.paid===400,"補課重複計薪");checks.push("請假原付款沖回兩筆；補課日只付 400 元，原日不再計薪");
      const groupCustomer="yjy-lubymusic-student-6abcd0c725424800b676c6d7",groupBooking=bookings.get(groupCustomer)!;
      const group=await tx.courseBooking.findUniqueOrThrow({where:{id:groupBooking}});
      const previous=await report();
      stage="團班點名及付款更正";
      await correctCourseAttendance(tx,actor,groupBooking,"RESERVED","ATTENDED");
      await correctCourseAttendance(tx,actor,groupBooking,"RESERVED","RESERVED");
      r=await report();ensure(r.lines.find(l=>l.id===group.sessionId)?.amount===null,"待點名應阻擋月結");
      await reject(()=>confirm(),"恢復待點名後月結阻擋；重複更正不重扣堂");
      await correctCourseAttendance(tx,actor,groupBooking,"CANCELLED","RESERVED");
      await tx.courseBooking.update({where:{id:groupBooking},data:{absenceKind:"STUDENT_LEAVE"}});
      r=await report();ensure(r.lines.find(l=>l.id===group.sessionId)?.amount===810&&r.lines.find(l=>l.id===group.sessionId)?.paid===1080,"團班更正應顯示多付 270");
      await reject(()=>confirmCourseMonth(tx,actor,{month:MONTH,fingerprint:previous.fingerprint,revision:previous.revisions[0].revision,reason:"舊版更正"}),"更正後拒絕舊版月結；1080→810，顯示多付 270 元");
      await confirm();
      const groupPayment=r.lines.find(l=>l.id===group.sessionId)!.payments.find(p=>!p.voided)!;
      await voidOnce(groupPayment.id);await pay(group.sessionId);
      await correctCourseAttendance(tx,actor,groupBooking,"RESERVED","CANCELLED");
      await correctCourseAttendance(tx,actor,groupBooking,"NO_SHOW","RESERVED");
      r=await report();ensure(r.lines.find(l=>l.id===group.sessionId)?.amount===1080,"曠課仍須扣堂計薪");checks.push("曠課恢復 1,080 元，僅補登差額 270 元");
      await pay(group.sessionId);await correctCourseAttendance(tx,actor,groupBooking,"ATTENDED","NO_SHOW");await correctCourseAttendance(tx,actor,groupBooking,"ATTENDED","ATTENDED");await confirm();
      ensure((await tx.coursePointCard.findUniqueOrThrow({where:{id:cards.get(groupCustomer)!}})).remaining===7,"重複更正多扣堂數");
      r=await report();ensure(summarizeSettlement(r.lines).every(p=>p.remaining===0&&p.issues===0),"最終應付與已付不一致");
      const ledger=await tx.$queryRaw<Array<{expense:bigint;reversal:bigint;paymentCount:bigint;voidCount:bigint}>>`SELECT
        (SELECT COALESCE(sum(e.amount),0)::bigint FROM "CashbookEntry" e JOIN "CourseFeePayment" p ON e.id='course-fee:'||p.id WHERE p."storeId"=${actor.storeId} AND p."sessionId"=ANY(${r.lines.map(l=>l.id)}::text[])) AS expense,
        (SELECT COALESCE(sum(e.amount),0)::bigint FROM "CashbookEntry" e JOIN "CourseFeePayment" p ON e.id='course-fee-void:'||p.id WHERE p."storeId"=${actor.storeId} AND p."sessionId"=ANY(${r.lines.map(l=>l.id)}::text[])) AS reversal,
        count(*) AS "paymentCount",count(*) FILTER(WHERE "voidedAt" IS NOT NULL) AS "voidCount" FROM "CourseFeePayment" WHERE "storeId"=${actor.storeId} AND "sessionId"=ANY(${r.lines.map(l=>l.id)}::text[])`;
      ensure(Number(ledger[0].expense)-Number(ledger[0].reversal)===3750&&Number(ledger[0].voidCount)===3,"付款支出與沖回不一致");checks.push("原付款與沖回均保留；重複沖回不新增收入；淨支出 3,750 元");
      throw new RollbackResult({month:MONTH,checks,people:summarizeSettlement(r.lines).map(p=>({name:p.name,fee:p.fee,paid:p.paid,remaining:p.remaining})),lines:r.lines,revisions:r.revisions.length,paymentCount:Number(ledger[0].paymentCount),voidCount:Number(ledger[0].voidCount),expense:Number(ledger[0].expense),reversal:Number(ledger[0].reversal),restored:false},before);
    },{timeout:60000,maxWait:10000});
    throw new AppError("CONFLICT","測試交易未復原，停止顯示成功");
  }catch(e){
    if(e instanceof RollbackResult)rolled=e;
    else if(e instanceof AppError)throw e;
    else{
      const code=typeof e==="object"&&e!==null&&"code" in e&&/^P\d{4}$/.test(String(e.code))?String(e.code):"未完成";
      console.error("[music-pilot-monthly-test]",{stage,code});
      throw new AppError("CONFLICT",`${stage}未完成（${code}）；測試交易已中止，未登錄實際發薪。`);
    }
  }
  const after=await coursePrisma.$transaction(async tx=>{await lockCourseStore(tx,actor.storeId);return baseline(tx,actor.storeId);},{timeout:15000});
  ensure(after===rolled.before,"資料復原核對不同，請重新核對原資料");
  return {...rolled.report,restored:true,checks:[...rolled.report.checks,"已讀回確認：原堂數、排課、補課、月結及發薪帳冊全部復原"]};
}
