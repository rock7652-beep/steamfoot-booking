"use server";
import {z} from "zod";
import {courseMember,courseTransaction} from "@/server/services/course-access";
import {handleActionError} from "@/lib/errors";
import {revalidatePath} from "next/cache";

/** Only the authenticated member can resume; shared-card access grants no preference access. */
export async function setCourseBalanceReminderPreference(stopped:boolean) {
  try {
    const value=z.boolean().parse(stopped),{storeId,customer}=await courseMember();
    await courseTransaction(storeId,async tx=>{
      const now=new Date();
      await tx.courseBalanceReminderPreference.upsert({where:{storeId_customerId:{storeId,customerId:customer.id}},
        create:{storeId,customerId:customer.id,stoppedAt:value?now:null,lastEventAt:now},
        update:{stoppedAt:value?now:null,lastEventAt:now}});
    });
    revalidatePath("/book/reminders");return {success:true as const};
  } catch(error) {return handleActionError(error);}
}
