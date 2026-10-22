"use client";
import {useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {CourseSettingsWorkspace} from '@/app/(dashboard)/dashboard/courses/settings-workspace';
import {SettingsListRow} from '@/components/settings';
import {FeatureEntry} from '@/components/feature-presentation';
import {FEATURES} from '@/lib/feature-flags';
import {BeautyCatalogEditor} from './catalog-editor';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {CourseSettingsSectionInput} from '@/lib/course-settings-sections';

/** Inject only Beauty rules and destinations into the original settings workspace. */
export function BeautySettingsWorkspace({data,slug,initial,canEdit,canPayment,readOnly=false,labels,subscription}:{data:BeautyDashboardData;slug:string;initial:Extract<CourseSettingsSectionInput,{section:'store'}>;canEdit:boolean;canPayment:boolean;readOnly?:boolean;labels:ReactNode;subscription:ReactNode}) {
 const router=useRouter();
 const [editor,setEditor]=useState<'booking'|'notifications'|null>(null);
 const href=(section:string,panel:string)=>`/dashboard/beauty?tab=設定&section=${section}&panel=${panel}`;
 return <>
  <CourseSettingsWorkspace storeId={data.storeId} {...initial} planLabel="" bankName="" bankCode="" bankAccountNumber="" bookingLeadMinutes={data.policy.leadMinutes} cancellationLeadMinutes={data.policy.cancelLeadMinutes} canEdit={canEdit} canPayment={canPayment} canStaff={false} canPlans={false} moduleContent={{label:'美業模組',storeSavePath:'/api/beauty/settings/store',sections:{
   booking:<><SettingsListRow title="營業與公休" summary="每週營業時間・特殊公休" href={href('booking','hours')}/><SettingsListRow title="預約與取消規則" summary={`自行預約${data.policy.selfBooking?'開啟':'關閉'}・開放 ${data.policy.bookableDays} 天・取消${data.policy.cancelDeduct?'扣次':'不扣次'}・未到${data.policy.noShowDeduct?'扣次':'不扣次'}`} onEdit={canEdit?()=>setEditor('booking'):undefined}/></>,
   payment:<>{canPayment&&<SettingsListRow title="銀行轉帳資訊" summary="銀行帳戶・轉帳資訊・付款聯繫" href={href('payment','payment')}/>}<SettingsListRow title="公開體驗表單" summary="每人每項服務限體驗一次" href={`/beauty-trial/${slug}`} action="查看"/></>,
   notifications:<>{labels}<SettingsListRow title="顧客關懷" summary="生日・未回店・方案與體驗追蹤" href="/dashboard/beauty?tab=顧客經營" action="查看"/>{canPayment&&!readOnly&&<><FeatureEntry feature={FEATURES.REFERRAL_SHARE} label="推薦分享"><SettingsListRow title="推薦分享" summary="推薦設定與分享內容" href="/dashboard/settings/referral-share"/></FeatureEntry><FeatureEntry feature={FEATURES.DIGITAL_BUTLER} label="數位管家"><SettingsListRow title="數位管家" summary="收集流程與顧客名單" href="/dashboard/settings/digital-butler"/></FeatureEntry></>}<SettingsListRow title="LINE 官方帳號" summary="帳號連結與登入設定" href={href('notifications','line')}/><SettingsListRow title="服務通知" summary={data.policy.notifications?'店家設定開啟':'關閉'} onEdit={canEdit?()=>setEditor('notifications'):undefined}/></>,
   subscription,
  }}}/>
  {editor&&<BeautyCatalogEditor kind="settings" data={data} settingsSection={editor} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);router.refresh();}}/>}
 </>;
}
