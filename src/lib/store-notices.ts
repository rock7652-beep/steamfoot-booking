import type {CourseNoticeItem} from "./course-store-notices";
export const STORE_NOTICE_LABELS={BOOKING:"預約",LEAVE:"請假",CANCEL:"取消",MOVE:"改期",STOP:"停課",RESTORE:"恢復",UPDATE:"修改預約",COMPLETE:"完成服務",NO_SHOW:"未到"} as const;
// Keep the course payload compatible while sharing presentation across modules.
export type StoreNoticeItem=Omit<CourseNoticeItem,"kind">&{kind:keyof typeof STORE_NOTICE_LABELS;targetId?:string};
export type StoreNoticeLoadResult={success:false;error:string}|{success:true;storeId:string;enabled:boolean;items:StoreNoticeItem[];count:number;canHandle:boolean;more:boolean};
export type StoreNoticeMarkResult={success:false;error:string}|{success:true;storeId:string;data:{id:string;revision:number;handledAt:string|null;handledByName:string|null}};
