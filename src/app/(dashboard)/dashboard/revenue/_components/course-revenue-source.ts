import type {ReactNode} from 'react';
import type {CourseTransactionDetail} from './course-transaction-actions';
import type {getCourseReceiptTotals} from '@/server/queries/course-home';
export type CourseRevenueRow=CourseTransactionDetail&{date:string;createdAt:Date;confirmedBy:string|null;storeCostSnapshot:number|null};
export type CourseRevenueSnapshot={rows:CourseRevenueRow[];count:number;page:number;pages:number;pendingCount:number;receiptTotals:Awaited<ReturnType<typeof getCourseReceiptTotals>>;staffRows:{id:string;userId:string|null;displayName:string;status:string;user:{role:string}|null}[];confirmationActors:string[]};
export type CourseRevenueSource={
 read:(input:{from:string;to:string;status?:string;staff?:string;page:number})=>Promise<CourseRevenueSnapshot>;
 summary:(from:string,to:string)=>Promise<{totals:CourseRevenueSnapshot['receiptTotals'];rows:{id:string;createdAt:string;customerName:string;planName:string;netAmount:number}[]}>;
 href:(original:string)=>string;
 actions:(row:CourseRevenueRow)=>ReactNode;queryFields?:Record<string,string>;
 statusLabels?:Record<string,string>;
 tabs?:ReactNode;fees?:ReactNode;
};
