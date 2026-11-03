// Synthetic performance fixture only. Uses the product component, never application credentials.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StoreNoticeBell} from '../../src/components/admin/store-notice-bell';
import '../../src/app/globals.css';
const params=new URLSearchParams(location.search),namespace=(params.get('module')??'steamfoot') as 'steamfoot'|'course'|'beauty';
const size=Number(params.get('size')),delay=Number(params.get('delay'));
type Call={operation:string;start:number;end?:number;server?:unknown;ids?:string[];history?:boolean};
const qa=window as typeof window&{__speedCalls:Call[];__speedReset?:()=>Promise<void>;__speedTargetId?:string};qa.__speedCalls=[];
localStorage.setItem(`${namespace}-notice-sound:qa`,'off');
async function request(operation:string,input:unknown){
 const call:Call={operation,start:performance.now()};qa.__speedCalls.push(call);
 const response=await fetch(`/qa/${operation}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({namespace,size,delay,input})});
 const body=await response.json();call.end=performance.now();call.server=body.server;
 if(!response.ok)throw Error(body.error??'QA request failed');if(operation==='read'&&body.result.success){call.ids=body.result.items.map((r:{id:string})=>r.id);call.history=!!(input as {handled:boolean}).handled;if(!call.history&&call.ids?.length)qa.__speedTargetId=call.ids[0];}return body.result;
}
function Fixture(){
 const [run,setRun]=useState(0);
 qa.__speedReset=async()=>{await request('reset',{});qa.__speedCalls=[];setRun(v=>v+1);};
 return <main className="min-h-screen bg-earth-50"><header className="flex items-center justify-between border-b bg-white px-4 py-2"><span>合成測速：{namespace}／{size} 筆</span><StoreNoticeBell key={run} namespace={namespace} storeId="qa" initialEnabled initialSummary={{storeId:'qa',count:size,latestAt:null}} loadNotices={input=>request('read',input)} markNotice={input=>request('mark',input)} markAllNotices={input=>request('all',input)}/></header></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
