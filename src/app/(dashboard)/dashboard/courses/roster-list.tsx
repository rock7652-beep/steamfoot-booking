"use client";
import type {ReactNode,MouseEvent} from 'react';
import {CustomerListIdentity} from '@/components/customer-list-identity';
import {rosterRowClassName,rosterStatusButtonClassName} from '@/components/admin/roster-primitives';
import styles from './sports-roster.module.css';

export type CourseRosterDisplayRow={
 id:string;name:string;phone:string|null;owner:string;status:string;mark:'pending'|'attended'|'deducted'|'leave'|'cancelled';
 statusTitle:string;statusDisabled:boolean;onStatus:(event:MouseEvent<HTMLButtonElement>)=>void;onOpen:()=>void;
 selected?:boolean;onSelect?:(checked:boolean)=>void;selectionDisabled?:boolean;
 pending?:boolean;expanded?:ReactNode;
 badge?:ReactNode;context?:ReactNode;feedback?:ReactNode;cost:ReactNode;balance:ReactNode;balanceWarning?:boolean;
 reminders:ReactNode;onMore?:(event:MouseEvent<HTMLButtonElement>)=>void;moreOpen?:boolean;actions?:ReactNode;
};
/** The existing sports roster, shared by every module. Business adapters supply values and actions. */
export function CourseRosterList({rows,empty,footer,labels={},disabled=false}:{disabled?:boolean;rows:CourseRosterDisplayRow[];empty:string;footer?:ReactNode;labels?:{identity?:string;owner?:string;cost?:string;balance?:string;balanceDescription?:string;scroll?:string}}){
 return <div className={`${styles.root} min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl border border-earth-200 [overflow-anchor:none]`} aria-label={labels.scroll??'學員名單捲動區'} tabIndex={0}>
  <div className={`${styles.header} sticky top-0 z-10 bg-earth-50 py-2 text-xs font-medium text-earth-600`}><span>{labels.identity??'學員／電話'}</span><span className={styles.ownerColumn}>{labels.owner??'所屬店長'}</span><span className="text-center">{labels.cost??'本堂點數'}</span><span className="whitespace-nowrap text-center" title={labels.balanceDescription}>{labels.balance??'課後剩餘'}{labels.balanceDescription&&<span className="sr-only">：{labels.balanceDescription}</span>}</span><span className={styles.notesHeading}>標籤／備註</span><span/></div>
  <ul inert={disabled} className={`${styles.list} divide-y divide-earth-100`}>{rows.map(row=><li key={row.id} aria-busy={row.pending} className={`relative z-0 ${styles.row} ${rosterRowClassName}`}>
   <div className={`${styles.identity} flex min-w-0 items-center gap-1`}>
    {row.onSelect&&<input type="checkbox" aria-label={`選取 ${row.name}`} checked={row.selected??false} disabled={row.selectionDisabled} onChange={event=>row.onSelect?.(event.target.checked)}/>}
    <button type="button" className={rosterStatusButtonClassName} aria-label={`${row.name}：${row.status}`} title={row.statusTitle} disabled={row.statusDisabled||row.pending} data-roster-action-trigger onClick={row.onStatus}><span aria-hidden="true" className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 ${row.mark==='attended'?'border-primary-700 bg-primary-700 text-white':row.mark==='deducted'?'border-amber-600 text-amber-700':row.mark==='leave'?'border-earth-400 text-earth-600':'border-earth-400'}`}>{row.pending?'…':row.mark==='attended'?'✓':row.mark==='leave'||row.mark==='deducted'?'−':row.mark==='cancelled'?'×':''}</span></button>
    <div className="min-w-0 flex-1"><CustomerListIdentity showLabels={false} name={<span data-roster-name-flow className="flex min-w-0 max-w-full flex-nowrap items-center gap-x-2"><button type="button" data-sports-roster-name className={`${styles.nameButton} relative z-20 h-11 min-h-11 min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-primary-600`} aria-label={`${row.name} 預約詳情`} onClick={row.onOpen}><span className="block w-full truncate">{row.name}</span><span className={styles.ownerInline} data-sports-roster-owner-inline>{row.owner||'未指定所屬店長'}</span></button>{row.context}{row.mark!=='pending'&&row.mark!=='attended'&&<span className={`min-w-0 truncate text-xs font-normal ${row.mark==='deducted'?'text-amber-700':'text-earth-600'}`}>{row.status}</span>}{row.badge}</span>} phone={row.phone}/>{row.feedback}{row.pending&&<span role="status" className="text-sm text-primary-800">處理中…</span>}</div>
   </div>
   <span className={`${styles.ownerColumn} text-xs text-earth-600`}>{row.owner}</span><span className={`${styles.pointColumn} text-center tabular-nums`}>{row.cost}</span><span className={`${styles.balanceColumn} text-center tabular-nums ${row.balanceWarning?'text-amber-700':''}`} title={labels.balanceDescription}>{row.balance}</span>{row.reminders}
   {row.onMore?<button type="button" className={`${styles.more} min-h-11 min-w-11 rounded text-earth-600 hover:bg-earth-100`} aria-label={`${row.name} 更多操作`} aria-expanded={row.moreOpen} data-roster-action-trigger onClick={row.onMore}>⋯</button>:row.actions&&<div className={styles.more}>{row.actions}</div>}
   {row.expanded&&<div className="col-span-full min-w-0 border-t border-earth-200 bg-primary-50/30" style={{gridColumn:"1 / -1"}}>{row.expanded}</div>}
  </li>)}{!rows.length&&<li className="p-8 text-center text-sm text-earth-500">{empty}</li>}</ul>{footer}
 </div>;
}
