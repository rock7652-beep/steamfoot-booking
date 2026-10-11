export const COURSE_NOTICE_LABELS = {BOOKING:"預約",LEAVE:"請假",CANCEL:"取消",MOVE:"改期",STOP:"停課",RESTORE:"恢復上課"} as const;
export type CourseNoticeKind=keyof typeof COURSE_NOTICE_LABELS;
export type CourseNoticeItem={
 id:string;kind:CourseNoticeKind;customerName:string;courseName:string;coachName:string;previousCoachName:string|null;
 startsAt:string;previousStartsAt:string|null;affectedCount:number;details:unknown;
 handledAt:string|null;handledByName:string|null;revision:number;createdAt:string;updatedAt:string;canViewCourse?:boolean;
};
export function courseNoticeNeedsFollowup(kind:CourseNoticeKind,member:boolean) {
 return kind!=="BOOKING" && (member || kind==="LEAVE" || kind==="STOP" || kind==="MOVE");
}
