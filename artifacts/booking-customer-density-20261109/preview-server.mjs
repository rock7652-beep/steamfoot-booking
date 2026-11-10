import {createServer} from 'vite';
import reactPlugin from '@vitejs/plugin-react';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,existsSync} from 'node:fs';
const evidence=dirname(fileURLToPath(import.meta.url)),repo=resolve(evidence,'../..'),root=resolve(evidence,'preview');
const react=`import React from 'react';`;
const emptyComponents={
 '@/components/customer-labels':['CustomerLabels'],
 '@/components/admin/store-member-connection-panel':['StoreMemberConnectionPanel'],
 '@/components/customer-attribution-form':['CustomerAttributionForm'],
 '@/components/add-ons/steamfoot-participant':['SteamfootParticipantAddOns'],
 '@/app/(dashboard)/dashboard/customers/[id]/assign-plan-form':['AssignPlanForm'],
 '@/app/(dashboard)/dashboard/customers/[id]/create-booking-form':['CreateBookingForm'],
 '@/app/(dashboard)/dashboard/customers/[id]/edit/edit-customer-form':['EditCustomerForm'],
 '@/app/(dashboard)/dashboard/customers/[id]/adjust-wallet-form':['AdjustWalletForm'],
 '@/app/(dashboard)/dashboard/customers/[id]/extend-wallet-expiry-form':['ExtendWalletExpiryForm'],
 '@/app/(dashboard)/dashboard/customers/[id]/backfill-used-sessions-form':['BackfillUsedSessionsForm'],
 '@/app/(dashboard)/dashboard/customers/_components/customer-panel-advanced':['CustomerPanelAdvanced'],
 '@/app/(dashboard)/dashboard/customers/_components/customer-panel-sessions':['CustomerPanelSessions'],
 '@/components/admin/steam-plan-close':['SteamPlanClose'],
 '@/app/(dashboard)/dashboard/bookings/booking-companion-editor':['BookingCompanionEditor','CompanionSlot'],
};
const virtual={
 'next/navigation':`export const useRouter=()=>({refresh(){},push(){},replace(){}});export const usePathname=()=>'/dashboard/bookings';export const useSearchParams=()=>new URLSearchParams();`,
 'next/link':`${react} export const useLinkStatus=()=>({pending:false});export default function Link({children,...p}){return React.createElement('a',p,children)}`,
 'next/dynamic':`export default ()=>()=>null;`,
 '@/components/operations/operation-scope':`${react} export const useRetainedState=(key,value)=>React.useState(value);`,
 '@/components/operations/panel-read-cache':`${react} export const usePanelReader=(resource,fn)=>React.useMemo(()=>({read:fn,invalidate(){}}),[fn]);`,
 '@/components/customer-detail-fields':`${react} export const CustomerPhoneLink=({phone})=>React.createElement('span',null,phone);`,
 '@/server/actions/customer-panel-records':`export async function getCustomerPanelRecords(id,kind,page){return {success:true,data:{page,hasMore:page<2,rows:Array.from({length:20},(_,i)=>({id:kind+page+i,date:'2026-11-'+String(20-i).padStart(2,'0'),label:kind==='bookings'?'15:00 · 方案扣堂 · 1 人':'10 堂方案',status:i===3?'CANCELLED':'COMPLETED',...(kind==='consumption'?{amount:2990}:{}),note:i===3?'顧客取消':null}))}}}`,
 '@/server/actions/booking-customer-profile':`export async function getBookingCustomerProfile(id){return {success:true,data:{id,name:id,phone:'0900000000',serviceNote:null,bookings:[],wallets:id==='primary'?[{id:'w1',name:'10 堂方案',remainingSessions:8,totalSessions:10,expiryDate:'2027-03-25'}]:[]}}}`,
 '@/server/actions/customer-panel-summary':`export async function getCustomerPanelSummary(){return {success:true,data:{next:{date:'2026-11-13',time:'15:00'},pending:[],healthEnabled:true,health:null}}}`,
};
for(const[k,names]of Object.entries(emptyComponents))virtual[k]=names.map(n=>`export const ${n}=()=>null;`).join('\n');
virtual['@/app/(dashboard)/dashboard/customers/[id]/assign-plan-form']=`${react} export function AssignPlanForm({customerId,onSuccess,onPendingChange}){return React.createElement('button',{className:'min-h-11 rounded bg-primary-700 px-3 text-white',onClick(){onPendingChange?.(true);window.fixturePurchased=customerId;window.dispatchEvent(new CustomEvent('customer-plan-assigned',{detail:{customerId,pendingPayment:false}}));onPendingChange?.(false);onSuccess?.();}},'模擬購買 10 堂方案');}`;
virtual['@/server/actions/booking-participants']=`export async function collectBookingParticipantTrial(){return {success:true}} export async function completeBookingParticipantPlan(){throw Error('預覽不支援扣堂')} export async function changeBookingParticipantService(){throw Error('預覽不支援變更')} export async function resolveBookingParticipant(){throw Error('預覽不支援變更')} export async function removeBookingParticipant(){throw Error('預覽不支援變更')} export async function restoreBookingParticipant(){throw Error('預覽不支援變更')}`;
virtual['@/server/actions/booking-customer-profile']=`export async function getBookingCustomerProfile(id){return {success:true,data:{id,name:id,phone:'0900000000',serviceNote:null,bookings:[],wallets:window.fixturePurchased===id?[{id:'new-wallet',name:'10 堂方案',remainingSessions:10,totalSessions:10,expiryDate:null}]:id==='primary'?[{id:'w1',name:'10 堂方案',remainingSessions:8,totalSessions:10,expiryDate:'2027-03-25'}]:[]}}}`;
const plugin={name:'isolated-native-ui-fixture',enforce:'pre',resolveId(id,importer){
 if(id in virtual||id==='server-only'||id.startsWith('@/server/actions/'))return '\0fixture:'+id;
 // Resolve relative imports of replaced modules to the same fixture.
 if(importer&&id.startsWith('.')){const target=new URL(id,'file://'+importer).pathname.replace(/\.(tsx?|jsx?)$/,'');const key='@/'+target.slice((repo+'/src/').length);if(key in virtual)return '\0fixture:'+key;}
 if(id.startsWith('@/'))return repo+'/src/'+id.slice(2)+(['.ts','.tsx','.js','.mjs'].find(ext=>existsSync(repo+'/src/'+id.slice(2)+ext))??'');
 },load(id){if(!id.startsWith('\0fixture:'))return;const key=id.slice(9);if(key==='server-only')return '';if(key in virtual)return virtual[key];
 if(key.startsWith('@/server/actions/')){const path=repo+'/src/'+key.slice(2)+'.ts';const src=existsSync(path)?readFileSync(path,'utf8'):'';const names=[...src.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(x=>x[1]);return [...new Set(names)].map(n=>`export async function ${n}(){throw new Error('本機介面預覽禁止交易：${n}');}`).join('\n');}
 }};
const server=await createServer({root,configFile:false,plugins:[plugin,reactPlugin()],resolve:{alias:{react:resolve(repo,'node_modules/react'),'react-dom':resolve(repo,'node_modules/react-dom')}},server:{host:'127.0.0.1',port:5198,strictPort:true,fs:{allow:[root,repo,resolve(repo,'node_modules')]}},css:{postcss:repo+'/postcss.config.mjs'}});
await server.listen();console.log('LOCAL_PREVIEW_READY http://127.0.0.1:5198');
