import type {ReactNode} from 'react';
import type {CourseOperationWriter} from '@/components/admin/course-operation-switch';
export type CourseSettingsSource={
 confirmDiscard?:boolean;showLineAccount?:boolean;lineTitle?:string;lineSummary?:string;
 label:string;storeSavePath:string;selfBookingSavePath:string;bookingWindowSavePath:string;
 href:(original:string)=>string;
 operationSave:CourseOperationWriter;
 operationEvent:string;
 selfBookingTitle:string;selfCancelTitle:string;selfRescheduleTitle:string;
 rules:string;
 bookingSwitches:{key:string;title:string;enabled:boolean}[];
 notificationSwitches:{key:string;title:string;enabled:boolean}[];
 notificationLabels?:ReactNode;careSummary:string;
 subscription?:ReactNode;
 publicTrialHref?:string|null;
};
