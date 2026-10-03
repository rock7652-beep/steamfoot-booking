"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FEATURES } from "@/lib/feature-flags";
import { requireStoreFeature } from "@/lib/feature-gate";
import { handleActionError } from "@/lib/errors";
import { courseManager, courseMember, courseTransaction } from "@/server/services/course-access";
import {
  cancelMemberCourseWaitlist,
  getCourseWaitlistSettings,
  joinCourseWaitlist,
  promoteCourseWaitlistForSession,
} from "@/server/services/course-waitlist";
import { recordOperationAuditBestEffort } from "@/server/services/operation-audit";
import { notifyCourseWaitlistPromotions } from "@/server/services/course-waitlist-notifications";

const id = z.string().min(1).max(100);

function refresh() {
  revalidatePath("/dashboard/courses");
  revalidatePath("/book");
}

export async function saveCourseWaitlistSettings(input: unknown) {
  try {
    const data = z.object({
      enabled: z.boolean(),
      defaultLimit: z.number().int().min(1).max(100),
      autoPromoteStopMinutes: z.number().int().min(0).max(10080),
    }).parse(input);
    const { user, storeId } = await courseManager("business_hours.manage");
    await requireStoreFeature(storeId, FEATURES.COURSE_WAITLIST);
    await courseTransaction(storeId, async tx => {
      await tx.courseWaitlistSetting.upsert({
        where: { storeId },
        create: { storeId, ...data },
        update: { ...data, updatedAt: new Date() },
      });
    });
    await recordOperationAuditBestEffort({
      actorUserId: user.id,
      actorNameSnapshot: user.name,
      storeId,
      module: "COURSE",
      targetType: "CourseWaitlistSetting",
      targetId: storeId,
      action: data.enabled ? "ENABLE" : "DISABLE",
      summary: data.enabled ? "開啟課程候補" : "關閉課程候補",
      after: data,
    });
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function joinMemberCourseWaitlist(input: unknown) {
  try {
    const data = z.object({
      sessionId: id,
      cardId: id,
      customerIds: z.array(id).min(1).max(20),
      companionNames: z.array(z.string().trim().max(100)).max(2).optional(),
      requestKey: z.string().uuid(),
    }).parse(input);
    const { user, storeId, customer } = await courseMember({ write: true });
    const result = await joinCourseWaitlist(
      { userId: user.id, storeId, name: customer.name, customerId: customer.id },
      data,
    );
    await recordOperationAuditBestEffort({
      actorUserId: user.id,
      actorNameSnapshot: customer.name,
      storeId,
      module: "COURSE",
      targetType: "CourseWaitlist",
      targetId: result.rows[0]?.groupKey ?? data.sessionId,
      action: "JOIN",
      summary: `加入課程候補（${result.rows.length} 人）`,
      after: { sessionId: data.sessionId, position: result.position, count: result.rows.length },
    });
    refresh();
    return { success: true as const, data: { position: result.position, count: result.rows.length } };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function joinManagerCourseWaitlist(input: unknown) {
  try {
    const data=z.object({sessionId:id,cardId:id,customerIds:z.array(id).min(1).max(20),requestKey:z.string().uuid()}).parse(input);
    const {user,storeId}=await courseManager("booking.create");
    const result=await joinCourseWaitlist({userId:user.id,storeId,name:user.name??"店長"},data);
    await recordOperationAuditBestEffort({actorUserId:user.id,storeId,module:"COURSE",targetType:"CourseWaitlist",targetId:result.rows[0]?.groupKey??data.sessionId,action:"JOIN",summary:`店長加入候補（${result.rows.length} 人）`,after:{sessionId:data.sessionId,position:result.position,count:result.rows.length}});
    refresh();
    return {success:true as const,data:{position:result.position,count:result.rows.length}};
  }catch(error){return handleActionError(error);}
}

export async function cancelMemberCourseWaitlistAction(input: unknown) {
  try {
    const data = z.object({ sessionId: id }).parse(input);
    const { user, storeId, customer } = await courseMember({ write: true });
    const result = await cancelMemberCourseWaitlist(
      { userId: user.id, storeId, name: customer.name, customerId: customer.id },
      data,
    );
    await recordOperationAuditBestEffort({
      actorUserId: user.id,
      actorNameSnapshot: customer.name,
      storeId,
      module: "COURSE",
      targetType: "CourseWaitlist",
      targetId: data.sessionId,
      action: "CANCEL",
      summary: `取消課程候補（${result.count} 人）`,
      after: { sessionId: data.sessionId, count: result.count },
    });
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function promoteCourseWaitlistManually(input: unknown) {
  try {
    const data = z.object({ sessionId: id }).parse(input);
    const { user, storeId } = await courseManager("booking.update");
    await requireStoreFeature(storeId, FEATURES.COURSE_WAITLIST);
    const promoted = await courseTransaction(storeId, tx =>
      promoteCourseWaitlistForSession(tx, storeId, data.sessionId, { ignoreCutoff: true }),
    );
    if (promoted.length) {
      after(() => notifyCourseWaitlistPromotions(storeId, promoted));
      await recordOperationAuditBestEffort({
        actorUserId: user.id,
        actorNameSnapshot: user.name,
        storeId,
        module: "COURSE",
        targetType: "CourseWaitlist",
        targetId: data.sessionId,
        action: "MANUAL_PROMOTE",
        summary: `人工遞補候補（${promoted.length} 人）`,
        after: { bookingIds: promoted.map(item => item.bookingId) },
      });
    }
    refresh();
    return { success: true as const, data: { promoted: promoted.length } };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function loadCourseWaitlistSettings() {
  try {
    const { storeId } = await courseManager("booking.read");
    const settings = await getCourseWaitlistSettings(storeId);
    return { success: true as const, data: settings };
  } catch (error) {
    return handleActionError(error);
  }
}
