import {after} from "next/server";
/** Invoke only after the booking transaction commits; delivery failures never undo attendance. */
export function scheduleCourseLowBalanceCheck(storeId:string,bookingIds:string[]) {
  try { after(async()=>{
    try {
      const {coursePrisma}=await import("@/lib/course-db");
      const bookings=await coursePrisma.courseBooking.findMany({where:{storeId,id:{in:bookingIds}},select:{cardId:true}});
      const cards=[...new Set(bookings.map(b=>b.cardId))];
      if(!cards.length) return;
      const {runCourseLowBalanceReminders}=await import("./course-low-balance-reminders");
      await runCourseLowBalanceReminders(new Date(),storeId,cards);
    } catch {console.error("[Course low balance] background check failed",{storeId});}
  }); } catch { console.error("[Course low balance] could not schedule background check",{storeId}); }
}
