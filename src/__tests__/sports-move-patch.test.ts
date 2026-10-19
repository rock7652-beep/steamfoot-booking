import {expect,it} from "vitest";
import {applySportsMovePatches,type SportsMovePatch} from "@/lib/sports-move-patch";
it("applies only committed location fields and preserves booking and fixed-series identity",()=>{
 const bookings=[{id:"learner",status:"RESERVED"}],rows=[{id:"s",startsAt:"old",isFixed:true,bookings,previewFaded:undefined},{id:"other",startsAt:"unchanged",isFixed:false,bookings:[],previewFaded:undefined}];
 const patch:SportsMovePatch={id:"s",startsAt:"new",endsAt:"end",roomId:"room",coachId:"coach",rescheduledFromStartsAt:"original",rescheduledFromEndsAt:"originalEnd",rescheduledFromRoomId:"oldRoom",rescheduledFromCoachId:"oldCoach",rescheduleKind:"SINGLE",rescheduledAt:"at",releasedAt:null};
 const updated=applySportsMovePatches(rows,[patch]);expect(updated[0]).toMatchObject({startsAt:"new",rescheduledFromStartsAt:"original",isFixed:true});expect(updated[0].bookings).toBe(bookings);expect(updated[1]).toBe(rows[1]);expect(rows[0].startsAt).toBe("old");
});
it("an unsuccessful or unknown write without patches leaves the displayed course intact",()=>{const row={id:"s",startsAt:"original"};expect(applySportsMovePatches([row],[])[0]).toBe(row);});
