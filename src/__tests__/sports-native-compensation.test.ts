import {describe,it,expect,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {calculateSportsTeacherFee} from "@/lib/sports-teacher-fee";
import {capturedTeacherFee} from "@/server/services/course-captured-teacher-fee";
import {sportsCompensation} from "@/lib/sports-staging-types";
import {sportsNativePreview} from "@/lib/sports-native-preview";
const seat={id:"b",customerName:"驗收",status:"ATTENDED",bookingKind:"STANDARD",absenceKind:null,originalUnitPrice:100,sportsCharge:200};
describe("sports native compensation",()=>{
 it("pays hourly once per session, proportionate to minutes",()=>{expect(calculateSportsTeacherFee({mode:"HOUR",value:600,durationMinutes:90},[seat,{...seat,id:"c"}]).amount).toBe(900);});
 it("uses booked point cost rather than one session for share",()=>{expect(calculateSportsTeacherFee({mode:"SHARE",value:60},[seat]).amount).toBe(120);});
 it("supports fractional plan unit prices without rounding before share",()=>{expect(calculateSportsTeacherFee({mode:"SHARE",value:60},[{...seat,sportsCharge:1000*2/30}]).amount).toBe(40);});
 it.each(["CANCELLED","STUDENT_LEAVE"])("does not pay cancelled or leave-only class %s",status=>{expect(calculateSportsTeacherFee({mode:"HOUR",value:600,durationMinutes:60},[{...seat,status}]).amount).toBe(0);});
 it("blocks unsettled attendance",()=>{expect(calculateSportsTeacherFee({mode:"HOUR",value:600,durationMinutes:60},[{...seat,status:"RESERVED"}]).amount).toBeNull();});
 it("blocks unknown time and unknown price",()=>{expect(calculateSportsTeacherFee({mode:"HOUR",value:600},[seat]).amount).toBeNull();expect(calculateSportsTeacherFee({mode:"SHARE",value:60},[{...seat,sportsCharge:null}]).amount).toBeNull();});
 it("dispatches only the immutable new version and leaves old hourly unsupported",()=>{expect(capturedTeacherFee({rule:{mode:"HOUR",value:600,durationMinutes:90,calculationVersion:3},revision:1},[seat]).amount).toBe(900);expect(capturedTeacherFee({rule:{mode:"HOUR",value:600},revision:1},[seat]).amount).toBeNull();});
 it("teacher leave/cancel still cancels the new fee",()=>{expect(capturedTeacherFee({rule:{mode:"HOUR",value:600,durationMinutes:90,calculationVersion:3},revision:1,teacherAttendance:"LEAVE"},[seat]).amount).toBe(0);});
 it("validates rates without excluding valid hundredths",()=>{expect(sportsCompensation.safeParse({mode:"SHARE",value:100.01}).success).toBe(false);expect(sportsCompensation.safeParse({mode:"HOUR",value:0.29}).success).toBe(true);});
 it("does not enable sports outside a verified production or isolated preview",async()=>{expect(await sportsNativePreview("store-lubymusic")).toBe(false);expect(await sportsNativePreview("sports-live-flow-store")).toBe(false);});
});
