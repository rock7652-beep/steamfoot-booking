"use client";
import dynamic from 'next/dynamic';
const BeautyNativeStaffWorkspace=dynamic(()=>import('./native-staff-source').then(m=>m.BeautyNativeStaffWorkspace));
import {BeautyCourseCatalog} from './catalog-adapter';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {EditorKind} from './catalog-editor';
export function BeautyManagementList({tab,data,canEdit}:{tab:string;data:BeautyDashboardData;canEdit:boolean;onEdit:(kind:EditorKind,draft?:Record<string,unknown>)=>void}){
 return tab==='技師管理'?<BeautyNativeStaffWorkspace data={data} canManage={canEdit}/>:<BeautyCourseCatalog tab={tab} data={data} canEdit={canEdit}/>;
}
