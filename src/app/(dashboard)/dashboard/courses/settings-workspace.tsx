"use client";
import { useState } from "react";
import { SettingsShell, SettingsNavSection, SettingsActionCard, SettingsSidePanel } from "@/components/settings";
import { InfoList } from "@/components/desktop";
import { RightSheet } from "@/components/admin/right-sheet";
import { CourseSettingsEditor } from "./settings-editor";
import { PaymentSettingsForm } from "../settings/payment/payment-form";
import { saveCoursePaymentSettings } from "@/server/actions/course-settings";
import type { UsageMetric } from "@/server/queries/usage";

type Props={
  storeId:string; name:string; planLabel:string; address:string;mapUrl:string;lineOfficialUrl:string;
  bankName:string;bankCode:string;bankAccountNumber:string;bookingLeadMinutes:number;cancellationLeadMinutes:number;
  canEdit:boolean;canPayment:boolean;canStaff:boolean;canPlans:boolean;
  canHours?: boolean;
  canReminders?: boolean;
  usageMetrics?: UsageMetric[];
};
const clockIcon="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z";
export function CourseSettingsWorkspace(props:Props) {
  const [panel,setPanel]=useState<"store"|"payment"|null>(null);
  const {name,storeId,canEdit,canPayment,canStaff,canPlans}=props;
  const nav=[{label:"店家與預約規則",href:"#course-store-settings",onSelect:()=>setPanel("store")}];
  if(canPayment) nav.push({label:"付款設定",href:"#course-payment-settings",onSelect:()=>setPanel("payment")});
  return <>
    <SettingsShell nav={<><SettingsNavSection title="店家營運" items={nav}/><SettingsNavSection title="課程與人員" items={[
      {label:"課表排程",href:"/dashboard/courses"},
      {label:"課程設定",href:"/dashboard/courses?view=catalog"},
      {label:"教室管理",href:"/dashboard/courses?view=rooms"},
      ...(canStaff?[{label:"人員與權限",href:"/dashboard/staff"}]:[]),
      ...(canPlans?[{label:"點數／堂數方案",href:"/dashboard/courses?view=plans"}]:[]),
    ]}/></>} side={<SettingsSidePanel quickActions={[
      {label:"課表與排課",href:"/dashboard/courses"},
      ...(canPlans?[{label:"方案管理",href:"/dashboard/courses?view=plans"}]:[]),
    ]} systemInfo={[{label:"店家",value:name},{label:"店家方案",value:props.planLabel},{label:"營運模組",value:"課程"}]}/> }>
      <SettingsActionCard title="店家與預約規則" description="店家資訊、會員預約與取消截止時間" iconPath={clockIcon} primaryHref="#course-store-settings" primaryLabel={canEdit?"編輯設定":"查看設定"} onPrimaryAction={()=>setPanel("store")} summary={<InfoList density="compact" items={[
        {label:"店家地址",value:props.address||"尚未填寫"},
        {label:"預約截止",value:props.bookingLeadMinutes?`上課前 ${props.bookingLeadMinutes} 分鐘`:"上課開始前"},
        {label:"自行取消截止",value:props.cancellationLeadMinutes?`上課前 ${props.cancellationLeadMinutes} 分鐘`:"上課開始前"},
      ]}/>}/>
      {canPayment&&<SettingsActionCard title="付款設定" description="沿用付款資訊表單與即時前台預覽" iconPath="M2.25 8.25h19.5M6 15h6" primaryHref="#course-payment-settings" primaryLabel="編輯付款設定" onPrimaryAction={()=>setPanel("payment")} summary={<InfoList density="compact" items={[
        {label:"銀行",value:props.bankName||"尚未填寫"},
        {label:"收款帳號",value:props.bankAccountNumber?`已設定 · 末四碼 ${props.bankAccountNumber.slice(-4)}`:"尚未填寫"},
        {label:"付款聯繫",value:props.lineOfficialUrl?"已設定 LINE 連結":"尚未填寫"},
      ]}/>}/>} 
      <SettingsActionCard title="課程與教室" description="課程預設值、容量與排課；修改預設值不回寫已排課程" iconPath={clockIcon} primaryHref="/dashboard/courses?view=catalog" primaryLabel="課程設定" secondaryHref="/dashboard/courses?view=rooms" secondaryLabel="教室管理"/>
      {props.canHours && <SettingsActionCard title="營業與公休" description="月曆、每週多段營業、特殊休假與後續週次；與已排課程衝突時整批阻擋" iconPath={clockIcon} primaryHref="/dashboard/courses/hours" primaryLabel="管理營業時間"/>}
      {props.canReminders && <SettingsActionCard title="提醒管理" description="課程上課提醒、通知內容與發送紀錄" iconPath={clockIcon} primaryHref="/dashboard/courses/reminders" primaryLabel="管理提醒"/>}
      {canStaff&&<SettingsActionCard title="人員與權限" description="店長後台權限、教練授課身分與顧客連結" iconPath="M18 20v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2m11-13a4 4 0 11-8 0 4 4 0 018 0z" primaryHref="/dashboard/staff" primaryLabel="管理人員"/>}
      {canPlans&&<SettingsActionCard title="課程方案" description="點數／堂數、期限、適用課程、共卡與上下架" iconPath="M2.25 8.25h19.5M6 15h6" primaryHref="/dashboard/courses?view=plans" primaryLabel="管理方案"/>}
      {props.usageMetrics && <section className="rounded-xl border border-earth-200 bg-white p-5" aria-labelledby="course-store-usage-title">
        <h2 id="course-store-usage-title" className="font-semibold text-primary-900">店家方案與用量 · {props.planLabel}</h2>
        <p className="mt-1 mb-4 text-sm text-earth-600">本月預約依台灣時間的建立日期計算，與課程預約額度檢查一致；取消仍計入已建立筆數。</p>
        <InfoList density="compact" items={props.usageMetrics.map(metric=>({label:metric.label,value:`${metric.current.toLocaleString("zh-TW")} / ${metric.limit===null?"不限":metric.limit.toLocaleString("zh-TW")}`}))}/>
      </section>}
    </SettingsShell>
    {panel && <RightSheet open onClose={()=>setPanel(null)} width={600} labelledById="course-settings-panel-title">
      <header className="flex shrink-0 items-center justify-between border-b border-earth-200 p-4"><h2 id="course-settings-panel-title" className="font-semibold text-primary-900">{panel==="payment"?"付款設定":"店家與預約規則"}</h2><button type="button" onClick={()=>setPanel(null)} className="min-h-11 rounded border px-3">關閉</button></header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {panel==="store"&&<CourseSettingsEditor name={name} address={props.address} mapUrl={props.mapUrl} lineOfficialUrl={props.lineOfficialUrl} bookingLeadMinutes={props.bookingLeadMinutes} cancellationLeadMinutes={props.cancellationLeadMinutes} canEdit={canEdit}/>}
        {panel==="payment"&&canPayment&&<PaymentSettingsForm key={storeId} storeId={storeId} initial={{bankName:props.bankName,bankCode:props.bankCode,bankAccountNumber:props.bankAccountNumber,lineOfficialUrl:props.lineOfficialUrl}} compact saveAction={saveCoursePaymentSettings}/>}
      </div>
    </RightSheet>}
  </>;
}
