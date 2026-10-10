import "server-only";
import { createHash } from "node:crypto";
import { musicSubjectSaveInput } from "@/lib/music-subject-save";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { courseManager, courseTransaction } from "@/server/services/course-access";

export async function saveMusicSubjectWithReceipt(input: unknown) {
  const started = performance.now();
  let outcome = "error";
  try {
    const { id, expectedUpdatedAt, expectedStoreId, requestKey, ...values } = musicSubjectSaveInput.parse(input);
    const { storeId, user } = await courseManager(id ? "booking.update" : "booking.create");
    if (storeId !== expectedStoreId) throw new AppError("CONFLICT", "店舖已切換，請回原店確認後再操作。");
    if (!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}))
      throw new AppError("FORBIDDEN", "此功能僅適用音樂教室");
    const receiptId = id ?? `subject_${createHash("sha256").update(JSON.stringify([storeId, user.id, requestKey])).digest("hex")}`;
    const row = await courseTransaction(storeId, async tx => {
      if (id) {
        const result = await tx.musicSubject.updateMany({where:{id,storeId,...(expectedUpdatedAt?{updatedAt:new Date(expectedUpdatedAt)}:{})},data:values});
        if (!result.count) {
          // A response may be lost after committing an edit. Confirm its current
          // state without rewriting a newer revision or claiming key ownership.
          const current = await tx.musicSubject.findFirst({where:{id,storeId}});
          if (current && Object.entries(values).every(([key,value]) => current[key as keyof typeof current] === value))
            return current;
          throw new AppError("CONFLICT", "課程資料已有更新，請重新開啟後再編輯");
        }
        return tx.musicSubject.findFirstOrThrow({where:{id,storeId}});
      }
      // The store transaction lock serializes same-key retries; the primary key
      // persists the receipt without a new table or migration.
      const previous = await tx.musicSubject.findFirst({where:{id:receiptId,storeId}});
      if (previous) {
        if (Object.entries(values).some(([key,value]) => previous[key as keyof typeof previous] !== value))
          throw new AppError("CONFLICT", "這次送出已處理且內容不同，請先核對清單。");
        return previous;
      }
      return tx.musicSubject.create({data:{id:receiptId,storeId,...values}});
    });
    outcome = "saved";
    return {storeId,data:{id:row.id,name:row.name,category:row.category,description:row.description,isActive:row.isActive,updatedAt:row.updatedAt.toISOString()}};
  } finally {
    console.info("[MUSIC_SUBJECT_SAVE_PERF]", {outcome,totalMs:Math.round(performance.now()-started)});
  }
}
