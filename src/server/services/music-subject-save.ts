import "server-only";
import { saveSportsTeachingRule, readSportsTeachingRule } from "./sports-teaching-rule";
import { sportsNativePreview } from "@/lib/sports-native-preview";
import { createHash } from "node:crypto";
import { musicSubjectSaveInput } from "@/lib/music-subject-save";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { courseManager, courseTransaction } from "@/server/services/course-access";

export async function saveMusicSubjectWithReceipt(input: unknown) {
  const started = performance.now();
  let outcome = "error";
  try {
    const { id, expectedUpdatedAt, expectedStoreId, requestKey, sportsRule, nativeDefaults, ...values } = musicSubjectSaveInput.parse(input);
    const { storeId, user } = await courseManager(id ? "booking.update" : "booking.create");
    if (storeId !== expectedStoreId) throw new AppError("CONFLICT", "店舖已切換，請回原店確認後再操作。");
    if (!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:sportsNativePreview(storeId)?"business.fitness":"business.music",status:"ENABLED"},select:{storeId:true}}))
      throw new AppError("FORBIDDEN", "此功能僅適用音樂教室");
    if(nativeDefaults&&sportsNativePreview(storeId))throw new AppError("FORBIDDEN","音樂項目設定不可套用運動店");
    if (sportsRule) {
      if(id&&!expectedUpdatedAt)throw new AppError("CONFLICT","請重新開啟教學項目後再編輯規則");
      if (!sportsNativePreview(storeId)) throw new AppError("FORBIDDEN", "此設定僅適用運動店");
      await courseManager("staff.manage");
      await courseManager("teacher.compensation.manage");
      if (!["OWNER", "ADMIN"].includes(user.role)) throw new AppError("FORBIDDEN", "僅店長可設定項目計酬");
    }
    const receiptId = id ?? `subject_${createHash("sha256").update(JSON.stringify([storeId, user.id, requestKey])).digest("hex")}`;
    const row = await courseTransaction(storeId, async tx => {
      const applyRule = async (row: {id:string;name:string}, replay = false) => {
        if(nativeDefaults){
          const defaults={...nativeDefaults,description:values.description};
          const versions=await tx.courseTemplate.findMany({where:{storeId,musicSubjectId:row.id},select:{id:true,durationMinutes:true,visibility:true,description:true,precautions:true}});
          if(replay){if(!versions.length||versions.some(v=>Object.entries(defaults).some(([key,value])=>v[key as keyof typeof v]!==value)))throw new AppError("CONFLICT","項目設定已有更新，請重新開啟核對");}
          else if(versions.length)await tx.courseTemplate.updateMany({where:{storeId,musicSubjectId:row.id},data:defaults});
          else await tx.courseTemplate.create({data:{id:`subject_schedule_${row.id}`,storeId,musicSubjectId:row.id,name:`${row.name} · 排課`,...defaults,capacity:1,pointCost:1,musicScheduleMode:"APPOINTMENT"}});
        }
        if (sportsRule) {
          const {assertSportsProductionReady}=await import("./sports-production-readiness");await assertSportsProductionReady(tx,storeId);
          await saveSportsTeachingRule(tx, storeId, row, sportsRule, replay);
          if(!replay){const {enqueueOperationAudit}=await import("./operation-audit-outbox");await enqueueOperationAudit({actorUserId:user.id,storeId,module:"FITNESS",targetType:"MusicSubject",targetId:row.id,action:"SPORTS_ITEM_RULE",summary:"設定項目授課資格與開放選課規則"},tx,requestKey);}
        }
      };
      if (id) {
        const result = await tx.musicSubject.updateMany({where:{id,storeId,...(expectedUpdatedAt?{updatedAt:new Date(expectedUpdatedAt)}:{})},data:values});
        if (!result.count) {
          // A response may be lost after committing an edit. Confirm its current
          // state without rewriting a newer revision or claiming key ownership.
          const current = await tx.musicSubject.findFirst({where:{id,storeId}});
          if (current && Object.entries(values).every(([key,value]) => current[key as keyof typeof current] === value)) {
            await applyRule(current, true);
            return current;
          }
          throw new AppError("CONFLICT", "課程資料已有更新，請重新開啟後再編輯");
        }
        const saved = await tx.musicSubject.findFirstOrThrow({where:{id,storeId}});
        await applyRule(saved);
        return saved;
      }
      // The store transaction lock serializes same-key retries; the primary key
      // persists the receipt without a new table or migration.
      const previous = await tx.musicSubject.findFirst({where:{id:receiptId,storeId}});
      if (previous) {
        if (Object.entries(values).some(([key,value]) => previous[key as keyof typeof previous] !== value))
          throw new AppError("CONFLICT", "這次送出已處理且內容不同，請先核對清單。");
        await applyRule(previous, true);
        return previous;
      }
      const saved = await tx.musicSubject.create({data:{id:receiptId,storeId,...values}});
      await applyRule(saved);
      return saved;
    });
    const savedRule = sportsRule ? await courseTransaction(storeId, tx => readSportsTeachingRule(tx, storeId, row.id)) : undefined;
    outcome = "saved";
    return {storeId,data:{...(nativeDefaults??{}),...(savedRule ? {sportsRule:savedRule} : {}),id:row.id,name:row.name,category:row.category,description:row.description,isActive:row.isActive,updatedAt:row.updatedAt.toISOString()}};
  } finally {
    console.info("[MUSIC_SUBJECT_SAVE_PERF]", {outcome,totalMs:Math.round(performance.now()-started)});
  }
}
