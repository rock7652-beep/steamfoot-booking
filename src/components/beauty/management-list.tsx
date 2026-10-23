"use client";
import {useState} from 'react';
import {BeautyCourseCatalog} from './catalog-adapter';
import {useRetainedState,retainedString,retainedPage} from '@/components/operations/operation-scope';
import {RosterToolbar,RosterMoreMenu} from '@/components/admin/roster-primitives';
import {CourseStaffList} from '@/app/(dashboard)/dashboard/courses/staff-list';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {EditorKind} from './catalog-editor';
export function BeautyManagementList({tab,data,canEdit,onEdit}:{tab:string;data:BeautyDashboardData;canEdit:boolean;onEdit:(kind:EditorKind,draft?:Record<string,unknown>)=>void}){
 if(tab!=='技師管理')return <BeautyCourseCatalog tab={tab} data={data} canEdit={canEdit}/>;
 return <BeautyTechnicianList data={data} canEdit={canEdit} onEdit={onEdit}/>;
}
function BeautyTechnicianList({data,canEdit,onEdit}:{data:BeautyDashboardData;canEdit:boolean;onEdit:(kind:EditorKind,draft?:Record<string,unknown>)=>void}){
 const [search,setSearch]=useRetainedState('beauty:technician:search','',retainedString),[status,setStatus]=useRetainedState('beauty:technician:status','all',retainedString),[page,setPage]=useRetainedState('beauty:technician:page',0,retainedPage),[sort,setSort]=useRetainedState('beauty:technician:sort','name',retainedString);
 const [showInactive,setShowInactive]=useState(false);
 const query=search.trim().toLocaleLowerCase();
 const rows=data.techs.filter(r=>`${r.name} ${r.phone??''} ${r.contactEmail??''}`.toLocaleLowerCase().includes(query)&&(status==='all'||r.active===(status==='active'))).sort((a,b)=>Number(b.active)-Number(a.active)||(sort==='reverse'?-1:1)*a.name.localeCompare(b.name,'zh-TW'));
 const activeRows=rows.filter(r=>r.active),inactiveRows=rows.filter(r=>!r.active),forced=status==='inactive'||!!query,expanded=forced||showInactive;
 const pages=Math.max(1,Math.ceil(activeRows.length/20)),current=Math.min(page,pages-1),visible=[...activeRows.slice(current*20,current*20+20),...(expanded?inactiveRows:[])];
 return <section className="space-y-2"><RosterToolbar label="技師搜尋與篩選"><input className="min-h-11 min-w-48 rounded-lg border border-earth-200 bg-white px-3 text-sm" aria-label="搜尋技師管理" placeholder="搜尋姓名、電話或 Email" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/><select aria-label="狀態篩選" value={status} className="min-h-11 rounded-lg border border-earth-200 bg-white px-3 text-sm" onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">全部狀態</option><option value="active">啟用中</option><option value="inactive">已停用</option></select><select aria-label="清單排序" value={sort} className="min-h-11 rounded-lg border border-earth-200 bg-white px-3 text-sm" onChange={e=>setSort(e.target.value)}><option value="name">名稱順序</option><option value="reverse">名稱倒序</option></select>{(query||status!=='all')&&<button className="min-h-11 px-3 text-sm" onClick={()=>{setSearch('');setStatus('all');setShowInactive(false);setPage(0);}}>清除篩選</button>}<span className="text-sm text-earth-500">共 {rows.length} 位</span>{canEdit&&<button className="ml-auto min-h-11 rounded-lg bg-primary-700 px-3 text-sm text-white" onClick={()=>onEdit('technician')}>＋新增技師</button>}</RosterToolbar>
 <CourseStaffList inactiveCount={inactiveRows.length} inactiveForced={forced} inactiveExpanded={expanded} onToggleInactive={()=>setShowInactive(v=>!v)} rows={visible.map(r=>({id:r.id,name:r.name,phone:r.phone??null,email:r.contactEmail??null,active:r.active,onOpen:()=>onEdit('technician',r),identity:<>{r.gender==='FEMALE'?'女性技師':'男性技師'}<span className="text-earth-500">可服務 {r.serviceIds?.length??0} 項</span></>,notifications:<span>{r.userId?'已連結會員':'尚未連結會員'}</span>,actions:<RosterMoreMenu openLabel={canEdit?'編輯':'查看明細'} name={r.name} onOpen={()=>onEdit('technician',r)}/>}))} empty={<p className="p-6 text-center text-sm">沒有符合條件的人員。</p>}/>
 {pages>1&&<nav className="flex items-center justify-end gap-3 text-sm" aria-label="技師分頁"><button className="min-h-11 px-3" disabled={!current} onClick={()=>setPage(current-1)}>上一頁</button><span>{current+1}／{pages}</span><button className="min-h-11 px-3" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>下一頁</button></nav>}</section>;
}
