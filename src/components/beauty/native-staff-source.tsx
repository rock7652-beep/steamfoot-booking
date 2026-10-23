"use client";
import {usePathname} from 'next/navigation';
import {toLocalDateStr} from '@/lib/date-utils';
import {CourseStaffWorkspace,type CourseStaffSource} from '@/app/(dashboard)/dashboard/courses/staff-workspace';
import {nativeBeautyStaff,nativeBeautyStaffReceipt,beautyWorkPermissions,savedBeautyTechnician} from '@/lib/beauty/native-staff';
import {saveBeautyNativeStaff,readBeautyNativeStaffTeaching,readBeautyNativeStaffAvailability,saveBeautyNativeStaffAvailability,saveBeautyNativeWorkPermission} from '@/server/actions/beauty-native-staff';
import {saveBeautyDisplayOrder} from '@/server/actions/beauty-display-order';
import {saveBeautyCatalog} from '@/server/actions/beauty';
import type {BeautyDashboardData} from '@/server/beauty/queries';

/** Only projections and authorized ports. The original coach workspace owns every interaction. */
export function BeautyNativeStaffWorkspace({data,canManage}:{data:BeautyDashboardData;canManage:boolean}){
 const prefix=(usePathname()??'').split('/dashboard')[0];
 const source:CourseStaffSource={previewEnabled:true,save:saveBeautyNativeStaff,savedSchema:nativeBeautyStaffReceipt,readTeaching:readBeautyNativeStaffTeaching,availability:{read:readBeautyNativeStaffAvailability,save:saveBeautyNativeStaffAvailability,reasonEnabled:false},order:saveBeautyDisplayOrder,personLabel:'技師',assignmentHref:item=>`${prefix}/dashboard/beauty?tab=班表&date=${toLocalDateStr(new Date(item.startsAt))}&bookingId=${encodeURIComponent(item.id)}`,customerChoices:data.customers.filter(c=>c.userId&&c.user?.status==='ACTIVE').map(c=>({id:c.id,name:c.name,phone:c.phone,lineName:c.lineName})),workPermissions:beautyWorkPermissions,savePermission:saveBeautyNativeWorkPermission,
 basicFields:person=><label>性別（必填）<select name="gender" aria-label="技師性別" required defaultValue={person?.gender??''} className="min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3 text-base"><option value="">請選擇</option><option value="FEMALE">女性</option><option value="MALE">男性</option></select></label>,extraValues:(p,f)=>({revision:p?.revision,gender:f.get('gender'),rateBases:Object.fromEntries([...f.entries()].filter(([key])=>key.startsWith('rateBase:')).map(([key,value])=>[key.slice(9),value]))}),
 feeFields:(person,id,mode)=>mode==='SHARE'?<label>拆帳基準<select name={'rateBase:'+id} defaultValue={(()=>{const t=data.techs.find(t=>t.id===person?.id);const rate=t?savedBeautyTechnician.parse(t).rates[id]:null;return rate?.mode==='PERCENT'?rate.base:'PAID';})()} className="min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3 text-base"><option value="PAID">實收金額</option><option value="LIST">原價</option></select></label>:null,
 status:{impact:async({ids})=>({success:true,count:data.technicianAssignments.filter(b=>ids.includes(b.technicianId)).length}),apply:async({ids,active})=>{const succeeded:string[]=[],failed:{id:string;error:string}[]=[];for(const id of ids){const t=data.techs.find(t=>t.id===id);const r=t?await saveBeautyCatalog('technician',{...t,active}):{success:false,error:'技師已更新，請重整'};if(r.success)succeeded.push(id);else failed.push({id,error:r.error??'儲存失敗'});}return {success:true,succeeded,failed};}},
 };
 return <CourseStaffWorkspace source={source} sportsNative accountKind="coach" displayOrder={data.displayOrders?.staff} previewStoreId={data.storeId} staff={data.techs.map(t=>nativeBeautyStaff(t,t.userId?data.customers.find(c=>c.userId===t.userId)?.id??'':'',data.technicianAssignments.filter(b=>b.technicianId===t.id)))} maxStaff={null} templates={data.services.map(s=>({id:s.id,name:s.name,isActive:s.active,currentTeaching:s.active}))} customers={data.customers.map(c=>({id:c.id,name:c.name}))} canManage={canManage} canManageOwnIncome={canManage} personalIncomeEnabled feeEnabled={data.access.feeAccess} canEditFees={canManage} permissionGroups={[]} />;
}
