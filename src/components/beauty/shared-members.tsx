"use client";
import {useState,type ReactNode} from 'react';
/** Keep authorizations available without turning the customer overview into a form. */
export function BeautySharedMembers({customers,ownerId,memberIds=[],disabled=false,title="管理共用成員",children}:{customers:{id:string;name:string}[];ownerId:string;memberIds?:string[];disabled?:boolean;title?:string;children?:ReactNode}){
 const [search,setSearch]=useState('');
 return <details className="rounded-lg border border-earth-200 px-3 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium text-primary-800">{title}</summary><div className="space-y-2 pb-3"><input aria-label="搜尋共用成員" placeholder="搜尋姓名" className="min-h-11 w-full rounded-lg border px-3" value={search} onChange={e=>setSearch(e.target.value)} disabled={disabled}/><input type="hidden" name="memberIds" value={ownerId}/><fieldset disabled={disabled} className="max-h-60 overflow-y-auto">{customers.filter(p=>p.id!==ownerId).map(p=><label hidden={!p.name.includes(search)} className="min-h-11 items-center gap-2 py-2 has-[input:checked]:text-primary-800" style={{display:p.name.includes(search)?'flex':'none'}} key={p.id}><input name="memberIds" type="checkbox" value={p.id} defaultChecked={memberIds.includes(p.id)}/>{p.name}</label>)}</fieldset>{children}</div></details>;
}
