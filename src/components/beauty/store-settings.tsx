"use client";
import {useState} from 'react';
import {SettingsListRow} from '@/components/settings';
import {CourseSettingsSectionEditor} from '@/app/(dashboard)/dashboard/courses/settings-section-editor';
import {useCourseDraftGuard} from '@/components/admin/use-course-draft-guard';
import type {CourseSettingsSectionInput} from '@/lib/course-settings-sections';
export function BeautyStoreSettings({storeId,initial,canEdit}:{storeId:string;initial:Extract<CourseSettingsSectionInput,{section:'store'}>;canEdit:boolean}){
 const [value,setValue]=useState(initial),[open,setOpen]=useState(false),[dirty,setDirty]=useState(false),[pending,setPending]=useState(false);
 useCourseDraftGuard(dirty,pending);
 return <SettingsListRow title="店家資料" summary={value.name+(value.address?'・地址已設定':'・地址未設定')} expanded={open} onEdit={canEdit?()=>setOpen(v=>!v):undefined}>{canEdit?<CourseSettingsSectionEditor savePath="/api/beauty/settings/store" storeId={storeId} initial={value} onStatus={(_,d,p)=>{setDirty(d);setPending(p);}} onSaved={row=>{if(row.section==='store')setValue(row);setDirty(false);setOpen(false);}}/>:<dl className="space-y-2 text-sm"><dt>店家名稱</dt><dd>{value.name}</dd><dt>電話／地址</dt><dd>{value.shopPhone||'未填寫'}／{value.address||'未填寫'}</dd></dl>}</SettingsListRow>;
}
