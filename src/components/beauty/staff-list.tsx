"use client";
import {useState} from 'react';
import {DataTable} from '@/components/desktop';
import {RosterToolbar} from '@/components/admin/roster-primitives';
import type {StaffWorkspacePerson} from '@/app/(dashboard)/dashboard/staff/staff-workspace';
export function BeautyStaffList({people,canManage,onOpen,onCreate}:{people:readonly StaffWorkspacePerson[];canManage:boolean;onOpen:(id:string)=>void;onCreate:()=>void}){
 const [search,setSearch]=useState(''),[status,setStatus]=useState('ACTIVE');
 const rows=people.filter(p=>(status==='all'||p.status===status)&&[p.displayName,p.phone,p.email].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 return <section className="space-y-2"><RosterToolbar label="人員搜尋與篩選"><input aria-label="搜尋人員" placeholder="搜尋姓名、電話或 Email" className="min-h-11 rounded-lg border px-3 text-sm" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="篩選人員狀態" className="min-h-11 rounded-lg border px-3 text-sm" value={status} onChange={e=>setStatus(e.target.value)}><option value="ACTIVE">啟用中</option><option value="INACTIVE">已停用</option><option value="all">全部狀態</option></select><span className="text-sm text-earth-500">共 {rows.length} 位</span>{canManage&&<button className="ml-auto min-h-11 rounded-lg bg-primary-700 px-3 text-sm text-white" onClick={onCreate}>＋新增人員</button>}</RosterToolbar><DataTable rows={rows} rowKey={p=>p.id} columns={[{key:'name',header:'姓名',accessor:p=><button className="min-h-11 text-primary-800" onClick={()=>onOpen(p.id)}>{p.displayName}</button>},{key:'role',header:'後台角色',accessor:p=>p.roleLabel},{key:'phone',header:'電話',accessor:p=>p.phone||'—'},{key:'email',header:'登入 Email',accessor:p=>p.email},{key:'status',header:'狀態',accessor:p=>p.status==='ACTIVE'?'啟用中':'已停用'},{key:'edit',header:'操作',accessor:p=><button className="min-h-11 text-primary-800" onClick={()=>onOpen(p.id)}>{p.canEdit?'編輯資料／權限':'查看明細'}</button>}]}/></section>;
}
