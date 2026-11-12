"use client";
import {useEffect,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {useRosterCustomerReader} from '@/components/admin/use-roster-customer-reader';
import {RightSheet} from '@/components/admin/right-sheet';
import {CustomerLabelsSeed} from '@/components/customer-labels';
import type {loadCourseRosterCustomer} from '@/server/actions/course-roster-customer';
import {CourseMemberWorkspaceEntry} from './member-workspace-entry';
import {CoursePurchaseIntentProvider} from './purchase-recovery';
const subscribeToClient=()=>()=>{};
const clientSnapshot=()=>true;
const serverSnapshot=()=>false;
export function RosterCustomerPanel({customer,sessionId,storeId,dataScope,revision,onClose}:{customer:{id:string;name:string;phone:string;cardId?:string};sessionId:string;storeId?:string;dataScope?:'operational'|'legacy';revision?:string;onClose:()=>void}){
 const clientReady=useSyncExternalStore(subscribeToClient,clientSnapshot,serverSnapshot);
 const reader=useRosterCustomerReader(sessionId,storeId,dataScope,revision);
 const [retry,setRetry]=useState(0);
 const key=JSON.stringify([customer.id,customer.cardId,sessionId,storeId,dataScope,revision]);
 const [response,setResponse]=useState<{key:string;value:Awaited<ReturnType<typeof loadCourseRosterCustomer>>}|null>(null);
 const readKey=JSON.stringify([customer.id,customer.cardId]);
 const result=response?.key===key?response.value:reader.get(readKey);
 useEffect(()=>{let active=true;reader.read(readKey).then(r=>{if(active)setResponse({key,value:r});}).catch(()=>{if(active)setResponse({key,value:{success:false,error:'讀取失敗，請重試'}});});return()=>{active=false;};},[reader,customer.id,customer.cardId,sessionId,storeId,dataScope,retry,key,readKey]);
 if(!clientReady)return null;
 // The roster's centered sheet transforms and clips its descendants. Mount
 // this overlay outside that frame while preserving its React providers.
 const content=result?.success?<CustomerLabelsSeed initial={result.data.labelSnapshot}><CoursePurchaseIntentProvider enabled={result.data.recoveryEnabled} storeId={result.data.storeId}><CourseMemberWorkspaceEntry {...result.data.workspaceProps} panelOnly initialCardId={customer.cardId} onPanelClose={onClose}/></CoursePurchaseIntentProvider></CustomerLabelsSeed>:<RightSheet open onClose={onClose} width={customer.cardId?640:880} presentation="centered" labelledById="roster-student-title"><div className="flex items-center justify-between border-b border-earth-200 p-4"><h2 id="roster-student-title">{customer.name}</h2><button className="min-h-11 px-3" onClick={onClose}>關閉</button></div><div className="space-y-3 p-4"><p>{customer.phone}</p>{result&&!result.success?<p role="alert">{result.error}<button type="button" className="min-h-11 px-3" onClick={()=>{reader.invalidate(readKey);setResponse(null);setRetry(n=>n+1);}}>重試</button></p>:<p role="status">讀取學員資料中…</p>}</div></RightSheet>;
 return createPortal(content,document.body);
}
