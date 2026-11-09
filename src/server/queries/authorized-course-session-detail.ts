import 'server-only';
import {z} from 'zod';
import {coursePrisma} from '@/lib/course-db';
import {prisma} from '@/lib/db';
import {AppError} from '@/lib/errors';
import {measureMusicRead} from '@/lib/music-read-timing';
import {readCourseSessionDetail} from './course-session-detail';
import {readCourseDetailMusicStore} from './course-detail-music-store';
import {sportsNativePreview} from '@/lib/sports-native-preview';
import {musicItemTemplateIds} from '@/server/services/music-item-compatibility';
import {getCourseSharedCardState} from '@/server/services/course-shared-card';
import {nativeLeaveWasDebited} from '@/server/services/music-native-leave';
import {courseChargeSnapshot} from '@/lib/course-charge-settings';
import {courseCalendarRead} from '@/server/services/course-calendar-read-scope';
import type {courseManager} from '@/server/services/course-access';
const id=z.string().min(1).max(100);
/** Server-only read projection. Both entry points supply an actor freshly authorized by courseManager. */
export async function readAuthorizedCourseSessionDetail({user,storeId}:Awaited<ReturnType<typeof courseManager>>,sessionId:string,rosterOnly=false,trialOnly=false){
    id.parse(sessionId);
    const calendar=courseCalendarRead(coursePrisma,storeId,sessionId);
    const once=<T>(key:string,read:()=>Promise<T>):Promise<T>=>calendar?calendar.once(key,read):read();
    const { getCourseRoster, getCourseCards } =
      await import("@/server/queries/course-members");
    const { checkPermission } = await import("@/lib/permissions");
    const trialSettingsPromise=once("trial-settings",()=>import("@/lib/shop-config").then(m=>m.getTrialSettings(storeId)));
    // Roster balances and session policies are independent after authorization.
    // Await them together so either failure rejects this read; no cross-request cache.
    const [roster, {permissions, session, musicStore, waitlistSetting, nativeSports, waitlistRows, sportsRule, waitlistPolicy, compatibleTemplateIds, sharedCardState, teachingTemplates}] = await Promise.all([
      measureMusicRead("detail.roster",()=>getCourseRoster(storeId,sessionId)),
      (async()=>{
        const [permissions, session, musicStore, waitlistSetting, nativeSports, waitlistRows] = await measureMusicRead("detail.primary",()=>Promise.all([
          once("detail-permissions",()=>Promise.all((["wallet.read","booking.create","wallet.create","transaction.create","trial.create","trial.confirm","transaction.void","customer.read"] as const).map(p=>checkPermission(user.role,user.staffId,p)))),
          readCourseSessionDetail(storeId,sessionId),
          readCourseDetailMusicStore(storeId),
          once("waitlist-settings",()=>coursePrisma.courseWaitlistSetting.findUnique({where:{storeId},select:{autoPromoteStopMinutes:true,enabled:true}})),
          sportsNativePreview(storeId),
          (calendar?calendar.once("waitlist-rows",()=>coursePrisma.courseWaitlistEntry.findMany({
            where: { storeId, sessionId:{in:[...calendar.sessionIds]}, status: "WAITING" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { sessionId:true, id: true, customerId: true, customerName: true, groupKey: true, createdAt: true },
          })).then(rows=>rows.filter(row=>row.sessionId===sessionId)):coursePrisma.courseWaitlistEntry.findMany({
            where: { storeId, sessionId, status: "WAITING" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, customerId: true, customerName: true, groupKey: true, createdAt: true },
          })),
        ]));
        if (!session) throw new AppError("NOT_FOUND", "找不到本店課程");
        const {readSportsSessionRule}=await import("@/server/services/sports-staging-schedule");
        const {sessionWaitlistPolicy}=await import("@/server/services/sports-session-waitlist");
        const [sportsRule, waitlistPolicy, compatibleTemplateIds, sharedCardState] = await measureMusicRead("detail.policies",()=>Promise.all([
          nativeSports ? readSportsSessionRule(coursePrisma,storeId,sessionId) : null,
          sessionWaitlistPolicy(coursePrisma,storeId,sessionId,session.template),
          musicItemTemplateIds(coursePrisma, storeId, session.templateId),
          musicStore ? "ENABLED" as const : getCourseSharedCardState(storeId),
        ]));
        const teachingTemplates=sportsRule?.enrollment==="ASSIGNED"?await (await import("@/server/services/sports-teaching-templates")).readSportsTeachingTemplates(coursePrisma,storeId,session.template.musicSubjectId):[];
        return {permissions, session, musicStore, waitlistSetting, nativeSports, waitlistRows, sportsRule, waitlistPolicy, compatibleTemplateIds, sharedCardState, teachingTemplates};
      })(),
    ]);
    const [canReadCards,canCreate,canBuy,canPay,canTrial,canCollectTrial,canCorrectTrial,canReadCustomers] = permissions;
    const canPurchase=canBuy&&canPay;
    const {resolveSportsEntitlement}=await import("@/lib/sports-entitlement");
    const cardRights=(card:{planId?:string;unit:string;templateIds:string[];sportsMode?:string;sportsSubjectId?:string|null;sportsCost?:number|null;templateRestricted?:boolean})=>resolveSportsEntitlement({...card,planId:card.planId??""},{templateId:session.templateId,subjectId:session.template.musicSubjectId??null,pointCost:session.pointCost,enrollment:sportsRule?.enrollment==="ASSIGNED"?"ASSIGNED":sportsRule?.enrollment==="OPEN"?"OPEN":null,legacyPlanId:sportsRule?.planId??null,compatibleTemplateIds:teachingTemplates});
    const [cards, pendingMakeups,trialCustomers] = await Promise.all([
      canCreate && !rosterOnly && !trialOnly ? getCourseCards(storeId,undefined,nativeSports?{where:{closedAt:null,expiresAt:{gte:session.startsAt},OR:[{templateIds:{isEmpty:true}},{templateIds:{has:session.templateId}},...(teachingTemplates.length?[{sportsMode:"LEGACY" as const,unit:"SESSION",templateIds:{hasSome:teachingTemplates}}]:[]),...(session.template.musicSubjectId?[{sportsMode:"ASSIGNED" as const,sportsSubjectId:session.template.musicSubjectId}]:[])]},entries:false}:undefined) : [],
      canCreate && musicStore && !rosterOnly && !trialOnly ? coursePrisma.courseBooking.findMany({
        where:{storeId,status:"CANCELLED",bookingKind:"CARD",musicOpeningMakeupEntitlementId:null,absenceKind:"STUDENT_LEAVE",cardId:{not:null},NOT:[{card:{is:{requestKey:{startsWith:"music-leave-makeup:"}}}},{card:{is:{requestKey:{startsWith:"yjy-pilot-card:"}}}},{card:{is:{requestKey:{startsWith:"yjy-pilot-makeup:"}}}}],session:{templateId:session.templateId,startsAt:{lt:session.startsAt},template:{classType:{not:"GROUP"}}}},
        select:{id:true,customerId:true,cardId:true,session:{select:{startsAt:true}}},orderBy:{session:{startsAt:"asc"}},
      }).then(async leaves => {
        const used = await coursePrisma.courseBooking.findMany({where:{storeId,makeupForBookingId:{in:leaves.map(leave=>leave.id)},OR:[{status:{not:"CANCELLED"}},{absenceKind:"STUDENT_LEAVE"}]},select:{makeupForBookingId:true}});
        const nativeLeaves = await Promise.all(leaves.map(async leave=>await nativeLeaveWasDebited(coursePrisma,storeId,leave.id)?leave.id:null));
        const linked = new Set([...used.map(item=>item.makeupForBookingId), ...nativeLeaves]);
        return leaves.filter(leave=>!linked.has(leave.id)).map(leave=>({id:leave.id,customerId:leave.customerId,cardId:leave.cardId!,date:leave.session.startsAt.toISOString()}));
      }) : [],
      !rosterOnly && canCreate && canReadCustomers ? prisma.customer.findMany({where:{...(await import("@/lib/manager-visibility")).getManagerCustomerWhere(user.role,user.staffId,storeId),storeId,mergedIntoCustomerId:null},select:{id:true,name:true,phone:true},orderBy:{name:"asc"}}) : [],
    ]);
    return {
      success: true as const,
      data: {
        roster,
        customers:trialCustomers,
        sharedCardState,
        canPurchase,
        pendingMakeups,
        waitlist: waitlistRows.map((row, index, all) => {
          const groups = [...new Map(all.map(item => [item.groupKey, item.createdAt])).entries()]
            .sort((a, b) => a[1].getTime() - b[1].getTime() || a[0].localeCompare(b[0]));
          return {
            id: row.id,
            customerId: row.customerId,
            customerName: row.customerName,
            groupKey: row.groupKey,
            position: groups.findIndex(([key]) => key === row.groupKey) + 1,
            createdAt: row.createdAt.toISOString(),
          };
        }),
        trial: {
          settings: await trialSettingsPromise.then(settings=>{
            const snapshot=courseChargeSnapshot.safeParse(session.chargeSnapshot);
            return snapshot.success?{...settings,trialEnabled:settings.trialEnabled&&snapshot.data.trialPrice!==null,trialDefaultPrice:snapshot.data.trialPrice??settings.trialDefaultPrice}:settings;
          }),
          canCreate: canCreate && canTrial,
          canCollect: canCollectTrial,
          canCorrect: canCorrectTrial,
          customers: trialCustomers,
        },
        session: { ...await (await import("@/server/services/course-add-ons")).readCourseAddOnSessionFields(user,storeId,sessionId,session.template.musicSubject?.isActive===false?null:session.template.musicSubjectId), templateId:session.templateId,compatibleTemplateIds:sportsRule?.enrollment==="ASSIGNED"?teachingTemplates:compatibleTemplateIds,startsAt: session.startsAt.toISOString(), pointCost: session.pointCost, teacherNote: session.teacherNote, teacherAttendance:session.teacherAttendance, teacherAttendanceReason:session.teacherAttendanceReason,teacherMakeupForSessionId:session.teacherMakeupForSessionId, waitlistEnabled: !!waitlistSetting?.enabled && waitlistPolicy.waitlistEnabled, waitlistStopMinutes: waitlistPolicy.waitlistStopMinutes ?? waitlistSetting?.autoPromoteStopMinutes ?? 240 },
        cards: cards.filter((card) => (!musicStore || card.unit === "SESSION")&&(!sportsRule||cardRights(card).eligible)).map((card) => ({
          ...card,
          entries: canReadCards ? card.entries : [],
        })),
      },
    };
}
