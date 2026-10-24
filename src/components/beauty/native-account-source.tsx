"use client";
import {CourseStaffWorkspace,type CourseStaffSource,type CourseStaffPerson} from '@/app/(dashboard)/dashboard/courses/staff-workspace';
import {savedCourseStaff} from '@/lib/course-staff-save';
import {saveBeautyNativeAccount} from '@/server/actions/beauty-native-accounts';
import {saveBeautyDisplayOrder} from '@/server/actions/beauty-display-order';
import {activateStaff,deactivateStaff} from '@/server/actions/staff';
import type {CourseOrderSnapshot} from '@/lib/course-display-order';

type Props={storeId:string;staff:CourseStaffPerson[];canManage:boolean;canAssignRoles:boolean;maxStaff:number|null;editablePermissions:string[];displayOrder?:CourseOrderSnapshot;rolePresets:Record<string,string[]>;permissionGroups:{label:string;codes:{code:string;label:string}[]}[]};
/** Uses the exact same personnel workspace as sports/music. No alternate account editor. */
export function BeautyNativeAccountWorkspace({storeId,staff,canManage,canAssignRoles,maxStaff,editablePermissions,displayOrder,rolePresets,permissionGroups}:Props){
 const source:CourseStaffSource={confirmDiscard:false,autoRolePermissions:true,save:saveBeautyNativeAccount,savedSchema:savedCourseStaff,personLabel:'人員',editablePermissions,readTeaching:async()=>({success:false,error:'後台帳號不使用服務計酬'}),order:saveBeautyDisplayOrder,basicFields:()=>null,extraValues:()=>({}),assignmentHref:()=>'',customerChoices:[],workPermissions:[],savePermission:async()=>({success:false,error:'後台帳號不使用技師工作權限'}),status:{impact:async()=>({success:true,count:0}),apply:async({ids,active})=>{const succeeded:string[]=[],failed:{id:string;error:string}[]=[];for(const id of ids){const r=await(active?activateStaff(id):deactivateStaff(id));if(r.success)succeeded.push(id);else failed.push({id,error:r.error??'儲存失敗'});}return {success:true,succeeded,failed};}}};
 return <CourseStaffWorkspace source={source} staff={staff} sportsNative accountKind="manager" previewStoreId={storeId} displayOrder={displayOrder} maxStaff={maxStaff} templates={[]} customers={[]} canManage={canManage} canAssignRoles={canAssignRoles} canManageOwnIncome={false} feeEnabled={false} canEditFees={false} rolePresets={rolePresets} permissionGroups={permissionGroups}/>;
}
