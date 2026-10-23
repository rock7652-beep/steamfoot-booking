"use client";
import {useMemo} from 'react';
import {BeautyPortal} from './portal';
import type {BeautyPortalData} from '@/server/beauty/queries';
import type {BeautyPreviewSource} from './preview-source';
import type {FrontendPreviewSelection} from '@/server/services/frontend-preview';
export function BeautyPreviewPortal({data,selection,memberId,technicianId,view}:{data:BeautyPortalData;selection:FrontendPreviewSelection;memberId:string|null;technicianId:string|null;view?:string}){
 const source=useMemo<BeautyPreviewSource>(()=>{
  async function read<T>(kind:string,input:unknown):Promise<T>{
   const response=await fetch('/api/beauty/preview-details?'+new URLSearchParams({...selection,kind,input:JSON.stringify(input)}),{cache:'no-store',credentials:'same-origin'});
   const result=await response.json();if(typeof result?.success!=='boolean'||!response.ok&&result.success)throw Error('讀取失敗');return result as T;
  }
  return {selection,memberId,technicianId,history:card=>read('history',card),income:month=>read('income',month),records:input=>read('records',input),health:()=>read('health',null),slots:(_mode,_slug,input)=>read('slots',input)};
 },[selection,memberId,technicianId]);
 return <BeautyPortal data={data} initialView={view} preview={source}/>;
}
