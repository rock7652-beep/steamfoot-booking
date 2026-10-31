"use server";
import {readCourseSessionDetail} from "@/server/queries/course-session-detail";
import {measureMusicRead} from "@/lib/music-read-timing";
import {measureMusicCheckout,withCourseCheckoutRequest,musicCheckoutShouldDeferSnapshot} from "@/server/services/music-checkout-request";
import {readPurchasedCourseRoster,readPurchasedCourseCards,readCommittedCourseRoster} from '@/server/queries/course-purchase-roster';
import {assertCoursePlanMode} from "@/server/services/course-scheduling-modes";

import {courseChargeSnapshot} from "@/lib/course-charge-settings";
import {Prisma as CoursePrismaValue} from "../../../generated/course-client";
import {assertChargeProviders} from "@/server/services/course-charge";
import {requireStoreFeature} from "@/lib/feature-gate";
import {FEATURES} from "@/lib/feature-flags";
import { courseDisplayName } from "@/lib/course-template-presentation";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import {sportsFeeSetup} from "@/lib/sports-staging-types";
import { isMusicCourseStore, isMusicCourseStoreFromEntitlements } from "@/server/services/course-business-profile";
import {recordCourseStoreNotice} from "@/server/services/course-store-notices";
import { syncMusicSubjectTeachers } from "@/server/services/music-teaching-qualifications";
import { nativeLeaveWasDebited } from "@/server/services/music-native-leave";
import { musicItemTemplateIds } from "@/server/services/music-item-compatibility";
import { isMusicOpeningMakeupBooking, MUSIC_OPENING_MAKEUP_OPERATION_ISSUE } from "@/lib/music-opening-runtime";
import { enqueueOperationAudit } from "@/server/services/operation-audit-outbox";
import {readCourseOrders} from "@/server/services/course-display-order";
import {orderCourseRows} from "@/lib/course-display-order";
import { createHash } from "node:crypto";
import { quoteMusicPlanSettings, assertCoursePlanBusiness } from "@/server/services/course-plan-rules";
import { coursePlanValues,coursePlanReceipt,savedCoursePlan } from "@/lib/course-plan-save";
import { settingsSaveUncertain } from "@/server/services/settings-save-error";
import { resolveMusicSubjectRule } from "@/server/services/music-subject-rule";
import { courseBookingBrowse } from "@/lib/course-booking-browse";
import {validateCourseTerm} from "@/server/services/course-term";
import {scheduleCourseLowBalanceCheck} from "@/server/services/course-low-balance-schedule";
import { courseCheckoutSchema } from "@/lib/course-checkout";
import { assignCourseWithCheckout } from "@/server/services/course-assignment-checkout";
import { coursePurchaseIntentsEnabled } from "@/lib/course-purchase-intent-flag";
import { parseCoursePurchaseIntentInput } from "@/server/services/course-purchase-intent-input";
import { assertCourseIntentForCheckout, commitCourseIntent } from "@/server/services/course-purchase-intent";
import {readSettlementSettings} from "@/server/services/course-monthly-settlement";
import { after } from "next/server";
import { z } from "zod";
import { updateCustomerSchema } from "@/lib/validators/customer";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError, handleActionError } from "@/lib/errors";
import { addTaiwanDuration, toLocalDateStr, dayRange, parseTaipeiDateTime } from "@/lib/date-utils";
import {
  courseManager,
  courseMember,
  courseAccount,
  courseTransaction,
} from "@/server/services/course-access";
import {
  reserveCourse,
  reserveCourseMembers,
  settleCourseBooking,
  correctCourseAttendance,
  syncCourseRelease,
  refundTeacherAbsentSession,
  type CourseActor,
} from "@/server/services/course-booking";
import { cancelCourseWaitlistForSession } from "@/server/services/course-waitlist";
import { getCourseSharedCardState, getCourseSharedCardStateInTransaction } from "@/server/services/course-shared-card";

const id = z.string().min(1).max(100);
function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/courses");
  revalidatePath("/book");
}

function scheduleCourseWaitlistPromotion(
  storeId: string,
  sessionIds: string[],
  trigger: { actorUserId: string; actorNameSnapshot?: string | null },
) {
  const uniqueSessionIds = [...new Set(sessionIds)].filter(Boolean);
  if (!uniqueSessionIds.length) return;
  after(async () => {
    try {
      const [{ promoteCourseWaitlistForSession }, { notifyCourseWaitlistPromotions }] = await Promise.all([
        import("@/server/services/course-waitlist"),
        import("@/server/services/course-waitlist-notifications"),
      ]);
      for (const sessionId of uniqueSessionIds) {
        const promoted = await courseTransaction(storeId, tx =>
          promoteCourseWaitlistForSession(tx, storeId, sessionId),
         async (promoted, tx) => { if (promoted.length) await enqueueOperationAudit({
              actorUserId: trigger.actorUserId,
              actorNameSnapshot: trigger.actorNameSnapshot,
              storeId,
              module: "COURSE",
              targetType: "CourseWaitlist",
              targetId: sessionId,
              action: "AUTO_PROMOTE",
              summary: `候補自動遞補（${promoted.length} 人）`,
              after: { bookingIds: promoted.map(item => item.bookingId) },
            }, tx, promoted.map(item=>item.bookingId).sort().join('|')); });
        if (promoted.length) { after(() => notifyCourseWaitlistPromotions(storeId, promoted)); }
      }
    } catch (error) {
      console.error("[course-waitlist] post-cancel promotion failed", {
        storeId,
        sessionIds: uniqueSessionIds,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

// The music roster updates itself optimistically and reconciles through a direct roster read.
// Revalidating from a Server Action also forces the current dashboard route to reload.
async function refreshUnlessMusicRoster(storeId: string) {
  const music = await isMusicCourseStoreFromEntitlements(prisma, storeId);
  if (!music) refresh();
}
const bookingInput = z.object({
  bookingKind: z.never().optional(),
  musicOpeningMakeupEntitlementId: z.never().optional(),
  makeupForBookingId: id.nullable().optional(),
  sessionId: id,
  notes: z.string().trim().max(1000).default(""),
  cardId: id,
  customerId: id,
  requestKey: z.string().uuid(),
});

export async function saveCourseCustomer(input: unknown,module:"course"|"beauty"="course") {
  try {
    const data = updateCustomerSchema.pick({ name: true, phone: true, email: true, gender: true, birthday: true, height: true, lineName: true, serviceNote: true, expectedUpdatedAt: true }).extend({ id: id.optional(), emergencyContactName: z.string().trim().max(100).nullable().optional(), emergencyContactPhone: z.string().trim().max(30).nullable().optional(), address: z.string().trim().max(300).nullable().optional(), notes: z.string().trim().max(1000).nullable().optional(), requestKey:z.string().uuid().optional(),expectedStoreId:id.optional() }).parse(input);
    module=z.enum(["course","beauty"]).parse(module);
    const permission=data.id ? "customer.update" : "customer.create";
    const context=module==='beauty'?await(await import('@/server/beauty/access')).beautyManager(permission,true):await courseManager(permission);
    const storeId=context.storeId,actorUserId='user' in context?context.user.id:context.userId;
    if(module==='beauty'&&data.expectedStoreId!==storeId)throw new AppError('CONFLICT','目前門市已切換，請重新開啟顧客資料');
    if(module==='beauty'&&data.id&&!data.expectedUpdatedAt)throw new AppError('CONFLICT','請重新開啟顧客資料後再儲存');
    if(module==='beauty'&&!data.id&&!data.requestKey)throw new AppError('VALIDATION','缺少顧客建立請求，請重新開啟');
    if(module==='beauty')await requireStoreFeature(storeId,FEATURES.CUSTOMER_MANAGEMENT);
    if (data.birthday && !parseTaipeiDateTime(data.birthday, "00:00")) throw new AppError("VALIDATION", "生日格式不正確");
    const profile = {
      name: data.name, phone: data.phone,
      email: data.email ?? null,
      gender: data.gender ?? null,
      birthday: data.birthday ? new Date(`${data.birthday}T00:00:00.000Z`) : null,
      ...(data.height!==undefined?{height:data.height??null}:{}),
      ...(data.emergencyContactName !== undefined ? { emergencyContactName: data.emergencyContactName || null } : {}),
      ...(data.emergencyContactPhone !== undefined ? { emergencyContactPhone: data.emergencyContactPhone || null } : {}),
      ...(data.address !== undefined ? { address: data.address || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(data.lineName !== undefined ? { lineName: data.lineName || null } : {}),
      ...(data.serviceNote !== undefined ? { serviceNote: data.serviceNote || null } : {}),
    };
    let customerId = data.id ?? "";
    if (data.id) {
      const result = await prisma.customer.updateMany({
        where: { id: data.id, storeId, mergedIntoCustomerId: null, ...(data.expectedUpdatedAt ? {updatedAt:new Date(data.expectedUpdatedAt)} : {}) },
        data: profile,
      });
      if (!result.count) throw new AppError(data.expectedUpdatedAt?"CONFLICT":"NOT_FOUND", data.expectedUpdatedAt?"顧客資料已有更新，輸入已保留。請核對目前資料後再編輯。":"找不到本店顧客");
    } else {
      const { getStoreLimitsByStoreId } = await import("@/lib/feature-gate");
      const limits = await getStoreLimitsByStoreId(storeId);
      customerId = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
        const receiptId=module==='beauty'?`beauty-customer:${createHash('sha256').update(JSON.stringify([storeId,data.requestKey])).digest('hex')}`:null;
        const fingerprint=createHash('sha256').update(JSON.stringify(profile)).digest('hex');
        if(receiptId){
          const previous=await tx.auditLog.findUnique({where:{id:receiptId}});
          if(previous){
            if(previous.storeId!==storeId||previous.actorUserId!==actorUserId||previous.summary!==fingerprint)throw new AppError('CONFLICT','此建立請求已使用，請重新核對');
            return previous.targetId;
          }
        }
        const count = await tx.customer.count({
          where: { storeId, mergedIntoCustomerId: null },
        });
        if (limits.maxCustomers !== null && count >= limits.maxCustomers)
          throw new AppError("FORBIDDEN", "已達方案顧客額度上限");
        const created = await tx.customer.create({
          data: { storeId, ...profile },
          select: { id: true },
        });
        if(receiptId){
          if(!actorUserId)throw new AppError('FORBIDDEN','請重新登入');
          await tx.auditLog.create({data:{id:receiptId,actorUserId,storeId,module:'BEAUTY',targetType:'Customer',targetId:created.id,action:'CREATE',summary:fingerprint}});
        }
        return created.id;
      });
    }
    let syncWarning=false;
    if(module==='beauty'){try{revalidatePath("/dashboard/beauty");}catch{syncWarning=true;}}else refresh();
    return { success: true as const, data: { id: customerId },syncWarning };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function saveCoursePointPlan(input: unknown) {
  try {
    const schema = coursePlanValues.extend({expectedSnapshot:z.string().max(30000).optional(),receipt:coursePlanReceipt.optional(),sportsSetup:sportsFeeSetup.optional(),musicTeacherIds:z.array(id).min(1).max(100).optional(),expectedMusicTeacherIds:z.array(id).max(100).optional()});
    const { id: planId, expectedSnapshot, musicSetup, musicTeacherIds, expectedMusicTeacherIds, allowShared, receipt, sportsSetup, ...fields } = schema.parse(input);
    const hasSportsIntent=!!input&&typeof input==="object"&&Object.prototype.hasOwnProperty.call(input,"sportsMode");
    const data = { ...fields, allowShared: allowShared ?? false };
    const expected = expectedSnapshot ? schema.omit({id:true,expectedSnapshot:true,musicSetup:true,musicTeacherIds:true,expectedMusicTeacherIds:true,receipt:true,sportsSetup:true}).parse(JSON.parse(expectedSnapshot)) : null;
    const { storeId,user } = await courseManager("plans.edit");
    if(sportsSetup){
      if(sportsSetup.compensation){await courseManager("teacher.compensation.manage");if(user.role!=="OWNER"&&user.role!=="ADMIN")throw new AppError("FORBIDDEN","僅店長可設定運動計酬");}
      const {requireSportsStaging}=await import('@/lib/sports-staging');(await requireSportsStaging(storeId));
      await courseManager('booking.create');await courseManager('staff.manage');
      if(!receipt)throw new AppError('VALIDATION','缺少收費設定請求');
      const fitness=await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:'business.fitness',status:'ENABLED'}});
      if(!fitness)throw new AppError('FORBIDDEN','此入口僅適用運動測試店');
    }
    if (data.sportsMode !== "LEGACY") {
      const {requireSportsStaging}=await import("@/lib/sports-staging");(await requireSportsStaging(storeId));
      if (!receipt || !await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.fitness",status:"ENABLED"}})) throw new AppError("FORBIDDEN","此設定僅適用運動店");
      const {sportsEntitlementSnapshot}=await import("@/lib/sports-entitlement");sportsEntitlementSnapshot(data);
      if (data.termSessionIds.length || data.musicTerms !== null || musicSetup || sportsSetup) throw new AppError("VALIDATION","此方案不適用期課或舊收費設定");
    } else if (data.sportsSubjectId !== null || data.sportsCost !== null) throw new AppError("VALIDATION","舊方案不可混入新模式權益");
    if (receipt && storeId !== receipt.expectedStoreId) throw new AppError("CONFLICT","目前門市已切換，請重新開啟方案設定。");
    const receiptId = receipt ? `plan_${createHash("sha256").update(JSON.stringify([storeId,receipt.requestKey])).digest("hex")}` : undefined;
    const saved = await courseTransaction(storeId,async tx=>{
    if(planId&&!data.chargeSettings){
      const existing=await tx.coursePointPlan.findFirst({where:{id:planId,storeId}});
      data.chargeSettings=coursePlanValues.parse(existing??data).chargeSettings;
    }
    if(sportsSetup){const {prepareSportsFee}=await import('@/server/services/sports-staging-fee');const setup=await prepareSportsFee(tx,storeId,user.id,planId??receiptId!,sportsSetup,data.unit);data.templateIds=[setup.templateId];data.storeCost=setup.storeCost;}
    if (data.sportsMode !== "LEGACY") {
      const {assertSportsProductionReady}=await import("@/server/services/sports-production-readiness");await assertSportsProductionReady(tx,storeId);
      if (data.sportsMode === "ASSIGNED") {
        const {sportsTeachingTemplateId}=await import("@/server/services/sports-teaching-rule");
        const subject=await tx.musicSubject.findFirst({where:{id:data.sportsSubjectId!,storeId,isActive:true}});
        const template=await tx.courseTemplate.findFirst({where:{id:sportsTeachingTemplateId(storeId,data.sportsSubjectId!),storeId,isActive:true}});
        if(!subject||!template)throw new AppError("VALIDATION","請先在教學項目設定授課教練與課程規則");
        data.templateIds=[template.id];
      } else data.templateIds=[];
    }
    const isMusic = await isMusicCourseStore(tx, storeId);
    if(isMusic && data.sportsMode!=="LEGACY")throw new AppError("VALIDATION","音樂方案不使用運動權益");
    assertCoursePlanBusiness(isMusic, data, !!musicSetup);
    if (isMusic && !musicSetup) {
      if (data.templateIds.length!==1 || data.musicTerms===null) throw new AppError("VALIDATION","音樂方案請選擇一種課程與購買期數");
      const template=await tx.courseTemplate.findFirst({where:{id:data.templateIds[0],storeId,isActive:true},select:{musicPricePerLesson:true,musicTermLessons:true,musicValidityDaysPerTerm:true,musicTrialMode:true}});
      if (!template || template.musicTrialMode) throw new AppError("VALIDATION","體驗課不建立期數方案，請選擇一般課程");
      Object.assign(data, quoteMusicPlanSettings(data, template));
      if (data.termSessionIds.length) throw new AppError("VALIDATION","音樂固定時段由課表管理，購買方案不預先綁定指定課次");
    }
    if (data.templateIds.length && await tx.courseTemplate.count({ where: { storeId, id: { in: data.templateIds } } }) !== new Set(data.templateIds).size) throw new AppError("VALIDATION", "適用課程必須屬於本店");
    if(isMusic && musicSetup){
      if(data.musicTerms===null || data.termSessionIds.length)throw new AppError("VALIDATION","請設定購買期數；實際上課日期由課表安排");
      const template=await resolveMusicSubjectRule(tx,storeId,musicSetup);
      data.templateIds=[template.id];
      Object.assign(data, quoteMusicPlanSettings(data, template));
      if(musicSetup.totalPrice!==undefined)data.price=musicSetup.totalPrice;
    }
    if (isMusic && musicSetup && !data.chargeSettings) {
      const result = await syncMusicSubjectTeachers(tx, storeId, musicSetup.subjectId, musicTeacherIds, expectedMusicTeacherIds, async () => {
        const access = await courseManager("staff.manage");
        if (access.storeId !== storeId || access.user.id !== user.id) throw new AppError("FORBIDDEN", "教師管理範圍不符");
      });
      if (result.changed) await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,summary,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${user.id},'MusicSubject',${musicSetup.subjectId},'QUALIFICATIONS','更新教學項目授課教師',${JSON.stringify(result.before)}::jsonb,${JSON.stringify(result.after)}::jsonb,now())`;
    }
    if(data.chargeSettings){
      if(data.chargeSettings.kind==='single'&&(data.points!==1||data.unit!=='SESSION'))throw new AppError('VALIDATION','單次收費須為一堂');
      if(data.sportsMode==='OPEN'&&(data.chargeSettings.trialPrice!==null||data.chargeSettings.trialDuration!==null||data.chargeSettings.trialStoreCost!=null))throw new AppError('VALIDATION','開放選課沿用店家體驗費與課程時間');
      await assertChargeProviders(tx,storeId,data.templateIds,data.chargeSettings);
    }
    const previous=planId || receiptId ? await tx.coursePointPlan.findFirst({where:{id:planId??receiptId,storeId}}):null;
    if(!previous||(previous.sportsMode??"LEGACY")!==data.sportsMode||!previous.isActive&&data.isActive) await assertCoursePlanMode(tx,storeId,data.sportsMode);
    if(previous&&(previous.sportsMode??"LEGACY")!=="LEGACY"&&data.sportsMode==="LEGACY"){
      if(hasSportsIntent)throw new AppError("VALIDATION","新模式方案不可改為舊方案，請新增方案");
      if(data.unit!==previous.unit)throw new AppError("VALIDATION","請從運動收費方式修改方案計費單位");
      data.sportsMode=previous.sportsMode as "ASSIGNED"|"OPEN";data.sportsSubjectId=previous.sportsSubjectId;data.sportsCost=previous.sportsCost;data.templateIds=previous.templateIds;
    }
    if(receipt && planId && !previous)throw new AppError("NOT_FOUND","找不到本店方案");
    // Hidden/locked controls may be omitted by a form. Preserve an existing choice.
    if (previous && !isMusic && allowShared === undefined) data.allowShared = previous.allowShared;
    if (data.allowShared && !previous?.allowShared) {
      if (!isMusic && await getCourseSharedCardStateInTransaction(tx, storeId) !== "ENABLED")
        throw new AppError("FORBIDDEN", "本店共卡功能尚未開通，不能新增共卡方案");
    }
    const sameTerm=previous && previous.points===data.points && previous.unit===data.unit && JSON.stringify([...previous.termSessionIds].sort())===JSON.stringify([...data.termSessionIds].sort()) && JSON.stringify([...previous.templateIds].sort())===JSON.stringify([...data.templateIds].sort());
    if(previous?.termSessionIds.length&&!sameTerm&&await tx.coursePurchase.count({where:{storeId,planId}}))throw new AppError("CONFLICT","此期課已有購買紀錄，請新增下一期方案，保留原期別課次。");
    data.termSessionIds=sameTerm?previous.termSessionIds:await validateCourseTerm(tx,storeId,data);
    const snapshotSchema = coursePlanValues.omit({id:true,musicSetup:true});
    const sameValues = previous && JSON.stringify(snapshotSchema.parse(previous)) === JSON.stringify(snapshotSchema.parse(data));
    if (receipt && previous && (!planId || expected && JSON.stringify(snapshotSchema.parse(previous)) !== JSON.stringify(snapshotSchema.parse(expected)))) {
      if(sameValues)return previous;
      throw new AppError("CONFLICT","方案已有更新，輸入已保留。請核對目前資料後再編輯。");
    }
    if (planId) {
      const result = await tx.coursePointPlan.updateMany({
        where: { id: planId, storeId, ...(expected ? {...expected,chargeSettings:expected.chargeSettings===null?{equals:CoursePrismaValue.DbNull}:{equals:expected.chargeSettings},musicTermSizes:{equals:expected.musicTermSizes},templateIds:{equals:expected.templateIds},termSessionIds:{equals:expected.termSessionIds}} : {}) },
        data:{...data,chargeSettings:data.chargeSettings??undefined},
      });
      if (!result.count) throw new AppError(expected?"CONFLICT":"NOT_FOUND", expected?"方案已有更新，輸入已保留。請核對目前資料後再編輯。":"找不到本店方案");
      if(receipt)return tx.coursePointPlan.findFirstOrThrow({where:{id:planId,storeId}});
    } else
      return tx.coursePointPlan.create({ data: { ...data, chargeSettings:data.chargeSettings??undefined, storeId, ...(receiptId?{id:receiptId}:{}) } });
    });
    let syncWarning=false;
    try {refresh();}catch(error){if(!receipt)throw error;syncWarning=true;}
    return { success: true as const, storeId, data: receipt?savedCoursePlan.parse(saved):undefined, syncWarning };
  } catch (error) {
    return {...handleActionError(error),uncertain:settingsSaveUncertain(error)};
  }
}

export async function setCoursePointPlanStatus(input: unknown) {
  try {
    const data = z.object({ id, isActive: z.boolean() }).parse(input);
    const { storeId } = await courseManager("plans.edit");
    const result = await courseTransaction(storeId,async tx=>{
      const plan=await tx.coursePointPlan.findFirst({where:{id:data.id,storeId}});
      if(data.isActive&&plan&&!plan.isActive)await assertCoursePlanMode(tx,storeId,plan.sportsMode);
      return tx.coursePointPlan.updateMany({where:{id:data.id,storeId},data:{isActive:data.isActive}});
    });
    if (!result.count) throw new AppError("NOT_FOUND", "找不到本店方案");
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function assignCoursePointCard(input: unknown) {
  return withCourseCheckoutRequest(async timings=>{
  const started=performance.now();
  try {
    if (input && typeof input === "object" && ["musicOpeningState","musicOpeningStateRequired","sourceKey","openingBalance"].some(key=>key in input))
      throw new AppError("VALIDATION","期初資料不可經新增購買或收款流程建立");
    const [actor,financialActor] = await Promise.all([courseManager("wallet.create"),courseManager("transaction.create")]);
    const {user,storeId}=actor;
    if(financialActor.storeId!==storeId||financialActor.user.id!==user.id)throw new AppError("FORBIDDEN","店家範圍不一致");
    const data = z
      .object({
        planId: id,
        customerId: id,
        bookingId: id.optional(),
        expiresDate: z
          .string()
          .refine((v) => !!parseTaipeiDateTime(v, "00:00")),
        requestKey: z.string().uuid(),
      })
      .parse(input);
    const checkout = courseCheckoutSchema.parse(input);
    if (checkout.discountValue > 0 || checkout.musicDiscountTeacherFee || (checkout.musicManualBonus??0)>0) await courseManager("transaction.discount");
    const intentInput = coursePurchaseIntentsEnabled(storeId) ? parseCoursePurchaseIntentInput(input) : null;
    let musicCheckout=false;
    const purchase=await courseTransaction(storeId, async tx => {
      if (intentInput) await assertCourseIntentForCheckout(tx,storeId,intentInput);
      const plan=await tx.coursePointPlan.findFirst({where:{id:data.planId,storeId},select:{termSessionIds:true,unit:true}});
      const music = await isMusicCourseStore(tx, storeId);musicCheckout=music;
      if(music && plan?.unit==="POINT")throw new AppError("VALIDATION","音樂教室只使用堂數方案");
      if(plan?.termSessionIds.length) await courseManager("booking.create");
      const purchase=await assignCourseWithCheckout(tx, {storeId, userId:user.id, music}, {...data,...checkout});
      if (intentInput) await commitCourseIntent(tx,storeId,intentInput,purchase.id);
      // Purchasing grants rights only. Staff confirms attendance separately;
      // selecting a new purchase here would bypass first-purchased-first-used.

      return purchase;
    });
    // The transaction is committed. Cache invalidation must not delay the
    // checkout response or turn a successful payment into a reported failure.
    after(() => {
      try {
      for (const path of ["/dashboard/revenue", "/dashboard/transactions", "/dashboard/cashbook", "/dashboard/cash-drawer", "/dashboard/courses", "/dashboard/customers"]) revalidatePath(path);
      refresh();
    } catch { console.error("[course-checkout] committed; refresh invalidation failed"); }
    });
    const rosterSnapshot=await readPurchasedCourseRoster(storeId,data.customerId,data.bookingId);
    const checkoutCards=!data.bookingId&&!musicCheckout?await readPurchasedCourseCards(data.customerId):null;
    let musicSnapshot:import('@/lib/music-purchase-snapshot').MusicPurchaseSnapshot|null=null;
    if(!musicCheckoutShouldDeferSnapshot()&&musicCheckout&&!data.bookingId&&input&&typeof input==='object'&&'musicSnapshotView' in input&&input.musicSnapshotView==='periods'){
      try{const {readMusicPurchaseSnapshot}=await import('@/server/queries/music-purchase-snapshot');musicSnapshot=await readMusicPurchaseSnapshot(input);}catch{/* Committed purchase remains successful. */}
    }
    return { success: true as const,...(musicSnapshot?{musicSnapshot}:{}),...(checkoutCards?{checkoutCards}:{}),...(rosterSnapshot?{rosterSnapshot}:{}),checkoutReceipt:{storeId,requestKey:data.requestKey,purchaseId:purchase.id,cardId:purchase.cardId,customerId:data.customerId,name:purchase.name,quantity:purchase.points,unit:purchase.unit,paid:purchase.price} };
  } catch (error) {
    return handleActionError(error);
  }finally{console.info("[course-checkout-perf]",{durationMs:Math.round(performance.now()-started),phases:timings});}
  });
}

/** Checkout options for the learner currently selected in the schedule dialog. */
export async function loadCourseStudentPurchase(bookingId: string) {
  return withCourseCheckoutRequest(async timings=>{
  const started=performance.now();
  try {
    id.parse(bookingId);
    const [actor,financialActor]=await Promise.all([courseManager("wallet.create"),courseManager("transaction.create")]);
    const {user,storeId}=actor;
    if(financialActor.storeId!==storeId||financialActor.user.id!==user.id)throw new AppError("FORBIDDEN","店家範圍不一致");
    const booking = await coursePrisma.courseBooking.findFirst({
      where: { id: bookingId, storeId },
      select: { customerId: true, customerName: true, session: { select: { templateId: true,template:{select:{musicSubjectId:true}} } } },
    });
    if (!booking) throw new AppError("NOT_FOUND", "找不到本店學員");
    const { checkPermission } = await import("@/lib/permissions");
    const music=await isMusicCourseStore(coursePrisma,storeId);
    const itemTemplates = await musicItemTemplateIds(coursePrisma,storeId,booking.session.templateId);
    const [plans, customer, canDiscount, settlement, revenueStaffOptions] = await Promise.all([
      coursePrisma.coursePointPlan.findMany({
        where: { storeId, isActive: true, unit:music?"SESSION":{in:["SESSION","POINT"]}, OR:[{templateIds:{hasSome:itemTemplates}},...(!music&&booking.session.template.musicSubjectId?[{sportsMode:"ASSIGNED",sportsSubjectId:booking.session.template.musicSubjectId}]:[])] },
        select: { id: true, name: true, unit:true, points: true, price: true, storeCost: true, validDays: true, musicTerms:true,musicTermSizes:true,musicBonusLessons:true },
        orderBy: [{ points: "asc" }, { name: "asc" }],
      }),
      prisma.customer.findFirst({ where: { id: booking.customerId ?? "", storeId, mergedIntoCustomerId: null }, select: { id: true, assignedStaffId:true } }),
      checkPermission(user.role, user.staffId, "transaction.discount"),
      music?Promise.resolve({profitEnabled:false}):readSettlementSettings(coursePrisma,storeId),
      music?Promise.resolve([]):prisma.staff.findMany({where:{storeId,status:"ACTIVE",user:{status:"ACTIVE",role:"OWNER"}},select:{id:true,displayName:true},orderBy:{displayName:"asc"}}),
    ]);
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店學員");
    return { success: true as const, data: { customerId: booking.customerId, customerName: booking.customerName, plans:orderCourseRows(plans,(await readCourseOrders(storeId)).plan?.ids??[]), canDiscount, music, profitEnabled:settlement.profitEnabled, revenueStaffOptions:settlement.profitEnabled?revenueStaffOptions:[], defaultRevenueStaffId:settlement.profitEnabled?revenueStaffOptions.find(staff=>staff.id===customer.assignedStaffId)?.id??"":"" } };
  } catch (error) {
    return handleActionError(error);
  }finally{console.info("[course-purchase-options-perf]",{durationMs:Math.round(performance.now()-started),phases:timings});}
  });
}

export async function setCourseCardMembers(input: unknown) {
  try {
    const { storeId } = await courseManager("wallet.create");
    const data = z
      .object({ cardId: id, customerIds: z.array(id).min(1).max(50) })
      .parse(input);
    await courseTransaction(storeId, async (tx) => {
      const card = await tx.coursePointCard.findFirst({
        where: { id: data.cardId, storeId },
        include: { members: true, plan: { select: { allowShared: true } } },
      });
      if (!card) throw new AppError("NOT_FOUND", "找不到本店方案");
      if (card.musicOpeningStateRequired) throw new AppError("VALIDATION","期初方案的學員關聯須先核對，不能轉為共卡");
      const music = await isMusicCourseStore(tx, storeId);
      const additions = data.customerIds.filter(customerId => !card.members.some(member => member.customerId === customerId));
      // Keep music's existing membership rules; sports retains historical removal rights.
      if ((music || additions.length) && !card.plan.allowShared)
        throw new AppError("VALIDATION", "此方案未開放共卡");
      if (additions.length) {
        if (!music && await getCourseSharedCardStateInTransaction(tx, storeId) !== "ENABLED")
          throw new AppError("FORBIDDEN", "本店共卡功能尚未開通，不能新增共卡成員");
      }
      if(card.termSessionIds.length)throw new AppError("VALIDATION","期課為指定學員，不開放共卡；請另購方案");
      for (const customerId of new Set(data.customerIds)) {
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "Customer" WHERE id = ${customerId} AND "storeId" = ${storeId} AND "mergedIntoCustomerId" IS NULL`;
        if (!rows.length)
          throw new AppError("FORBIDDEN", "共卡只能加入本店顧客");
      }
      // Do not orphan a reserved learner/operator by revoking access silently.
      const held = await tx.courseBooking.findMany({
        where: { storeId, cardId: card.id, status: "RESERVED" },
        select: { customerId: true, operatorCustomerId: true, reserverCustomerId: true, reserverCardId: true, companionIndex: true },
      });
      if (
        held.some(
          (b) => b.companionIndex
            ? b.reserverCardId === card.id
              ? !b.reserverCustomerId || !data.customerIds.includes(b.reserverCustomerId)
              : !b.customerId || !data.customerIds.includes(b.customerId)
            : (b.customerId && !data.customerIds.includes(b.customerId)) ||
              (b.operatorCustomerId && !data.customerIds.includes(b.operatorCustomerId)),
        )
      )
        throw new AppError("CONFLICT", "移除成員前請先處理其尚未完成的預約");
      await tx.courseCardMember.deleteMany({
        where: {
          cardId: card.id,
          storeId,
          customerId: { notIn: data.customerIds },
        },
      });
      await tx.courseCardMember.createMany({
        data: [...new Set(data.customerIds)].map((customerId) => ({
          storeId,
          cardId: card.id,
          customerId,
        })),
        skipDuplicates: true,
      });
    });
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function createCourseBooking(input: unknown) {
  try {
    const { user, storeId } = await courseManager("booking.create");
    const booking = await reserveCourse(
      { userId: user.id, storeId, name: user.name ?? "店長" },
      bookingInput.extend({cardId:id.optional(),autoCard:z.boolean().optional(),allowOverCapacity:z.boolean().optional()}).refine(d=>!!d.cardId||d.autoCard===true,"請選擇有效方案").parse(input),
    );

    scheduleCourseLowBalanceCheck(storeId,[booking.id]);
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function createMemberCourseBooking(input: unknown) {
  try {
    const { user, storeId, customer } = await courseMember({ write: true });
    if (input && typeof input === "object" && "makeupForBookingId" in input && input.makeupForBookingId) throw new AppError("VALIDATION", "補課請逐位安排");
    const bookings = await reserveCourseMembers(
      {
        userId: user.id,
        storeId,
        name: customer.name,
        customerId: customer.id,
      },
      z.union([
        bookingInput.omit({ customerId: true }).extend({ customerIds: z.array(id).min(1).max(20), companionNames: z.array(z.string().trim().max(100)).max(2).optional() }),
        bookingInput.transform(({ customerId, ...rest }) => ({ ...rest, customerIds: [customerId] })),
      ]).parse(input),
    );

    scheduleCourseLowBalanceCheck(storeId,bookings.map(b=>b.id));
    after(async () => {
      const {notifyCourseBookingManagers}=await import("@/server/services/course-manager-notifications");
      await notifyCourseBookingManagers(storeId,bookings.map(b=>b.id));
    });
    // Return the committed receipt before rebuilding the full portal.
    after(() => refresh());
    const confirmedAt = Date.now();
    return { success: true as const, bookingUpdates: bookings.map(b => ({
      confirmedAt,
      id: b.id, sessionId: b.sessionId, cardId: b.cardId, customerId: b.customerId,
      customerName: b.customerName, operatorName: b.operatorName, reserverCustomerId: b.reserverCustomerId,
      status: b.status, cost: b.pointCost,
    })) };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function updateCourseBookingStatus(input: unknown) {
 return withCourseCheckoutRequest(async(timings)=>{
  const started = performance.now();
  try {
    const data = z
      .object({
        bookingId: id,
        returnRoster:z.boolean().default(false),
        status: z.enum(["CANCELLED", "ATTENDED", "CHECKED_IN", "NO_SHOW", "STUDENT_LEAVE"]),
        noShowChoice: z
          .enum(["DEDUCTED", "DEDUCTED_WITH_MAKEUP"])
          .optional(),
        member: z.boolean().default(false),
        expectedStatus: z.enum(["RESERVED", "ATTENDED", "NO_SHOW", "CANCELLED"]).optional(),
      })
      .parse(input);
    let actor: CourseActor;
    if (data.member) {
      const { user, storeId, customer } = await courseMember({ write: true });
      if (data.status !== "CANCELLED" && data.status !== "STUDENT_LEAVE")
        throw new AppError("FORBIDDEN", "會員不能操作點名");
      actor = {
        userId: user.id,
        storeId,
        name: customer.name,
        customerId: customer.id,
      };
    } else {
      const { user, storeId } = await courseManager("booking.update");
      actor = { userId: user.id, storeId, name: user.name ?? "店長" };
    }
    const settledSessionId = await courseTransaction(actor.storeId, async (tx) => {
      if (!data.member && (data.status === "CANCELLED" || data.status === "STUDENT_LEAVE")) {
        const booking = await tx.courseBooking.findFirst({where:{id:data.bookingId,storeId:actor.storeId},select:{bookingKind:true}});
        if (booking?.bookingKind === "TRIAL") await courseManager("trial.cancel");
      }
      if (!data.member && data.expectedStatus && data.expectedStatus !== "RESERVED" &&
          (data.status === "NO_SHOW" || data.status === "STUDENT_LEAVE") && await sportsNativePreview(actor.storeId)) {
        const corrected=await correctCourseAttendance(tx,actor,data.bookingId,
          data.status === "STUDENT_LEAVE" ? "CANCELLED" : "NO_SHOW",data.expectedStatus,
          data.status === "STUDENT_LEAVE" ? {waiveAbsence:true} : {});
        return corrected.sessionId;
      }
      if (!data.member && data.status === "CANCELLED" && data.expectedStatus) {
        const current = await tx.courseBooking.findFirst({where:{id:data.bookingId,storeId:actor.storeId},select:{status:true,absenceKind:true}});
        if (!current || current.status !== data.expectedStatus) throw new AppError("CONFLICT", "名單已更新，請重新確認");
        if (current.status !== "RESERVED") {
          const corrected=await correctCourseAttendance(tx,actor,data.bookingId,"CANCELLED",current.status);
          return corrected.sessionId;
        }
      }
      const settled = await settleCourseBooking(
        tx,
        actor,
        data.bookingId,
        data.status,
        data.noShowChoice,
      );
      return settled.sessionId;
    }, async (auditResult, tx) => { await enqueueOperationAudit({
      actorUserId: actor.userId,
      ...((await sportsNativePreview(actor.storeId))?{actorNameSnapshot:actor.name}:{}),
      storeId: actor.storeId,
      module: "COURSE",
      targetType: "CourseBooking",
      targetId: data.bookingId,
      action: data.status,
      summary: ({ CANCELLED: "取消課程預約", ATTENDED: "標記課程出席", CHECKED_IN: "課程報到", NO_SHOW: "標記課程未到", STUDENT_LEAVE: "記錄學員請假" } as const)[data.status],
    }, tx); });
    if (data.status === "CANCELLED" || data.status === "STUDENT_LEAVE")
      scheduleCourseWaitlistPromotion(actor.storeId, [settledSessionId], {
        actorUserId: actor.userId,
        actorNameSnapshot: actor.name,
      });

    scheduleCourseLowBalanceCheck(actor.storeId,[data.bookingId]);
    if(!(await (await import("@/lib/sports-native-preview")).sportsNativePreview(actor.storeId))){
      if (!data.member && (data.status === "ATTENDED" || data.status === "NO_SHOW")) await refreshUnlessMusicRoster(actor.storeId);
      else refresh();
    }
    const rosterSnapshot=data.returnRoster&&!data.member?await measureMusicCheckout("attendance.rosterSnapshot",()=>readCommittedCourseRoster(actor.storeId,settledSessionId)):null;
    return { success: true as const,...(rosterSnapshot?{rosterSnapshot}:{}) };
  } catch (error) {
    return handleActionError(error);
  } finally {
    console.info("[course-attendance-perf]", {durationMs:Math.round(performance.now()-started),phases:timings});
  }
 });
}

export async function cancelCourseSession(input: unknown) {
  try {
    const { user, storeId } = await courseManager("booking.update");
    const data = z
      .object({ sessionId: id, expectedBookings: z.number().int().min(0) })
      .parse(input);
    await courseTransaction(storeId, async (tx) => {
      const session = await tx.courseSession.findFirst({
        where: { id: data.sessionId, storeId },
      });
      if (!session) throw new AppError("NOT_FOUND", "找不到課程");
      if (session.cancelledAt) return;
      const bookings = await tx.courseBooking.findMany({
        // A released makeup keeps its audit row, but no longer occupies this class.
        // Active makeup still requires the dedicated entitlement workflow below.
        where: { storeId, sessionId: session.id, status: {not: "CANCELLED"} },
      });
      if (bookings.some(isMusicOpeningMakeupBooking)) throw new AppError("VALIDATION", MUSIC_OPENING_MAKEUP_OPERATION_ISSUE);
      if (bookings.length !== data.expectedBookings)
        throw new AppError("CONFLICT", "預約人數已變動，請重新核對後取消");
      if (bookings.some((b) => b.status === "ATTENDED"))
        throw new AppError("CONFLICT", "此課已有完成點名紀錄，不能整堂取消");
      for (const b of bookings.filter((b) => b.status === "RESERVED"))
        await settleCourseBooking(
          tx,
          { storeId, userId: user.id, name: user.name ?? "店長" },
          b.id,
          "CANCELLED","DEDUCTED",{suppressNotice:true},
        );
      await recordCourseStoreNotice(tx,{storeId,userId:user.id,name:user.name??"門市人員"},{subjectKey:`session:${session.id}`,kind:"STOP",customerName:session.nameSnapshot,courseName:session.nameSnapshot,coachId:session.coachId,startsAt:session.startsAt,affectedCount:bookings.length,details:{students:bookings.map(b=>b.customerName)}});
      await tx.courseSession.update({
        where: { id: session.id },
        data: { cancelledAt: new Date() },
      });
      const series = await tx.courseScheduleSeries.findUnique({ where: { storeId_requestKey: { storeId, requestKey: session.requestKey } } });
      if (series && session.scheduleType === "FIXED") {
        const date = toLocalDateStr(session.startsAt);
        if (!series.excludedDates.includes(date))
          await tx.courseScheduleSeries.update({ where: { id: series.id }, data: { excludedDates: [...series.excludedDates, date] } });
      }
      await cancelCourseWaitlistForSession(tx, storeId, session.id);
    });
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

/** Stop only the already scheduled future lessons of this series. Current and past lessons remain intact. */
async function futureMusicCourseScope(
  tx: Parameters<Parameters<typeof courseTransaction>[1]>[0],
  storeId: string,
  sessionId: string,
  bookingId?: string,
  effectiveDate?: string,
) {
  const source = await tx.courseSession.findFirst({
    where: { id: sessionId, storeId, cancelledAt: null },
    select: { id: true, requestKey: true, templateId: true, startsAt: true },
  });
  if (!source) throw new AppError("NOT_FOUND", "找不到本店課程");
  const seriesRule = await tx.courseScheduleSeries.findUnique({ where: { storeId_requestKey: { storeId, requestKey: source.requestKey } }, select: { id: true, cancelledAt: true } });
  let customerId: string | undefined;
  let customerName: string | undefined;
  if (bookingId) {
    const learner = await tx.courseBooking.findFirst({
      where: { id: bookingId, storeId, sessionId, status: { not: "CANCELLED" } },
      select: { customerId: true, customerName: true },
    });
    if (!learner?.customerId) throw new AppError("NOT_FOUND", "找不到此堂學員");
    customerId = learner.customerId;
    customerName = learner.customerName;
  }
  const after = new Date(Math.max(Date.now(), source.startsAt.getTime()));
  const effectiveStart = effectiveDate ? dayRange(effectiveDate).start : undefined;
  const sessions = await tx.courseSession.findMany({
    where: { storeId, requestKey: source.requestKey, templateId: source.templateId,
      startsAt: { gte: effectiveStart && effectiveStart > after ? effectiveStart : after }, cancelledAt: null, releasedAt: null },
    select: { id: true, startsAt: true },
    orderBy: { startsAt: "asc" },
    take: 501,
  });
  if (sessions.length > 500) throw new AppError("VALIDATION", "後續課程過多，請分段處理");
  const allBookings = await tx.courseBooking.findMany({
    where: { storeId, sessionId: { in: sessions.map((item) => item.id) },
      ...(customerId ? { customerId } : {}), status: { not: "CANCELLED" } },
    select: { id: true, status: true, sessionId: true },
    orderBy: { id: "asc" },
  });
  if (allBookings.some((item) => item.status !== "RESERVED"))
    throw new AppError("CONFLICT", "後續課程已有完成點名，請先核對紀錄");
  return {
    sessionIds: sessions.map((item) => item.id),
    bookingIds: allBookings.map((item) => item.id),
    customerName,
    hasSeriesRule: Boolean(seriesRule && !seriesRule.cancelledAt),
    seriesStopDate: addTaiwanDuration(effectiveDate ?? toLocalDateStr(source.startsAt), -1, "DAY"),
  };
}

export async function previewFutureCourseStop(input: unknown) {
  try {
    const data = z.object({ sessionId: id, bookingId: id.optional(), effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Boolean(parseTaipeiDateTime(value, "00:00")), "日期無效").optional() }).parse(input);
    const { storeId } = await courseManager("booking.read");
    const scope = await courseTransaction(storeId, tx =>
      futureMusicCourseScope(tx, storeId, data.sessionId, data.bookingId, data.effectiveDate));
    return { success: true as const, data: scope };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function stopFutureCourseLessons(input: unknown) {
  try {
    const data = z.object({
      sessionId: id, bookingId: id.optional(), effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Boolean(parseTaipeiDateTime(value, "00:00")), "日期無效").optional(),
      expectedSessionIds: z.array(id).max(500),
      expectedBookingIds: z.array(id).max(1000),
    }).parse(input);
    const { user, storeId } = await courseManager("booking.update");
    const releasedSessionIds = await courseTransaction(storeId, async tx => {
      const scope = await futureMusicCourseScope(tx, storeId, data.sessionId, data.bookingId, data.effectiveDate);
      if (scope.sessionIds.join(",") !== data.expectedSessionIds.join(",") ||
          scope.bookingIds.join(",") !== data.expectedBookingIds.join(","))
        throw new AppError("CONFLICT", "後續課程或名單已變動，請重新開啟確認");
      if ((!scope.sessionIds.length && !scope.hasSeriesRule) || data.bookingId && !scope.bookingIds.length)
        throw new AppError("VALIDATION", "沒有可停止的後續已排課");
      const affectedSessionIds = new Set<string>();
      for (const bookingId of scope.bookingIds) {
        const settled = await settleCourseBooking(tx,
          { storeId, userId: user.id, name: user.name ?? "店長" },
          bookingId, "CANCELLED","DEDUCTED",{suppressNotice:!data.bookingId});
        affectedSessionIds.add(settled.sessionId);
      }
      if (!data.bookingId) {
        for(const sessionId of scope.sessionIds)await recordCourseStoreNotice(tx,{storeId,userId:user.id,name:user.name??"門市人員"},async()=>{
          const session=await tx.courseSession.findFirstOrThrow({where:{id:sessionId,storeId}});
          const students=await tx.courseBooking.findMany({where:{storeId,sessionId,id:{in:scope.bookingIds}},select:{customerName:true}});
          return {subjectKey:`session:${session.id}`,kind:"STOP",customerName:session.nameSnapshot,courseName:session.nameSnapshot,coachId:session.coachId,startsAt:session.startsAt,affectedCount:students.length,details:{students:students.map(b=>b.customerName)}};
        });
        await tx.courseSession.updateMany({
          where: { storeId, id: { in: scope.sessionIds }, cancelledAt: null },
          data: { cancelledAt: new Date() },
        });
        if (scope.hasSeriesRule) {
          await tx.courseScheduleSeries.updateMany({
            where: { storeId, requestKey: (await tx.courseSession.findFirstOrThrow({ where: { id: data.sessionId, storeId }, select: { requestKey: true } })).requestKey, cancelledAt: null },
            data: { untilDate: new Date(`${scope.seriesStopDate}T00:00:00.000Z`) },
          });
        }
        for (const sessionId of scope.sessionIds)
          await cancelCourseWaitlistForSession(tx, storeId, sessionId);
        return [];
      }
      if(data.bookingId){
        const learner=await tx.courseBooking.findFirstOrThrow({where:{id:data.bookingId,storeId},select:{customerId:true,session:{select:{requestKey:true,startsAt:true}}}});
        const rule=await tx.courseScheduleSeries.findUnique({where:{storeId_requestKey:{storeId,requestKey:learner.session.requestKey}}});
        if(rule){
          const snapshot=z.array(z.object({customerId:z.string(),cardId:z.string().nullable().optional(),stopDate:z.string().optional()})).parse(rule.learnerSnapshot);
          const stopDate=data.effectiveDate??toLocalDateStr(learner.session.startsAt);
          await tx.courseScheduleSeries.update({where:{id:rule.id},data:{learnerSnapshot:snapshot.map(row=>row.customerId===learner.customerId?{...row,stopDate}:row)}});
        }
      }
      return [...affectedSessionIds];
    });
    if (data.bookingId) scheduleCourseWaitlistPromotion(storeId, releasedSessionIds, {
      actorUserId: user.id,
      actorNameSnapshot: user.name,
    });
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function loadCourseSessionDetail(sessionId: string, rosterOnly = false, trialOnly = false) {
  try {
    const { user, storeId } = await measureMusicRead("detail.authorize",()=>courseManager("booking.read"));
    id.parse(sessionId);
    const { getCourseRoster, getCourseCards } =
      await import("@/server/queries/course-members");
    const { checkPermission } = await import("@/lib/permissions");
    const trialSettingsPromise=import("@/lib/shop-config").then(m=>m.getTrialSettings(storeId));
    // Roster balances and session policies are independent after authorization.
    // Await them together so either failure rejects this read; no cross-request cache.
    const [roster, {permissions, session, musicStore, waitlistSetting, nativeSports, waitlistRows, sportsRule, waitlistPolicy, compatibleTemplateIds, sharedCardState, teachingTemplates}] = await Promise.all([
      measureMusicRead("detail.roster",()=>getCourseRoster(storeId,sessionId)),
      (async()=>{
        const [permissions, session, musicStore, waitlistSetting, nativeSports, waitlistRows] = await measureMusicRead("detail.primary",()=>Promise.all([
          Promise.all((["wallet.read","booking.create","wallet.create","transaction.create","trial.create","trial.confirm","transaction.void","customer.read"] as const).map(p=>checkPermission(user.role,user.staffId,p))),
          readCourseSessionDetail(storeId,sessionId),
          isMusicCourseStoreFromEntitlements(prisma,storeId),
          coursePrisma.courseWaitlistSetting.findUnique({where:{storeId},select:{autoPromoteStopMinutes:true,enabled:true}}),
          sportsNativePreview(storeId),
          coursePrisma.courseWaitlistEntry.findMany({
            where: { storeId, sessionId, status: "WAITING" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, customerId: true, customerName: true, groupKey: true, createdAt: true },
          }),
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
        session: { templateId:session.templateId,compatibleTemplateIds:sportsRule?.enrollment==="ASSIGNED"?teachingTemplates:compatibleTemplateIds,startsAt: session.startsAt.toISOString(), pointCost: session.pointCost, teacherNote: session.teacherNote, teacherAttendance:session.teacherAttendance, teacherAttendanceReason:session.teacherAttendanceReason,teacherMakeupForSessionId:session.teacherMakeupForSessionId, waitlistEnabled: !!waitlistSetting?.enabled && waitlistPolicy.waitlistEnabled, waitlistStopMinutes: waitlistPolicy.waitlistStopMinutes ?? waitlistSetting?.autoPromoteStopMinutes ?? 240 },
        cards: cards.filter((card) => (!musicStore || card.unit === "SESSION")&&(!sportsRule||cardRights(card).eligible)).map((card) => ({
          ...card,
          entries: canReadCards ? card.entries : [],
        })),
      },
    };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function loadCourseRosterQuick(sessionId: string) {
  const startedAt = Date.now();
  let authMs = 0;
  let sessionMs = 0;
  let rosterMs = 0;
  try {
    const { storeId } = await courseManager("booking.read");
    authMs = Date.now() - startedAt;
    id.parse(sessionId);
    const session = await coursePrisma.courseSession.findFirst({where:{id:sessionId,storeId,cancelledAt:null},select:{teacherNote:true,teacherAttendance:true,teacherAttendanceReason:true,template:{select:{waitlistStopMinutes:true,waitlistEnabled:true,waitlistLimit:true}}}});
    sessionMs = Date.now() - startedAt - authMs;
    if (!session) throw new AppError("NOT_FOUND", "找不到本店課程");
    const { getCourseRoster } = await import("@/server/queries/course-members");
    const [roster, waitlistRows, waitlistSetting] = await Promise.all([
      getCourseRoster(storeId,sessionId),
      coursePrisma.courseWaitlistEntry.findMany({
        where:{storeId,sessionId,status:"WAITING"},
        orderBy:[{createdAt:"asc"},{id:"asc"}],
        select:{id:true,customerId:true,customerName:true,groupKey:true,createdAt:true},
      }),
      coursePrisma.courseWaitlistSetting.findUnique({where:{storeId},select:{autoPromoteStopMinutes:true}}),
    ]);
    rosterMs = Date.now() - startedAt - authMs - sessionMs;
    const groups=[...new Map(waitlistRows.map(item=>[item.groupKey,item.createdAt])).entries()].sort((a,b)=>a[1].getTime()-b[1].getTime()||a[0].localeCompare(b[0]));
    const waitlist=waitlistRows.map(row=>({id:row.id,customerId:row.customerId,customerName:row.customerName,groupKey:row.groupKey,position:groups.findIndex(([key])=>key===row.groupKey)+1,createdAt:row.createdAt.toISOString()}));
    console.info("[course-roster-read]", { outcome: "success", count: roster.length, waitlistCount: waitlist.length, authMs, sessionMs, rosterMs, totalMs: Date.now() - startedAt });
    return {success:true as const, data:{roster,waitlist,sharedCardState: await getCourseSharedCardState(storeId),teacherNote:session.teacherNote,teacherAttendance:session.teacherAttendance,teacherAttendanceReason:session.teacherAttendanceReason,waitlistStopMinutes:session.template.waitlistStopMinutes ?? waitlistSetting?.autoPromoteStopMinutes ?? 240}};
  } catch(error) {
    console.info("[course-roster-read]", { outcome: "error", authMs, sessionMs, rosterMs, totalMs: Date.now() - startedAt });
    return handleActionError(error);
  }
}

export async function saveCourseRosterNote(input: unknown) {
  try {
    const data=z.object({
      sessionId:id,
      bookingId:id.optional(),
      note:z.string().trim().max(1000),
      // Optional for the existing detail / teacher editor; inline saves compare
      // exactly what was displayed before changing this booking's note only.
      expectedNote:z.string().max(1000).optional(),
    }).parse(input);
    const {storeId}=await courseManager("booking.update");
    if(data.bookingId) {
      const where={id:data.bookingId,sessionId:data.sessionId,storeId,bookingKind:{not:"OPENING_MAKEUP"},musicOpeningMakeupEntitlementId:null,status:{not:"CANCELLED" as const}};
      const result=await coursePrisma.courseBooking.updateMany({
        where:{...where,...(data.expectedNote !== undefined ? {notes:data.expectedNote} : {})},
        data:{notes:data.note},
      });
      if(!result.count) {
        const current=await coursePrisma.courseBooking.findFirst({where,select:{notes:true}});
        if(!current)throw new AppError("NOT_FOUND","找不到本店學員預約");
        // A retry after a lost response can already have committed this value.
        if(current.notes !== data.note) return {success:false as const,error:"本次備註已被更新，請確認最新內容後再儲存",currentValue:current.notes};
      }
      // The roster patches this field locally. Route revalidation here would
      // remount unrelated editors and discard the current list position.
      if(data.expectedNote === undefined) refresh();
      return {success:true as const};
    } else {
      const result=await coursePrisma.courseSession.updateMany({where:{id:data.sessionId,storeId,cancelledAt:null,...(data.expectedNote!==undefined?{teacherNote:data.expectedNote}:{})},data:{teacherNote:data.note}});
      if(!result.count){const current=await coursePrisma.courseSession.findFirst({where:{id:data.sessionId,storeId,cancelledAt:null},select:{teacherNote:true}});if(!current)throw new AppError("NOT_FOUND","找不到本店課程");if(current.teacherNote!==data.note)return {success:false as const,error:"教師備註已由其他人更新，輸入已保留，請重新核對",currentValue:current.teacherNote};}
    }
    if(!(await (await import("@/lib/sports-native-preview")).sportsNativePreview(storeId)))refresh();return {success:true as const};
  } catch(error) {return handleActionError(error);}
}

export async function markCourseTeacherAttendance(input: unknown) {
  try {
    const data=z.object({sessionId:id,status:z.enum(["SCHEDULED","NO_SHOW","LEAVE"]),reason:z.string().trim().max(500).default(""),expectedStatus:z.enum(["SCHEDULED","NO_SHOW","LEAVE"]).optional()}).parse(input);
    const {user,storeId}=await courseManager("booking.update");
    await courseTransaction(storeId,async(tx)=>{
      const existing=await tx.courseSession.findFirst({where:{id:data.sessionId,storeId,cancelledAt:null},select:{id:true,teacherAttendance:true,teacherAttendanceReason:true,teacherAttendanceAt:true,teacherAttendanceById:true}});
      if(!existing)throw new AppError("NOT_FOUND","找不到本店課程");
      if (data.expectedStatus && data.expectedStatus !== existing.teacherAttendance) throw new AppError("CONFLICT", "教師狀態已更新，請重新確認");
      const openingMakeups=await tx.courseBooking.count({where:{storeId,sessionId:data.sessionId,OR:[{bookingKind:"OPENING_MAKEUP"},{musicOpeningMakeupEntitlementId:{not:null}}]}});
      if(openingMakeups)throw new AppError("VALIDATION",MUSIC_OPENING_MAKEUP_OPERATION_ISSUE);
      const result=await tx.courseSession.updateMany({where:{id:data.sessionId,storeId,teacherAttendance:existing.teacherAttendance},data:{teacherAttendance:data.status,teacherAttendanceReason:data.status==="SCHEDULED"?"":data.reason,teacherAttendanceAt:data.status==="SCHEDULED"?null:new Date(),teacherAttendanceById:data.status==="SCHEDULED"?null:user.id}});
      if(!result.count)throw new AppError("CONFLICT","老師狀態已更新，請重新整理");
      await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,summary,"targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${user.id},${user.name ?? "店長"},${storeId},'COURSE',${data.status === "SCHEDULED" ? "恢復授課" : data.status === "LEAVE" ? "教師請假，學員額度返還" : "教師曠課，學員額度返還"},'CourseSession',${data.sessionId},'COURSE_TEACHER_ATTENDANCE',${JSON.stringify({storeId,status:existing.teacherAttendance,reason:existing.teacherAttendanceReason,at:existing.teacherAttendanceAt,byId:existing.teacherAttendanceById})}::jsonb,${JSON.stringify({storeId,status:data.status,reason:data.status==="SCHEDULED"?"":data.reason,byId:user.id})}::jsonb,NOW())`;
      const actor = { storeId, userId: user.id, name: user.name ?? "店長" };
      if (data.status !== "SCHEDULED") await refundTeacherAbsentSession(tx, actor, data.sessionId);
      else if (existing.teacherAttendance !== "SCHEDULED") {
        const bookings = await tx.courseBooking.findMany({ where: { storeId, sessionId: data.sessionId, status: "CANCELLED", absenceKind: "TEACHER_ABSENT" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
        for (const booking of bookings) await correctCourseAttendance(tx, actor, booking.id, "RESERVED", "CANCELLED",{suppressNotice:true});
      }
      await recordCourseStoreNotice(tx,actor,async()=>{
        const session=await tx.courseSession.findFirstOrThrow({where:{id:data.sessionId,storeId}});
        const students=await tx.courseBooking.findMany({where:{storeId,sessionId:data.sessionId},select:{customerName:true}});
        return {subjectKey:`session:${session.id}`,kind:data.status==="SCHEDULED"?"RESTORE":"STOP",customerName:session.nameSnapshot,courseName:session.nameSnapshot,coachId:session.coachId,startsAt:session.startsAt,affectedCount:students.length,details:{students:students.map(b=>b.customerName)}};
      });
      await syncCourseRelease(tx, storeId, data.sessionId);
    });
    refresh();return {success:true as const};
  } catch(error){return handleActionError(error);}
}

export async function markCourseCoachAttendance(input: unknown) {
  try {
    const { user, storeId } = await courseAccount({ write: true });
    const { bookingId, status } = z.object({ bookingId: id, status: z.enum(["ATTENDED", "CHECKED_IN", "NO_SHOW"]).default("ATTENDED") }).parse(input);
    const saved = await courseTransaction(storeId, async (tx) => {
      const allowed = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT b.id FROM "CourseBooking" b
        JOIN "CourseSession" s ON s.id = b."sessionId" AND s."storeId" = b."storeId"
        JOIN "StaffMemberLink" l ON l."staffId" = s."coachId" AND l."storeId" = s."storeId"
        JOIN "Staff" st ON st.id = l."staffId" AND st."storeId" = l."storeId"
        WHERE b.id = ${bookingId} AND b."storeId" = ${storeId} AND l."userId" = ${user.id} AND l."revokedAt" IS NULL AND st.status::text = 'ACTIVE' AND st."courseCoachEnabled"=true`;
      if (!allowed.length)
        throw new AppError("FORBIDDEN", "只能點名自己被授權的課程");
      return settleCourseBooking(
        tx,
        { storeId, userId: user.id, name: user.name ?? "授課人員" },
        bookingId,
        status,
      );
    });
    scheduleCourseLowBalanceCheck(storeId,[bookingId]);
    refresh();
    return { success: true as const, attendanceUpdates: [{ id: saved.id, status: saved.status, checkedIn: !!saved.checkedInAt, updatedAt: saved.updatedAt.toISOString() }] };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function loadCourseCustomerBookings(customerId: string, offset = 0, range: {from?:string;to?:string;mode?:string} = {}) {
  try {
    const { storeId } = await courseManager("customer.read");
    await courseManager("booking.read");
    const customer = await prisma.customer.findFirst({ where: { id: id.parse(customerId), storeId, mergedIntoCustomerId: null }, select: { id: true } });
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
    const skip = z.number().int().min(0).max(1000000).parse(offset);
    const browse = courseBookingBrowse(range);
    const bookings = await coursePrisma.courseBooking.findMany({ where: { storeId, customerId, ...browse.where }, include: { session: { select: { startsAt: true, nameSnapshot: true,coachId:true } }, card: { select: { nameSnapshot: true, expiresAt: true, musicValidityDays:true, musicActivatedAt:true, musicOpeningStateRequired:true, unit: true, requestKey: true } } }, orderBy: [{ session: { startsAt: browse.order } }, {id:browse.order}], skip, take: 11 });
    const native=(await sportsNativePreview(storeId));
    const coaches=native?await prisma.staff.findMany({where:{storeId,id:{in:bookings.map(b=>b.session.coachId)}},select:{id:true,displayName:true}}):[];
    const nativeDebited = new Set((await Promise.all(bookings.filter(b=>b.absenceKind==="STUDENT_LEAVE").map(async b=>await nativeLeaveWasDebited(coursePrisma,storeId,b.id)?b.id:null))).filter(Boolean));
    return { success: true as const, hasMore: bookings.length > 10, data: bookings.slice(0,10).map((b) => ({ id: b.id, sessionId: b.sessionId, absenceKind: b.absenceKind, bookingKind: b.bookingKind, separateMakeup: !!b.card?.requestKey.startsWith("yjy-pilot-card:") || nativeDebited.has(b.id), coachName:coaches.find(c=>c.id===b.session.coachId)?.displayName,name:courseDisplayName(b.session.nameSnapshot), date: b.session.startsAt.toISOString(), status: b.status, checkedIn: !!b.checkedInAt, plan: b.card?.nameSnapshot ?? (native&&b.bookingKind!=="TRIAL" ? "點名時核對方案" : b.bookingKind === "OPENING_MAKEUP" ? "獨立補課權益" : "體驗（不使用方案）"), expiresAt: b.card?.expiresAt?.toISOString() ?? null, validityDays: !b.card?.musicOpeningStateRequired && !b.card?.musicActivatedAt ? b.card?.musicValidityDays ?? null : null, points: b.pointCost, unit: b.card?.unit ?? "TRIAL", notes: b.notes, operator: b.operatorName })) };
  } catch (e) { const failure=handleActionError(e);return {success:false as const,error:failure.success?"讀取失敗":failure.error}; }
}

export async function updateCourseRosterBatch(input: unknown) {
 return withCourseCheckoutRequest(async timings=>{
  const startedAt = Date.now();
  let authMs = 0;
  let lockWaitMs = 0;
  let validationMs = 0;
  let writeMs = 0;
  let transactionMs = 0;
  let target = "UNKNOWN";
  let count = 0;
  try {
    const data=z.object({sessionId:id,returnRoster:z.boolean().default(false),target:z.enum(["CHECKED_IN","ATTENDED","NO_SHOW","RESERVED"]),noShowChoice:z.enum(["DEDUCTED","DEDUCTED_WITH_MAKEUP"]).optional(),bookings:z.array(z.object({id,status:z.enum(["RESERVED","ATTENDED","NO_SHOW","CANCELLED"])})).min(1).max(200)}).parse(input);
    if(new Set(data.bookings.map(b=>b.id)).size!==data.bookings.length) throw new AppError("VALIDATION","學員不可重複");
    target = data.target;
    count = data.bookings.length;
    const {user,storeId}=await courseManager("booking.update");
    authMs = Date.now() - startedAt;
    // Start this independent lookup before the transaction so it does not add
    // another database round trip after attendance has already been saved.
    const musicLookup = isMusicCourseStoreFromEntitlements(prisma, storeId).catch(() => false);
    const transactionStartedAt = Date.now();
    await courseTransaction(storeId,async tx=>{
      const transactionWorkAt = Date.now();
      lockWaitMs = transactionWorkAt - transactionStartedAt;
      const session=await tx.courseSession.findFirst({where:{id:data.sessionId,storeId,cancelledAt:null}});
      if(!session)throw new AppError("NOT_FOUND","找不到可點名的本店課次");
      const count=await tx.courseBooking.count({where:{storeId,sessionId:data.sessionId,id:{in:data.bookings.map(b=>b.id)},bookingKind:{not:"OPENING_MAKEUP"},musicOpeningMakeupEntitlementId:null,...(data.target==="RESERVED"?{OR:[{status:{not:"CANCELLED"}},{status:"CANCELLED",absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}}]}:{status:data.target==="CHECKED_IN"?"RESERVED":{not:"CANCELLED"}})}});
      if(count!==data.bookings.length)throw new AppError("CONFLICT","名單或狀態已變更，請重新核對");
      validationMs = Date.now() - transactionWorkAt;
      const writeStartedAt = Date.now();
      const actor={storeId,userId:user.id,name:user.name??"店長"};
      for(const booking of data.bookings){
        if(data.target==="CHECKED_IN")await settleCourseBooking(tx,actor,booking.id,"CHECKED_IN");
        else if(data.target==="NO_SHOW"&&booking.status==="RESERVED")await settleCourseBooking(tx,actor,booking.id,"NO_SHOW",data.noShowChoice);
        else await correctCourseAttendance(tx,actor,booking.id,data.target,booking.status);
      }
      writeMs = Date.now() - writeStartedAt;
    }, async (auditResult, tx) => { for (const booking of data.bookings) {
      await enqueueOperationAudit({
        actorUserId: user.id, ...((await sportsNativePreview(storeId))?{actorNameSnapshot:user.name??"門市人員"}:{}), storeId, module: "COURSE", targetType: "CourseBooking",
        targetId: booking.id, action: data.target,
        summary: ({ CHECKED_IN: "課程報到", ATTENDED: "標記課程出席", NO_SHOW: "標記課程未到", RESERVED: "恢復待點名" } as const)[data.target],
      }, tx);
    } });
    transactionMs = Date.now() - transactionStartedAt;

    if(data.target!=="CHECKED_IN")scheduleCourseLowBalanceCheck(storeId,data.bookings.map(b=>b.id));
    const refreshStartedAt = Date.now();
    if (!(await musicLookup)) after(()=>refresh());
    const refreshMs = Date.now() - refreshStartedAt;
    console.info("[course-roster-batch]", { outcome: "success", target, count, authMs, lockWaitMs, validationMs, writeMs, transactionMs, refreshMs, phases:timings, totalMs: Date.now() - startedAt });
    const rosterSnapshot=data.returnRoster?await readCommittedCourseRoster(storeId,data.sessionId):null;
    return {success:true as const,...(rosterSnapshot?{rosterSnapshot}:{})};
  }catch(error){
    console.info("[course-roster-batch]", { outcome: "error", target, count, authMs, lockWaitMs, validationMs, writeMs, transactionMs, totalMs: Date.now() - startedAt });
    return handleActionError(error);
  }
 });
}

/** One transaction for the manager's day-wide leave/attendance list. */
export async function updateCourseDailyAttendanceBatch(input: unknown) {
  try {
    const data=z.object({
      target:z.enum(["RESERVED","ATTENDED","NO_SHOW"]),
      bookings:z.array(z.object({id,status:z.enum(["RESERVED","CANCELLED"]),sessionId:id})).min(1).max(200),
    }).parse(input);
    if(new Set(data.bookings.map(b=>b.id)).size!==data.bookings.length)throw new AppError("VALIDATION","學員不可重複");
    if(data.bookings.some(b=>data.target==="RESERVED" ? b.status!=="CANCELLED" : b.status!=="RESERVED"))throw new AppError("VALIDATION","請重新核對待處理名單");
    const {user,storeId}=await courseManager("booking.update");
    await courseTransaction(storeId,async tx=>{
      const sessionIds=[...new Set(data.bookings.map(b=>b.sessionId))];
      const sessions=await tx.courseSession.findMany({where:{id:{in:sessionIds},storeId,cancelledAt:null},select:{id:true,endsAt:true}});
      if(sessions.length!==sessionIds.length)throw new AppError("CONFLICT","課程已變更，請重新核對名單");
      const current=await tx.courseBooking.findMany({where:{storeId,id:{in:data.bookings.map(b=>b.id)}},select:{id:true,sessionId:true,status:true,absenceKind:true,bookingKind:true,musicOpeningMakeupEntitlementId:true}});
      if(current.some(isMusicOpeningMakeupBooking))throw new AppError("VALIDATION",MUSIC_OPENING_MAKEUP_OPERATION_ISSUE);
      if(current.length!==data.bookings.length || data.bookings.some(b=>{
        const found=current.find(item=>item.id===b.id);
        return !found || found.sessionId!==b.sessionId || found.status!==b.status || (b.status==="CANCELLED" && !["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(found.absenceKind??""));
      }))throw new AppError("CONFLICT","名單或狀態已變更，請重新核對");
      const actor={storeId,userId:user.id,name:user.name??"店長"};
      for(const booking of data.bookings){
        if(data.target==="NO_SHOW")await settleCourseBooking(tx,actor,booking.id,"NO_SHOW","DEDUCTED");
        else await correctCourseAttendance(tx,actor,booking.id,data.target,booking.status);
      }
    }, async (auditResult, tx) => { for (const booking of data.bookings) {
      await enqueueOperationAudit({
        actorUserId: user.id, ...((await sportsNativePreview(storeId))?{actorNameSnapshot:user.name??"門市人員"}:{}), storeId, module: "COURSE", targetType: "CourseBooking",
        targetId: booking.id, action: data.target,
        summary: ({ RESERVED: "恢復待點名", ATTENDED: "標記課程出席", NO_SHOW: "標記課程未到" } as const)[data.target],
      }, tx);
    } });

    scheduleCourseLowBalanceCheck(storeId,data.bookings.map(b=>b.id));
    refresh();return {success:true as const};
  }catch(error){return handleActionError(error);}
}

export async function saveCourseLeaveNote(input: unknown) {
  try {
    const data=z.object({bookingId:id,note:z.string().trim().max(1000)}).parse(input);
    const {user,storeId}=await courseManager("booking.update");
    await courseTransaction(storeId,async tx=>{
      const booking=await tx.courseBooking.findFirst({where:{id:data.bookingId,storeId,status:"CANCELLED",absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}},select:{id:true,notes:true,bookingKind:true,musicOpeningMakeupEntitlementId:true}});
      if(!booking)throw new AppError("CONFLICT","請假狀態已變更，請重新核對");
      if(isMusicOpeningMakeupBooking(booking))throw new AppError("VALIDATION",MUSIC_OPENING_MAKEUP_OPERATION_ISSUE);
      if(booking.notes===data.note)return;
      await tx.courseBooking.update({where:{id:booking.id},data:{notes:data.note}});
      await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","storeId",module,"targetType","targetId",action,summary,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${user.id},${storeId},'COURSE','CourseBooking',${booking.id},'COURSE_LEAVE_NOTE','修改請假備註',${JSON.stringify({note:booking.notes})}::jsonb,${JSON.stringify({note:data.note})}::jsonb,NOW())`;
    });
    refresh();return {success:true as const};
  }catch(error){return handleActionError(error);}
}

export async function loadMusicJoinOptions(planId:string) {
  try {
    id.parse(planId);
    const {storeId}=await courseManager("wallet.create");
    const plan=await coursePrisma.coursePointPlan.findFirst({where:{id:planId,storeId,isActive:true}});
    if(!plan || plan.musicTerms!==1 || plan.templateIds.length!==1)return {success:true as const,options:[]};
    const template=await coursePrisma.courseTemplate.findFirst({where:{id:plan.templateIds[0],storeId,classType:"GROUP"}});
    if(!template?.musicTermLessons)return {success:true as const,options:[]};
    const sessions=await coursePrisma.courseSession.findMany({where:{storeId,templateId:template.id,cancelledAt:null,startsAt:{gte:new Date()}},orderBy:{startsAt:"asc"},take:200,select:{id:true,startsAt:true,requestIndex:true,requestKey:true}});
    const size=template.musicTermLessons;
    const options=sessions.filter(first=>{
      const end=(Math.floor(first.requestIndex/size)+1)*size;
      return sessions.filter(s=>s.requestKey===first.requestKey&&s.requestIndex>=first.requestIndex&&s.requestIndex<end).length===end-first.requestIndex;
    }).map(first=>({id:first.id,startsAt:first.startsAt.toISOString(),remaining:size-first.requestIndex%size}));
    return {success:true as const,options};
  }catch(error){return handleActionError(error);}
}
