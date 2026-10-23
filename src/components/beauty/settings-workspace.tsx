"use client";
import {useCallback,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {CourseSettingsWorkspace,CourseSettingsRow,CourseNotificationSettings} from '@/app/(dashboard)/dashboard/courses/settings-workspace';
import {CourseSettingsSectionEditor} from '@/app/(dashboard)/dashboard/courses/settings-section-editor';
import {CourseSelfBookingSettings} from '@/app/(dashboard)/dashboard/courses/course-self-booking-settings';
import {BookableUntilForm} from '@/app/(dashboard)/dashboard/settings/hours/bookable-until-form';
import {OperationSettingSwitch} from '@/components/admin/operation-setting-switch';
import {useSettingsPanelGuard} from '@/components/admin/settings-panel-context';
import {DashboardLink} from '@/components/dashboard-link';
import {saveBeautyOperationSwitch} from '@/server/actions/beauty-settings-patch';
import {toLocalDateStr} from '@/lib/date-utils';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {CourseSettingsSectionInput} from '@/lib/course-settings-sections';
const savePath='/api/beauty/settings/store';
const href=(section:string,panel:string)=>`/dashboard/beauty?tab=設定&section=${section}&panel=${panel}`;
function SharedSection({storeId,initial,onSaved}:{storeId:string;initial:CourseSettingsSectionInput;onSaved:(value:CourseSettingsSectionInput,syncWarning:boolean)=>void}){
 const [state,setState]=useState({dirty:false,pending:false});
 const onStatus=useCallback((_section:CourseSettingsSectionInput['section'],dirty:boolean,pending:boolean)=>setState(current=>current.dirty===dirty&&current.pending===pending?current:{dirty,pending}),[]);
 useSettingsPanelGuard(state.dirty,state.pending);
 return <CourseSettingsSectionEditor storeId={storeId} savePath={savePath} initial={initial} onStatus={onStatus} onSaved={onSaved}/>;
}
function BeautyBookingRules({data,canEdit}:{data:BeautyDashboardData;canEdit:boolean}){
 const [expanded,setExpanded]=useState<string|null>(null),[cutoff,setCutoff]=useState<Extract<CourseSettingsSectionInput,{section:'booking'}>>({section:'booking',bookingLeadMinutes:data.policy.leadMinutes,cancellationLeadMinutes:data.policy.cancelLeadMinutes});
 const switchRow=(key:'selfCancel'|'selfReschedule'|'cancelDeduct'|'noShowDeduct',title:string)=><OperationSettingSwitch key={key+':'+data.policy[key]} storeId={data.storeId} title={title} canEdit={canEdit} initialEnabled={data.policy[key]} save={input=>saveBeautyOperationSwitch({...input,key})}/>;
 return <>
  <CourseSelfBookingSettings title="允許顧客自行預約" description="取消與改期分別設定。" storeId={data.storeId} initialEnabled={data.policy.selfBooking} initialRevision={data.policy.revision} canEdit={canEdit} expanded={expanded==='booking'} onEdit={()=>setExpanded('booking')} onClose={()=>setExpanded(null)} savePath="/api/beauty/settings/self-booking"/>
  {switchRow('selfCancel','允許顧客自行取消')}{switchRow('selfReschedule','允許顧客自行改期')}
  <BookableUntilForm dayOptions={[7,14,21,30,60,90,180,365]} storeId={data.storeId} initialDate={data.policy.bookableUntilDate??null} initialDays={data.policy.bookableDays} today={toLocalDateStr()} canManage={canEdit} course direct savePath="/api/beauty/settings/booking-window"/>
  <CourseSettingsRow title="營業與公休" summary="每週營業時間・特殊公休" controls={<DashboardLink href={href('booking','hours')} className="inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3 text-sm text-primary-700">營業時間與公休</DashboardLink>}/>
  <CourseSettingsRow title="預約與取消截止" summary={`預約 ${cutoff.bookingLeadMinutes} 分鐘前・取消 ${cutoff.cancellationLeadMinutes} 分鐘前`} expanded={expanded==='cutoff'} onEdit={canEdit?()=>setExpanded('cutoff'):undefined}>{canEdit&&<SharedSection storeId={data.storeId} initial={cutoff} onSaved={(value,warning)=>{if(value.section==='booking')setCutoff(value);if(!warning)setExpanded(null);}}/>}</CourseSettingsRow>
  {switchRow('cancelDeduct','取消扣次')}{switchRow('noShowDeduct','未到扣次')}
 </>;
}
export function BeautySettingsWorkspace({data,slug,initial,bank={bankName:'',bankCode:'',bankAccountNumber:''},canEdit,canPayment,readOnly=false,labels,subscription}:{data:BeautyDashboardData;slug:string;initial:Extract<CourseSettingsSectionInput,{section:'store'}>;bank?:{bankName:string;bankCode:string;bankAccountNumber:string};canEdit:boolean;canPayment:boolean;readOnly?:boolean;labels:ReactNode;subscription:ReactNode}){
 const router=useRouter(),[paymentExpanded,setPaymentExpanded]=useState(false),[payment,setPayment]=useState<Extract<CourseSettingsSectionInput,{section:'payment'}>>({section:'payment',...bank});
 const core={storeId:data.storeId,...initial,planLabel:'',...bank,bookingLeadMinutes:data.policy.leadMinutes,cancellationLeadMinutes:data.policy.cancelLeadMinutes,canEdit:canEdit&&!readOnly,canPayment:canPayment&&!readOnly,canStaff:false,canPlans:false};
 return <CourseSettingsWorkspace {...core} moduleContent={{label:'美業模組',storeSavePath:savePath,sections:{
  booking:<BeautyBookingRules data={data} canEdit={core.canEdit}/>,
  payment:<><CourseSettingsRow title="銀行轉帳資訊" summary={payment.bankAccountNumber?`${payment.bankName}・末四碼 ${payment.bankAccountNumber.slice(-4)}`:'未設定'} expanded={paymentExpanded} onEdit={core.canPayment?()=>setPaymentExpanded(true):undefined}>{core.canPayment&&<SharedSection storeId={data.storeId} initial={payment} onSaved={(value,warning)=>{if(value.section==='payment')setPayment(value);if(!warning)setPaymentExpanded(false);router.refresh();}}/>}</CourseSettingsRow><CourseSettingsRow title="公開體驗表單" summary="每人每項服務限體驗一次" href={`/beauty-trial/${slug}`} action="查看"/></>,
  notifications:<><CourseNotificationSettings {...core} labels={labels} canCare={data.access.customerAccess} canReminders={true} canReferralShare={core.canPayment} canDigitalButler={core.canPayment} careSummary="生日・未回店・方案關懷" links={{care:'/dashboard/beauty?tab=顧客經營',reminders:href('notifications','reminders'),referral:'/dashboard/settings/referral-share',butler:'/dashboard/settings/digital-butler'}} backendControl={<OperationSettingSwitch storeId={data.storeId} title="後台異動通知" initialEnabled={data.policy.backendNoticesEnabled} canEdit={core.canEdit} eventName="beauty-notices-setting" save={input=>saveBeautyOperationSwitch({...input,key:'backendNoticesEnabled'})}/>}/><OperationSettingSwitch storeId={data.storeId} title="LINE 服務通知" initialEnabled={data.policy.notifications} canEdit={core.canEdit} save={input=>saveBeautyOperationSwitch({...input,key:'notifications'})}/><CourseSettingsRow title="LINE 官方帳號" summary="帳號連結與登入設定" href={href('notifications','line')}/></>,
  subscription,
 }}}/>;
}
