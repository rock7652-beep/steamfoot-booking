"use client";
import {useState} from 'react';
import {DataTable} from '@/components/desktop';
import {RightSheet} from '@/components/admin/right-sheet';
import {formatTWDateTime} from '@/lib/date-utils';
import type {BeautyDashboardData} from '@/server/beauty/queries';
export function BeautyFeeSummary({data}:{data:BeautyDashboardData}){
 const [selected,setSelected]=useState<string|null>(null),lines=data.report?.lines??[];
 const rows=[...new Set(lines.map(l=>l.technicianId))].map(id=>({id,name:data.techs.find(t=>t.id===id)?.name??'技師',count:lines.filter(l=>l.technicianId===id).length,total:lines.filter(l=>l.technicianId===id).reduce((n,l)=>n+l.fee,0)}));
 return <><DataTable rows={rows} rowKey={r=>r.id} columns={[{key:'name',header:'技師',accessor:r=><button className="min-h-11 text-primary-800" onClick={()=>setSelected(r.id)}>{r.name}</button>},{key:'count',header:'服務筆數',accessor:r=>r.count},{key:'total',header:'拆帳合計',align:'right',accessor:r=>'NT$ '+r.total.toLocaleString('zh-TW')},{key:'detail',header:'明細',accessor:r=><button className="min-h-11 text-primary-800" onClick={()=>setSelected(r.id)}>查看明細</button>}]}/>{selected&&<RightSheet open presentation="centered" width={960} labelledById="beauty-fee-detail-title" onClose={()=>setSelected(null)}><div className="min-h-0 space-y-3 overflow-auto p-4"><header className="flex items-center justify-between"><h2 id="beauty-fee-detail-title">{rows.find(r=>r.id===selected)?.name} · {data.month} 拆帳明細</h2><button className="min-h-11 px-3" onClick={()=>setSelected(null)}>關閉</button></header><DataTable rows={lines.filter(l=>l.technicianId===selected)} rowKey={l=>l.id} columns={[{key:'date',header:'服務時間',accessor:l=>formatTWDateTime(new Date(l.date))},{key:'name',header:'顧客',accessor:l=>l.personName},{key:'service',header:'服務',accessor:l=>l.serviceName},{key:'fee',header:'拆帳金額',align:'right',accessor:l=>'NT$ '+l.fee.toLocaleString('zh-TW')}]}/></div></RightSheet>}</>;
}
