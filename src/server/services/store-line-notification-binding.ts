import "server-only";
import { prisma } from "@/lib/db";

const invalidReply = "綁定連結無效，請回到店家後台點選「繼續綁定」。";
const occupiedReply = "這個 LINE 已是本店通知人員；如需調整姓名或身分，請先在後台解除原綁定。";

/** Caller must verify the physical LINE channel signature first. A unique
 * notification code selects a store only within that channel's allowed stores. */
export async function bindStoreLineNotificationRecipient(input: {
  storeIds: string[]; lineUserId: string; bindingCode: string;
}): Promise<{storeId?: string; reply: string}> {
  const storeIds = [...new Set(input.storeIds)];
  if (!storeIds.length || !input.lineUserId || !/^[A-F0-9]{10}$/i.test(input.bindingCode)) return {reply: invalidReply};
  const bindingCode = input.bindingCode.toUpperCase(), now = new Date();
  let matchedStoreId: string | undefined;
  try {
    return await prisma.$transaction(async tx => {
      const recipient = await tx.storeLineNotificationRecipient.findFirst({
        where: {storeId: {in: storeIds}, bindingCode},
        select: {id:true,storeId:true,displayName:true,bindingCodeExpiresAt:true,lineUserId:true,linkedAt:true},
      });
      if (!recipient) return {reply: invalidReply};
      matchedStoreId = recipient.storeId;
      if (recipient.lineUserId || recipient.linkedAt) return {storeId:recipient.storeId,reply:occupiedReply};
      if (!recipient.bindingCodeExpiresAt || recipient.bindingCodeExpiresAt <= now) return {
        storeId:recipient.storeId,reply:"這個綁定連結已超過 24 小時，請回到店家後台點選「繼續綁定」。",
      };
      const occupied = await tx.storeLineNotificationRecipient.findFirst({
        where:{storeId:recipient.storeId,lineUserId:input.lineUserId,NOT:{id:recipient.id}},select:{id:true},
      });
      if (occupied) return {storeId:recipient.storeId,reply:occupiedReply};
      const updated = await tx.storeLineNotificationRecipient.updateMany({
        where:{id:recipient.id,storeId:recipient.storeId,bindingCode,bindingCodeExpiresAt:{gt:now},lineUserId:null,linkedAt:null},
        data:{lineUserId:input.lineUserId,bindingCode:null,bindingCodeExpiresAt:null,linkedAt:now,isActive:true},
      });
      if (updated.count !== 1) return {storeId:recipient.storeId,reply:"綁定狀態已有更新，請重新整理店家後台確認。"};
      return {storeId:recipient.storeId,reply:`${recipient.displayName}，店長 LINE 通知已綁定成功 ✓\n\n請重新整理後台「提醒管理」，查看與設定接收的通知。`};
    });
  } catch (error) {
    // The unique store/user constraint also protects simultaneous code claims.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return {storeId:matchedStoreId,reply:occupiedReply};
    throw error;
  }
}
