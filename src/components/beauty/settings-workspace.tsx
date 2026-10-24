"use client";
import type {ReactNode} from 'react';
import {CourseSettingsWorkspace} from '@/app/(dashboard)/dashboard/courses/settings-workspace';
import {courseSettingsPanelHref} from '@/lib/course-settings-panels';
import {saveBeautyOperationSwitch} from '@/server/actions/beauty-settings-patch';
import {toLocalDateStr} from '@/lib/date-utils';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {CourseSettingsSectionInput} from '@/lib/course-settings-sections';

function beautySettingsHref(original:string){
 if(original==='/dashboard/growth')return '/dashboard/beauty?tab=顧客經營';
 const mapped=courseSettingsPanelHref(original);
 if(!mapped.startsWith('/dashboard/courses?'))return mapped;
 const params=new URLSearchParams(mapped.split('?')[1]);params.delete('view');params.set('tab','設定');return `/dashboard/beauty?${params}`;
}
export function BeautySettingsWorkspace({data,slug,initial,bank={bankName:'',bankCode:'',bankAccountNumber:''},canEdit,canPayment,readOnly=false,labels,subscription}:{data:BeautyDashboardData;slug:string;initial:Extract<CourseSettingsSectionInput,{section:'store'}>;bank?:{bankName:string;bankCode:string;bankAccountNumber:string};canEdit:boolean;canPayment:boolean;readOnly?:boolean;labels:ReactNode;subscription:ReactNode}){
 return <CourseSettingsWorkspace storeId={data.storeId} {...initial} {...bank} planLabel="" today={toLocalDateStr()} canEdit={canEdit&&!readOnly} canPayment={canPayment&&!readOnly} canStaff={false} canPlans={false} canHours={data.access.settingsAccess} canCare={data.access.customerAccess} canReminders={data.access.settingsAccess} canReferralShare={canPayment} canDigitalButler={canPayment} bookingLeadMinutes={data.policy.leadMinutes} cancellationLeadMinutes={data.policy.cancelLeadMinutes} selfBookingEnabled={data.policy.selfBooking} selfBookingRevision={data.policy.revision} selfLeaveEnabled={data.policy.selfCancel} selfRescheduleEnabled={data.policy.selfReschedule} backendNoticesEnabled={data.policy.backendNoticesEnabled} bookableUntilDate={data.policy.bookableUntilDate} bookingWindowDays={data.policy.bookableDays} source={{confirmDiscard:false,label:'美業模組',storeSavePath:'/api/beauty/settings/store',selfBookingSavePath:'/api/beauty/settings/self-booking',bookingWindowSavePath:'/api/beauty/settings/booking-window',href:beautySettingsHref,operationSave:async input=>{const {key,...value}=input as {key:string;storeId:string;enabled:boolean;previous:boolean};return saveBeautyOperationSwitch({...value,key:key==='selfLeaveEnabled'?'selfCancel':key==='selfRescheduleEnabled'?'selfReschedule':key});},operationEvent:'beauty-notices-setting',selfBookingTitle:'允許顧客自行預約',selfCancelTitle:'允許顧客自行取消',selfRescheduleTitle:'允許顧客自行改期',rules:'預約先保留次數，服務完成才扣次；取消與未到依店家設定處理。各筆預約保留建立當時的規則。',bookingSwitches:[{key:'cancelDeduct',title:'取消扣次',enabled:data.policy.cancelDeduct},{key:'noShowDeduct',title:'未到扣次',enabled:data.policy.noShowDeduct}],notificationSwitches:[{key:'notifications',title:'LINE 服務通知',enabled:data.policy.notifications}],notificationLabels:labels,careSummary:'生日・未回店・方案關懷',subscription,publicTrialHref:`/beauty-trial/${slug}`}}/>;
}
