"use client";
import {Fragment,type HTMLAttributes,type ReactNode} from 'react';

export type CourseStaffDisplayRow={
 id:string;name:string;phone:string|null;email:string|null;active:boolean;
 onOpen:()=>void;beforeName?:ReactNode;afterName?:ReactNode;
 identity:ReactNode;notifications:ReactNode;actions:ReactNode;
 rowProps?:HTMLAttributes<HTMLTableRowElement>&{"data-course-order"?:string;"data-row-id"?:string};
};
/** Original music/sports personnel table. Modules supply records and guarded actions. */
export function CourseStaffList({rows,music=false,inactiveCount=0,inactiveForced=false,inactiveExpanded=true,onToggleInactive,footer,empty}:{
 rows:CourseStaffDisplayRow[];music?:boolean;inactiveCount?:number;inactiveForced?:boolean;inactiveExpanded?:boolean;
 onToggleInactive?:()=>void;footer?:ReactNode;empty?:ReactNode;
}){
 const inactiveRow=<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={5} className="px-3 py-2"><button type="button" disabled={inactiveForced} className="flex min-h-9 w-full items-center justify-between text-left font-medium text-earth-600 disabled:cursor-default" onClick={onToggleInactive}><span>停用人員（{inactiveCount}）</span><span>{inactiveForced?'篩選結果':inactiveExpanded?'收合':'展開'}</span></button></td></tr>;
 return <><div className="overflow-x-auto rounded-xl border border-earth-200 bg-white"><table className="min-w-[720px] w-full text-left text-sm"><thead className="bg-earth-50"><tr>{['姓名','聯絡方式','身分','LINE／通知','操作'].map(title=><th key={title} className={`px-3 py-2 font-medium ${!music?({'姓名':'w-[20%]','電話':'w-[16%]','E-mail':'w-[28%]','身分':'w-[18%]','系統通知':'w-[12%]'} as Record<string,string>)[title]??'':''} whitespace-nowrap ${title==='操作'?'w-[72px] min-w-[72px] max-w-[72px] text-center':''}`}>{title}</th>)}</tr></thead>
 <tbody className="divide-y divide-earth-100">{rows.map((row,index)=><Fragment key={row.id}>{onToggleInactive&&!row.active&&(index===0||rows[index-1]?.active)&&inactiveRow}<tr {...row.rowProps} className={row.active?'':'bg-earth-50/80 text-earth-400'}>
 <td className="whitespace-nowrap px-3 py-2">{row.beforeName}<button type="button" className="min-h-11 font-medium text-primary-900 hover:underline" onClick={row.onOpen}>{row.name}</button>{row.afterName}</td>
 <td className="px-3 py-2"><a className="block min-h-11 whitespace-nowrap text-primary-800 hover:underline" href={row.phone?`tel:${row.phone}`:undefined}>{row.phone||'—'}</a><span className="block max-w-64 break-words text-earth-600">{row.email||''}</span></td>
 <td className="px-3 py-2"><div className="flex flex-wrap items-center gap-x-3">{row.identity}</div></td><td className="px-3 py-2">{row.notifications}</td><td className="whitespace-nowrap px-3 py-2 text-center">{row.actions}</td>
 </tr></Fragment>)}{onToggleInactive&&!inactiveExpanded&&inactiveCount>0&&inactiveRow}</tbody></table>{!rows.length&&empty}</div>{footer}</>;
}
