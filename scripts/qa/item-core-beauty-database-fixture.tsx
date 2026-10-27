import {createRoot} from 'react-dom/client';
import {useCallback,useEffect,useState} from 'react';
import {OperationScope} from '../../src/components/operations/operation-scope';
import {BeautyNativeRoster} from '../../src/components/beauty/native-roster-source';
import {BeautyNativeCustomerWorkspace} from '../../src/components/beauty/native-customer-source';
import type {BeautyDashboardData} from '../../src/server/beauty/queries';
import type {CourseRosterData} from '../../src/app/(dashboard)/dashboard/courses/roster-source';
import '../../src/app/globals.css';

window.qaAction=async(name,...args)=>{const response=await fetch('/__qa/item-core',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})});return response.json();};
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=new URL(String(input),location.href);
 if(url.pathname==='/api/beauty/roster')return new Response(JSON.stringify(await window.qaAction('beautyRoster')),{headers:{'Content-Type':'application/json'}});
 if(url.pathname==='/api/beauty/customer-read')return new Response(JSON.stringify(await window.qaAction('beautyCustomerRead',JSON.parse(String(init?.body??'{}')))),{headers:{'Content-Type':'application/json'}});
 return originalFetch(input,init);
};
type Snapshot={dashboard:BeautyDashboardData;roster:CourseRosterData;bookingId:string;customerId:string};
const initial=await window.qaAction('beautySnapshot') as Snapshot;
function Fixture(){
 const [state,setState]=useState(initial),[purchase,setPurchase]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=useCallback(async()=>setState(await window.qaAction('beautySnapshot') as Snapshot),[]);
 useEffect(()=>{const changed=()=>{setPurchase(false);void refresh();};window.addEventListener('customer-search-invalidated',changed);return()=>window.removeEventListener('customer-search-invalidated',changed);},[refresh]);
 const attendance=useCallback(async(id:string,revision:number,choice:string)=>{setBusy(true);try{const result=await window.qaAction('beautyAttendance',{id,revision,choice}) as {success:boolean;error?:string};if(!result.success)throw Error(result.error);await refresh();}catch(error){setError(error instanceof Error?error.message:'Failed');}finally{setBusy(false);}},[refresh]);
 const money=useCallback((kind:string)=>{if(kind==='card')setPurchase(true);else throw Error('Unexpected payment mode');},[]);
 return <OperationScope scope="isolated-beauty-item-db"><main className="min-w-0 p-3"><p>美業隔離資料庫流程・固定測試身分，非正式站登入</p>{error&&<p role="alert">{error}</p>}<BeautyNativeRoster data={state.dashboard} bookingId={state.bookingId} readOnly={false} busy={busy} onBusyChange={setBusy} onAttendance={attendance} onStatus={()=>{}} onMoney={money} onCustomer={()=>{}} suspended={purchase} snapshot={{sessionId:`booking:${state.bookingId}`,data:state.roster}}/>{purchase&&<BeautyNativeCustomerWorkspace data={state.dashboard} customerId={state.customerId} initialAction="assign" panelOnly onClose={()=>setPurchase(false)}/>}</main></OperationScope>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
