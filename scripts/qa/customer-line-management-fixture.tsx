// Synthetic component acceptance; never connects to auth, LINE or a database.
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/app/globals.css';
import { LineBindingSection } from '../../src/app/(dashboard)/dashboard/customers/[id]/line-binding-section';
function Fixture() {
  const [status,setStatus]=useState('LINKED');
  const [request,setRequest]=useState<null|{id:string;status:string;capturedAt:null;expiresAt:string;userIdHashPrefix:null}>(null);
  useEffect(() => { Object.assign(window,{__lineChanged:(action:string)=>{if(action==='unlink'){setStatus('UNLINKED');setRequest(null);}if(action==='create')setRequest({id:'qa-request',status:'PENDING_CAPTURE',capturedAt:null,expiresAt:new Date(Date.now()+900000).toISOString(),userIdHashPrefix:null});if(action==='execute'){setStatus('LINKED');setRequest(null);}},__lineCapture:()=>setRequest({id:'qa-request',status:'CANDIDATE_CAPTURED',capturedAt:null,expiresAt:new Date(Date.now()+900000).toISOString(),userIdHashPrefix:null})}); return () => { Reflect.deleteProperty(window,'__lineChanged'); Reflect.deleteProperty(window,'__lineCapture'); }; }, []);
  return <main className="mx-auto min-h-screen max-w-[560px] bg-white p-4 text-earth-800"><h1 className="text-xl font-semibold">顧客詳情 · 合成驗收資料</h1><p className="break-words py-3">長姓名顧客與門市資料測試：不含任何真實顧客個資</p><LineBindingSection compact customerId="qa-customer" lineLinkStatus={status} lineUserId={status==='LINKED'?'private':null} lineLinkedAt={null} lineBindingCode={null} lineBindingCodeCreatedAt={null} canManageLineRebind canRunLineRebindDryRun activeLineRebindRequest={request} onUpdated={()=>{}} /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
