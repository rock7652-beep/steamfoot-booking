// Real calendar and shared roster components; synthetic actions only.
import {useState} from "react";
import {CourseScheduleBoard} from "../../src/app/(dashboard)/dashboard/courses/course-schedule-board";
import {CourseRoster} from "../../src/app/(dashboard)/dashboard/courses/roster";
import {RightSheet} from "../../src/components/admin/right-sheet";

const date="2099-10-01";
const booking={id:"booking",customerId:"a",customerName:"小安",bookingKind:"CARD",status:"RESERVED",checkedInAt:null};
const moved={id:"moved",templateId:"teaching:piano",nameSnapshot:"鋼琴",startsAt:`${date}T03:00:00Z`,endsAt:`${date}T04:00:00Z`,roomId:"other-room",coachId:"teacher",capacity:1,pointCost:1,bookings:[booking],scheduleType:"FIXED" as const,isFixed:true,rescheduleKind:"SINGLE",rescheduledFromStartsAt:`${date}T02:00:00Z`,rescheduledFromEndsAt:`${date}T03:00:00Z`,rescheduledFromRoomId:"room",rescheduledFromCoachId:"teacher",rescheduleShadowHidden:false};
export function MusicBoardFixture(){
 const [replaced,setReplaced]=useState(false),[cancelled,setCancelled]=useState(false),[dialog,setDialog]=useState(false);
 const next={...moved,id:"new",startsAt:`${date}T02:00:00Z`,endsAt:`${date}T02:30:00Z`,roomId:"room",coachId:"other",scheduleType:"SINGLE" as const,isFixed:false,rescheduledFromStartsAt:null,rescheduledFromEndsAt:null,rescheduledFromRoomId:null,rescheduledFromCoachId:null};
 const sessions=[{...moved,rescheduleShadowHidden:replaced},...(replaced&&!cancelled?[next]:[])];
 return <main className="p-3"><div className="flex flex-wrap gap-3"><button className="min-h-11 rounded border px-3" onClick={()=>setReplaced(true)}>在原位排半堂</button><button className="min-h-11 rounded border px-3" onClick={()=>setCancelled(true)}>取消新課</button></div><CourseScheduleBoard businessProfile="MUSIC" mode="day" selectedDate={date} today={date} sessions={sessions} rooms={[{id:"room",name:"01",isActive:true},{id:"other-room",name:"02",isActive:true}]} coaches={[{id:"teacher",displayName:"王老師",status:"ACTIVE",courseCoachEnabled:true},{id:"other",displayName:"林老師",status:"ACTIVE",courseCoachEnabled:true}]} templates={[]} storePeriods={[{openTime:"09:00",closeTime:"19:00"}]} staffAvailability={[]} staffAvailabilityExceptions={[]} canCreate onOpenEmpty={value=>{Object.assign(globalThis,{__qaEmpty:value});}} onOpenSession={()=>setDialog(true)} onSelectDate={()=>{}}/>
 {dialog&&<RightSheet presentation="centered" width={1200} maxHeight={900} open onClose={()=>setDialog(false)} labelledById="qa-roster-title"><header className="flex items-center justify-between border-b p-3"><h2 id="qa-roster-title">預約清單</h2><button className="min-h-11 px-3" onClick={()=>setDialog(false)}>關閉</button></header><div className="flex min-h-0 flex-1 overflow-hidden p-3"><CourseRoster sessionId="moved" courseName="鋼琴" teacherName="王老師" capacity={2} canCreate={false} canEdit={false} musicLayout/></div></RightSheet>}
 </main>;
}
